import { query } from '../db.js';
import { sendMessage } from '../telegram.js';
import { sendWhatsAppToPartner } from '../twilio.js';
import { agentLogger } from '../logger.js';
import { shouldAutoApprove, getPendingBizum, autoApproveBizum, BIZUM_EXPIRY_MINUTES } from './bizum.js';
import { confirmTransactionById } from '../transactions.js';

const log = agentLogger('bizum-timer');

// In-memory map of active timers: bizumId → NodeJS.Timeout
const timers = new Map();

/**
 * Start the 10-minute Bizum window for a pending confirmation.
 * On fire:
 *   - auto-approve conditions met → approve + notify partner + message client
 *   - otherwise → message client "mi compañero tarda"
 *
 * @param {number} bizumId
 * @param {{ clientId: number, chatId: number, businessConnectionId: string, amountEur: number }} context
 */
export function startBizumTimer(bizumId, context) {
  cancelBizumTimer(bizumId); // clear any pre-existing timer for this id
  const ms = BIZUM_EXPIRY_MINUTES * 60 * 1000;
  const timeout = setTimeout(() => onTimerFire(bizumId, context), ms);
  timers.set(bizumId, timeout);
  log.debug({ bizum_id: bizumId, timeout_ms: ms }, 'bizum timer started');
}

/**
 * Cancel the active timer for a Bizum (call when partner responds early).
 */
export function cancelBizumTimer(bizumId) {
  const t = timers.get(bizumId);
  if (t) {
    clearTimeout(t);
    timers.delete(bizumId);
    log.debug({ bizum_id: bizumId }, 'bizum timer cancelled');
  }
}

/** Number of active timers — for tests and diagnostics. */
export function pendingTimerCount() {
  return timers.size;
}

/** Clear all timers — for test teardown. */
export function clearAllBizumTimers() {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
}

// ─── Private ──────────────────────────────────────────────────────────────────

async function onTimerFire(bizumId, { clientId, chatId, businessConnectionId, amountEur }) {
  log.info({ bizum_id: bizumId, chat_id: chatId }, 'bizum timer fired');
  timers.delete(bizumId); // already fired

  const pending = await getPendingBizum(bizumId);
  if (!pending || pending.status !== 'pending') {
    log.debug({ bizum_id: bizumId, status: pending?.status }, 'bizum already processed — skipping timer');
    return;
  }

  // Re-fetch client for up-to-date num_compras
  const { rows } = await query('SELECT * FROM clients WHERE id = $1', [clientId]);
  const client = rows[0];

  if (shouldAutoApprove(client, amountEur)) {
    await autoApproveBizum(bizumId);
    if (pending.transaction_id) {
      await confirmTransactionById(pending.transaction_id, { auto_approved: true, reason: 'timer_auto_approve' });
    }

    const identifier = client?.username ? `@${client.username}` : `ID ${clientId}`;
    await sendWhatsAppToPartner(
      `✅ *Bizum #${bizumId} AUTO-APROBADO*\n` +
      `Cliente: ${identifier}\n` +
      `Importe: ${amountEur}€\n` +
      `Razón: ${client?.num_compras ?? 0} compras previas y importe ≤ 50€`,
    );

    log.info({ bizum_id: bizumId, client_id: clientId }, 'bizum auto-approved by timer');

    await sendMessage(businessConnectionId, chatId,
      '✅ ¡Pago confirmado! Ahora mismo te mando el contenido 🔥',
    );
    // TODO FASE 5: trigger content delivery via content-curator
  } else {
    log.info({ bizum_id: bizumId }, 'bizum timer: conditions not met for auto-approve, informing client');
    await sendMessage(businessConnectionId, chatId,
      'Oye, mi compañero me está tardando en confirmar... dame un ratito más 😊',
    );
    // Partner can still respond via WhatsApp at any point — no hard cutoff
  }
}
