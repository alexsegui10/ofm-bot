import { agentLogger } from '../lib/logger.js';
import { query } from '../lib/db.js';
import { sendMessage } from '../lib/telegram.js';
import { startSextingSession, resolvePlaylistId } from './sexting-conductor.js';
import { verifyIpnSignature, PAID_STATUSES, FAILED_STATUSES } from '../lib/payments/nowpayments.js';
import { isEnabled as isPaypalEnabled } from '../lib/payments/paypal.js';
import { parseSuccessfulPayment } from '../lib/payments/telegram-stars.js';
import {
  createPendingBizum,
  getPendingBizum,
  getPendingUnnotifiedBizum,
  getMostRecentPendingBizum,
  notifyPartner,
  confirmBizum,
  denyBizum,
  autoApproveBizum,
  shouldAutoApprove,
} from '../lib/payments/bizum.js';
import { startBizumTimer, cancelBizumTimer } from '../lib/payments/bizum-timer.js';
import {
  createTransaction,
  confirmTransaction,
  confirmTransactionById,
  failTransaction,
  failTransactionById,
} from '../lib/transactions.js';

const log = agentLogger('payment-verifier');

// ─── NowPayments ──────────────────────────────────────────────────────────────

/**
 * Handle an inbound NowPayments IPN webhook (POST /webhook/nowpayments).
 * Verifies HMAC-SHA512 signature, then updates transaction status.
 */
export async function handleNowPaymentsWebhook(req, res) {
  const signature = req.headers['x-nowpayments-sig'];

  if (!verifyIpnSignature(req.body, signature)) {
    log.warn({ ip: req.ip }, 'nowpayments: invalid IPN signature — rejecting');
    return res.status(401).json({ error: 'invalid signature' });
  }

  const { payment_id, payment_status, order_id, actually_paid, pay_currency } = req.body;
  log.info({ payment_id, payment_status, order_id }, 'nowpayments IPN received');

  if (PAID_STATUSES.has(payment_status)) {
    const txn = await confirmTransaction(order_id, {
      nowpayments_payment_id: payment_id,
      actually_paid,
      pay_currency,
    });
    if (txn) {
      log.info({ order_id, payment_id, client_id: txn.client_id }, 'nowpayments: payment confirmed');
      await _maybeLaunchSextingSession(txn);
    } else {
      log.warn({ order_id }, 'nowpayments: transaction not found or already confirmed');
    }
  } else if (FAILED_STATUSES.has(payment_status)) {
    await failTransaction(order_id, payment_status);
    log.info({ order_id, payment_status }, 'nowpayments: payment failed/expired');
  } else {
    log.debug({ order_id, payment_status }, 'nowpayments: intermediate status, no action');
  }

  res.sendStatus(200);
}

// ─── PayPal ───────────────────────────────────────────────────────────────────

/**
 * Handle inbound PayPal webhook. Feature-flagged; accepts and discards while disabled.
 */
export async function handlePayPalWebhook(req, res) {
  if (!isPaypalEnabled()) {
    log.warn({ event_type: req.body?.event_type }, 'paypal webhook received but PayPal is disabled');
    return res.sendStatus(200);
  }
  // TODO: implement when PAYPAL_ENABLED=true
  log.warn('paypal webhook handler not yet implemented');
  res.sendStatus(200);
}

// ─── Telegram Stars ───────────────────────────────────────────────────────────

/**
 * Handle a successful_payment Telegram update (Stars).
 * The invoice payload = our transaction payment_id.
 */
export async function handleTelegramPayment(message, clientId) {
  const payment = parseSuccessfulPayment(message);
  if (!payment) {
    log.warn({ client_id: clientId }, 'handleTelegramPayment: no successful_payment found');
    return null;
  }

  log.info({ payload: payment.payload, stars: payment.stars, client_id: clientId }, 'stars payment received');

  const txn = await confirmTransaction(payment.payload, {
    telegram_charge_id: payment.telegramChargeId,
    stars_paid: payment.stars,
    currency: payment.currency,
  });

  if (txn) {
    log.info({ payload: payment.payload, transaction_id: txn.id }, 'stars payment confirmed');
    await _maybeLaunchSextingSession(txn);
  } else {
    log.warn({ payload: payment.payload }, 'stars payment: transaction not found or already confirmed');
  }

  return txn;
}

