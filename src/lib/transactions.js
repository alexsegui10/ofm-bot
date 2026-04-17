import { query } from './db.js';
import { agentLogger } from './logger.js';

const log = agentLogger('transactions');

/**
 * Create a new transaction record (status = 'pending').
 *
 * @param {{ clientId, paymentId, method, amountEur, productType?, productId?, metadata? }} params
 * @returns {Promise<object>} The created transaction row
 */
export async function createTransaction({ clientId, paymentId, method, amountEur, productType = null, productId = null, metadata = {} }) {
  const { rows } = await query(
    `INSERT INTO transactions
       (client_id, payment_id, payment_method, amount_eur, product_type, product_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [clientId, paymentId, method, amountEur, productType, productId, JSON.stringify(metadata)],
  );
  log.debug({ transaction_id: rows[0].id, payment_id: paymentId, method, amount_eur: amountEur }, 'transaction created');
  return rows[0];
}

/**
 * Retrieve a transaction by its payment_id string.
 */
export async function getTransactionByPaymentId(paymentId) {
  const { rows } = await query(
    'SELECT * FROM transactions WHERE payment_id = $1',
    [paymentId],
  );
  return rows[0] ?? null;
}

/**
 * Retrieve a transaction by its integer DB id.
 */
export async function getTransactionById(id) {
  const { rows } = await query(
    'SELECT * FROM transactions WHERE id = $1',
    [id],
  );
  return rows[0] ?? null;
}

/**
 * Mark a transaction as paid by payment_id.
 * Also increments client num_compras and total_gastado.
 *
 * @param {string} paymentId
 * @param {object} metadata  Extra metadata to merge into the existing JSONB
 * @returns {Promise<object|null>} Updated transaction row, or null if not found
 */
export async function confirmTransaction(paymentId, metadata = {}) {
  const { rows } = await query(
    `UPDATE transactions
     SET status = 'paid', paid_at = NOW(), updated_at = NOW(),
         metadata = metadata || $2::jsonb
     WHERE payment_id = $1 AND status != 'paid'
     RETURNING *`,
    [paymentId, JSON.stringify(metadata)],
  );
  if (!rows[0]) return null;

  // Update client purchase stats
  await query(
    `UPDATE clients
     SET num_compras   = num_compras   + 1,
         total_gastado = total_gastado + $2
     WHERE id = $1`,
    [rows[0].client_id, rows[0].amount_eur],
  );

  log.info({ transaction_id: rows[0].id, client_id: rows[0].client_id, amount_eur: rows[0].amount_eur }, 'transaction confirmed');
  return rows[0];
}

/**
 * Mark a transaction as paid by integer DB id.
 * Resolves to the payment_id and delegates to confirmTransaction.
 */
export async function confirmTransactionById(id, metadata = {}) {
  const txn = await getTransactionById(id);
  if (!txn) return null;
  return confirmTransaction(txn.payment_id, metadata);
}

/**
 * Mark a transaction as failed by payment_id.
 *
 * @param {string} paymentId
 * @param {string} reason
 * @returns {Promise<object|null>}
 */
export async function failTransaction(paymentId, reason = '') {
  const { rows } = await query(
    `UPDATE transactions
     SET status = 'failed', updated_at = NOW(),
         metadata = metadata || $2::jsonb
     WHERE payment_id = $1 AND status = 'pending'
     RETURNING *`,
    [paymentId, JSON.stringify({ failure_reason: reason })],
  );
  if (rows[0]) {
    log.info({ transaction_id: rows[0].id, reason }, 'transaction failed');
  }
  return rows[0] ?? null;
}

/**
 * Mark a transaction as failed by integer DB id.
 */
export async function failTransactionById(id, reason = '') {
  const txn = await getTransactionById(id);
  if (!txn) return null;
  return failTransaction(txn.payment_id, reason);
}
