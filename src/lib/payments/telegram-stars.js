import { agentLogger } from '../logger.js';
import { env } from '../../config/env.js';
import { query } from '../db.js';

const log = agentLogger('telegram-stars');

// Conservative conversion rate: 75 XTR per €1
// Telegram does not publish an official rate; update if pricing changes.
export const XTR_PER_EUR = 75;

/**
 * Convert a EUR amount to Telegram Stars (XTR), rounded up.
 */
export function eurToStars(amountEur) {
  return Math.ceil(amountEur * XTR_PER_EUR);
}

/**
 * Send a Telegram Stars invoice to a chat.
 *
 * @param {object} api - grammy bot API (bot.api or ctx.api)
 * @param {number} chatId
 * @param {{ title: string, description: string, amountEur: number, payload: string, businessConnectionId?: string }} invoice
 */
export async function sendStarsInvoice(api, chatId, { title, description, amountEur, payload, businessConnectionId }) {
  const stars = eurToStars(amountEur);

  log.info({ chat_id: chatId, stars, eur: amountEur, payload }, 'sending stars invoice');

  if (env.TEST_MODE) {
    log.info({ chat_id: chatId, stars, eur: amountEur, payload }, 'SKIPPED stars invoice (TEST_MODE)');
    try {
      await query(
        `INSERT INTO test_sent_messages (chat_id, kind, content, metadata) VALUES ($1, 'invoice', $2, $3)`,
        [chatId, `[invoice ${stars} XTR / ${amountEur}€] ${title} — ${description}`, { stars, amountEur, payload }],
      );
    } catch (err) {
      log.warn({ err: err.message }, 'test_sent_messages insert failed');
    }
    return { message_id: Math.floor(Math.random() * 1e9), test_mode: true };
  }

  const options = {
    business_connection_id: businessConnectionId,
  };

  return api.sendInvoice(
    chatId,
    title,
    description,
    payload,
    'XTR',
    [{ label: title, amount: stars }],
    options,
  );
}

/**
 * Answer a pre_checkout_query — must be called within 10 seconds.
 *
 * @param {object} api
 * @param {string} preCheckoutQueryId
 * @param {{ ok?: boolean, errorMessage?: string }} options
 */
export async function answerPreCheckout(api, preCheckoutQueryId, { ok = true, errorMessage } = {}) {
  return api.answerPreCheckoutQuery(preCheckoutQueryId, ok, {
    error_message: errorMessage,
  });
}

/**
 * Extract payment data from a message containing successful_payment.
 *
 * @param {object} message - Telegram message object
 * @returns {{ payload, stars, currency, telegramChargeId, providerChargeId }|null}
 */
export function parseSuccessfulPayment(message) {
  const sp = message?.successful_payment;
  if (!sp) return null;
  return {
    payload: sp.invoice_payload,
    stars: sp.total_amount,
    currency: sp.currency,
    telegramChargeId: sp.telegram_payment_charge_id,
    providerChargeId: sp.provider_payment_charge_id ?? null,
  };
}