// ─── Bizum — initiation ───────────────────────────────────────────────────────

/**
 * Create a pending Bizum payment record and return the message to send the client
 * with the Bizum number and exact amount.
 *
 * Called by the Sales agent when client chooses Bizum as payment method.
 * Partner is NOT notified yet — only when client confirms they sent it.
 *
 * @param {{ clientId, amountEur, productType?, productId? }} params
 * @returns {Promise<{ bizumId: number, paymentId: string, message: string }>}
 */
export async function initiateBizumPayment({ clientId, amountEur, productType = null, productId = null }) {
  const paymentId = `bizum_${Date.now()}_${clientId}`;
  const txn = await createTransaction({ clientId, paymentId, method: 'bizum', amountEur, productType, productId });
  const pending = await createPendingBizum({ clientId, transactionId: txn.id, amountEur });

  log.info({ bizum_id: pending.id, client_id: clientId, amount_eur: amountEur }, 'bizum payment initiated');

  const message =
    `💸 Perfecto, hazme un Bizum de *${amountEur}€* al número:\n\n` +
    `📱 *+34 662 112 420*\n\n` +
    `Cuando lo hayas enviado, dímelo y lo confirmo enseguida 🙂`;

  return { bizumId: pending.id, paymentId, message };
}

// ─── Bizum — client confirms payment ─────────────────────────────────────────

/**
 * Called when the client says they have sent the Bizum.
 * Finds the pending (unnotified) Bizum for this client, notifies the partner,
 * and starts the 10-minute timer.
 *
 * @param {number} clientId
 * @param {number} chatId
 * @param {string} businessConnectionId
 * @param {object} client  Full client row (needs num_compras for auto-approve check at timer fire)
 * @returns {Promise<string|null>}  Response message for client, or null if no pending Bizum found
 */
export async function confirmBizumByClient(clientId, chatId, businessConnectionId, client) {
  const pending = await getPendingUnnotifiedBizum(clientId);
  if (!pending) {
    log.debug({ client_id: clientId }, 'confirmBizumByClient: no unnotified pending bizum found');
    return null;
  }

  const amountEur = parseFloat(pending.amount);

  await notifyPartner({
    bizumId: pending.id,
    clientId,
    amountEur,
    clientUsername: client.username,
  });

  startBizumTimer(pending.id, {
    clientId,
    chatId,
    businessConnectionId,
    amountEur,
  });

  log.info({ bizum_id: pending.id, client_id: clientId }, 'bizum client confirmation received, partner notified');

  // If auto-approve conditions already met: tell client we're verifying quickly
  if (shouldAutoApprove(client, amountEur)) {
    return '¡Gracias! Lo estoy verificando, en unos minutos te confirmo 🙂';
  }

  return '¡Gracias! Le he avisado a mi compañero para que lo confirme. En cuanto lo haga te mando el contenido 🔥';
}

// ─── Bizum — partner response (from Twilio WhatsApp) ─────────────────────────

// Natural-language patterns for partner's WhatsApp responses
// \b does not work after accented chars (í, ó) in JS — use (?:\s|$) boundary instead
const CONFIRM_PATTERN = /^(ok|s[íi]|sí|si|vale|confirmado|confirmada|perfecto|llegó|llego|recibido|ha llegado|pagado)(?:\s|$)/i;
const DENY_PATTERN    = /^(no ha llegado|no ha entrado|no llega|no recibido|denegar|denegado|no)(?:\s|$)/i;

/**
 * Handle an inbound Twilio WhatsApp message from the partner for Bizum confirmation.
 *
 * Supports:
 *   - Explicit: /confirmar <id>  /denegar <id>
 *   - Natural:  "ok" / "si"  →  most-recent pending Bizum
 *               "no ha llegado"  →  most-recent pending Bizum
 *
 * On confirmation/denial: cancels the active timer and sends message to client.
 *
 * @param {string} messageBody
 * @returns {Promise<{ action: string, bizumId: number|null, txn?: object|null }|null>}
 */
