import { query } from '../db.js';
import { sendWhatsAppToPartner } from '../twilio.js';
import { agentLogger } from '../logger.js';

const log = agentLogger('bizum');

export const BIZUM_EXPIRY_MINUTES = 10;
export const AUTO_APPROVE_MIN_PURCHASES = 2;
export const AUTO_APPROVE_MAX_AMOUNT_EUR = 50;

/**
 * Determine if a Bizum payment can be auto-approved without partner confirmation.
 * Conditions: client has ≥2 purchases AND amount ≤ €50.
 *
 * @param {object|null} client
 * @param {number} amountEur
 * @returns {boolean}
 */
export function shouldAutoApprove(client, amountEur) {
  return (
    (client?.num_compras ?? 0) >= AUTO_APPROVE_MIN_PURCHASES &&
    amountEur <= AUTO_APPROVE_MAX_AMOUNT_EUR
  );
}

/**
 * Check if a pending Bizum confirmation has expired.
 * Pure function for testability.
 *
 * @param {{ created_at: string|Date }} pendingBizum
 * @param {Date} [now=new Date()]
 * @returns {boolean}
 */
export function isExpired(pendingBizum, now = new Date()) {
  const expiryMs = BIZUM_EXPIRY_MINUTES * 60 * 1000;
  return now.getTime() - new Date(pendingBizum.created_at).getTime() > expiryMs;
}

/**
 * Insert a pending Bizum confirmation record.
 *
 * @param {{ clientId: number, transactionId: number|null, amountEur: number }} params
 * @returns {Promise<object>} The created row
 */
export async function createPendingBizum({ clientId, transactionId, amountEur }) {
  const { rows } = await query(
    `INSERT INTO pending_bizum_confirmations (client_id, transaction_id, amount)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [clientId, transactionId, amountEur],
  );
  log.debug({ bizum_id: rows[0].id, client_id: clientId, amount: amountEur }, 'pending bizum created');
  return rows[0];
}

/**
 * Retrieve a pending Bizum record by id.
 */
export async function getPendingBizum(bizumId) {
  const { rows } = await query(
    'SELECT * FROM pending_bizum_confirmations WHERE id = $1',
    [bizumId],
  );
  return rows[0] ?? null;
}

/**
 * Send a WhatsApp message to the partner requesting Bizum confirmation.
 * Also marks partner_notified_at in the DB.
 *
 * @param {{ bizumId: number, clientId: number, amountEur: number, clientUsername?: string }} params
 */
export async function notifyPartner({ bizumId, clientId, amountEur, clientUsername }) {
  const identifier = clientUsername ? `@${clientUsername}` : `ID ${clientId}`;
  const msg =
    `💸 *Bizum pendiente* #${bizumId}\n` +
    `Cliente: ${identifier}\n` +
    `Importe: ${amountEur}€\n\n` +
    `Responde con:\n` +
    `✅ "ok" o "/confirmar ${bizumId}" si ha llegado\n` +
    `❌ "no ha llegado" o "/denegar ${bizumId}" si no`;

  const result = await sendWhatsAppToPartner(msg);

  await query(
    'UPDATE pending_bizum_confirmations SET partner_notified_at = NOW() WHERE id = $1',
    [bizumId],
  );

  log.info({ bizum_id: bizumId, amount: amountEur }, 'partner notified');
  return result;
}

/**
 * Mark a pending Bizum as confirmed by the partner.
 * Only transitions from 'pending' → 'confirmed' to prevent double-processing.
 */
export async function confirmBizum(bizumId) {
  const { rows } = await query(
    `UPDATE pending_bizum_confirmations
     SET status = 'confirmed', partner_response = 'confirmed',
         partner_response_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [bizumId],
  );
  return rows[0] ?? null;
}

/**
 * Mark a pending Bizum as auto-approved (no partner confirmation needed).
 */
export async function autoApproveBizum(bizumId) {
  const { rows } = await query(
    `UPDATE pending_bizum_confirmations
     SET status = 'auto_approved', partner_response_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [bizumId],
  );
  return rows[0] ?? null;
}

/**
 * Find a pending Bizum for a client that has NOT yet been notified to the partner.
 * Used to detect when client confirms payment ("ya pagué") so we can notify partner.
 */
export async function getPendingUnnotifiedBizum(clientId) {
  const { rows } = await query(
    `SELECT * FROM pending_bizum_confirmations
     WHERE client_id = $1 AND status = 'pending' AND partner_notified_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [clientId],
  );
  return rows[0] ?? null;
}

/**
 * Find the most recently partner-notified pending Bizum (any client).
 * Used when partner responds with natural language without an explicit ID.
 */
export async function getMostRecentPendingBizum() {
  const { rows } = await query(
    `SELECT * FROM pending_bizum_confirmations
     WHERE status = 'pending' AND partner_notified_at IS NOT NULL
     ORDER BY partner_notified_at DESC
     LIMIT 1`,
  );
  return rows[0] ?? null;
}

/**
 * Mark a pending Bizum as denied.
 */
export async function denyBizum(bizumId, reason = 'denied_by_partner') {
  const { rows } = await query(
    `UPDATE pending_bizum_confirmations
     SET status = 'denied', partner_response = $2,
         partner_response_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [bizumId, reason],
  );
  return rows[0] ?? null;
}