export async function handleBizumConfirmation(messageBody) {
  const body = (messageBody ?? '').trim();

  // ── Resolve bizumId and action ─────────────────────────────────────────────
  const explicitConfirm = body.match(/^\/confirmar\s+(\d+)/i);
  const explicitDeny    = body.match(/^\/denegar\s+(\d+)/i);

  let bizumId = null;
  let isConfirm = false;

  if (explicitConfirm || explicitDeny) {
    bizumId = parseInt((explicitConfirm ?? explicitDeny)[1], 10);
    isConfirm = !!explicitConfirm;
  } else if (CONFIRM_PATTERN.test(body)) {
    isConfirm = true;
  } else if (DENY_PATTERN.test(body)) {
    isConfirm = false;
  } else {
    log.debug({ body: body.slice(0, 60) }, 'bizum: not a confirmation command');
    return null;
  }

  // ── Look up the pending record ────────────────────────────────────────────
  const pending = bizumId !== null
    ? await getPendingBizum(bizumId)
    : await getMostRecentPendingBizum();

  if (!pending) {
    log.warn({ bizumId }, 'bizum: no pending record found');
    return { action: 'not_found', bizumId };
  }

  bizumId = pending.id; // in case we resolved via getMostRecentPendingBizum

  if (pending.status !== 'pending') {
    log.warn({ bizumId, status: pending.status }, 'bizum: already processed');
    return { action: 'already_processed', bizumId };
  }

  // ── Cancel the active timer ───────────────────────────────────────────────
  cancelBizumTimer(bizumId);

  // ── Apply action ──────────────────────────────────────────────────────────
  const clientMsg = await _getClientRow(pending.client_id);

  if (isConfirm) {
    await confirmBizum(bizumId);
    const txn = pending.transaction_id
      ? await confirmTransactionById(pending.transaction_id, { bizum_confirmed_at: new Date().toISOString() })
      : null;

    log.info({ bizumId, txn_id: txn?.id ?? null }, 'bizum confirmed by partner');
    await _notifyClient(clientMsg, '✅ ¡Pago confirmado! Mi compañero ya lo ha verificado, ahora mismo te mando el contenido 🔥');
    await _maybeLaunchSextingSession(txn);
    return { action: 'confirmed', bizumId, txn };
  } else {
    await denyBizum(bizumId, 'denied_by_partner');
    if (pending.transaction_id) await failTransactionById(pending.transaction_id, 'denied_by_partner');

    log.info({ bizumId }, 'bizum denied by partner');
    await _notifyClient(clientMsg, '😕 Vaya, no me ha llegado el Bizum. ¿Puedes comprobarlo? Si hay algún problema dímelo y lo solucionamos.');
    return { action: 'denied', bizumId, txn: null };
  }
}

// ─── Sexting post-payment kick-off ────────────────────────────────────────────

/**
 * If the confirmed transaction is for a sexting product, start the Conductor.
 * Fetches client row for chatId + businessConnectionId.
 */
async function _maybeLaunchSextingSession(txn) {
  if (!txn || txn.product_type !== 'sexting') return;

  const clientRow = await _getClientRow(txn.client_id);
  if (!clientRow) {
    log.warn({ txn_id: txn.id }, 'sexting: client not found — cannot start session');
    return;
  }

  try {
    const { sessionId } = await startSextingSession({
      transactionId: txn.id,
      clientId: txn.client_id,
      chatId: Number(clientRow.telegram_user_id),
      businessConnectionId: clientRow.business_connection_id,
      productId: txn.product_id ?? null,
    });
    log.info({ txn_id: txn.id, session_id: sessionId }, 'sexting: session launched after payment');
  } catch (err) {
    log.error({ err, txn_id: txn.id }, 'sexting: failed to launch session');
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function _getClientRow(clientId) {
  const { rows } = await query(
    'SELECT telegram_user_id, business_connection_id FROM clients WHERE id = $1',
    [clientId],
  );
  return rows[0] ?? null;
}

async function _notifyClient(clientRow, message) {
  if (!clientRow) return;
  try {
    await sendMessage(
      clientRow.business_connection_id,
      Number(clientRow.telegram_user_id),
      message,
    );
  } catch (err) {
    log.warn({ err }, 'bizum: failed to notify client');
  }
}
