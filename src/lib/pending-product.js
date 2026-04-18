/**
 * src/lib/pending-product.js
 *
 * Persistencia ligera del producto pendiente del cliente — usada para que
 * la rama `payment_method_selection` del orquestador recupere el productId
 * + amountEur que se acordó en el turno anterior, en lugar de re-resolver
 * el intent por el camino legacy (que en BASELINE-V2 alucinaba precios).
 *
 * Schema (migration 014):
 *   clients.pending_product_id  TEXT
 *   clients.pending_amount_eur  NUMERIC(10,2)
 *   clients.pending_set_at      TIMESTAMPTZ
 *
 * TTL: 30 minutos. `getPendingProduct` aplica el TTL en lectura: si la
 * fila tiene pending pero pending_set_at es más viejo que TTL_MS, devuelve
 * null y limpia el pending de forma asíncrona (fire-and-forget).
 */

import { query } from './db.js';
import { agentLogger } from './logger.js';

const log = agentLogger('pending-product');

export const PENDING_TTL_MS = 30 * 60 * 1000; // 30 minutos

/**
 * Persistir el producto pendiente del cliente.
 *
 * @param {number} clientId
 * @param {string} productId
 * @param {number} amountEur
 * @returns {Promise<void>}
 */
export async function setPendingProduct(clientId, productId, amountEur) {
  if (!clientId) throw new Error('setPendingProduct: clientId required');
  if (!productId) throw new Error('setPendingProduct: productId required');
  if (typeof amountEur !== 'number' || amountEur <= 0) {
    throw new Error(`setPendingProduct: amountEur must be a positive number, got ${amountEur}`);
  }
  await query(
    `UPDATE clients
        SET pending_product_id = $2,
            pending_amount_eur = $3,
            pending_set_at     = NOW()
      WHERE id = $1`,
    [clientId, productId, amountEur],
  );
  log.debug({ client_id: clientId, product_id: productId, amount_eur: amountEur }, 'pending product set');
}

/**
 * Recuperar el producto pendiente del cliente. Aplica TTL: si caducó
 * (>30 min), devuelve null y limpia el pending en BBDD.
 *
 * @param {number} clientId
 * @returns {Promise<{ productId: string, amountEur: number, setAt: Date } | null>}
 */
export async function getPendingProduct(clientId) {
  if (!clientId) return null;
  const { rows } = await query(
    `SELECT pending_product_id, pending_amount_eur, pending_set_at
       FROM clients
      WHERE id = $1`,
    [clientId],
  );
  if (rows.length === 0) return null;
  const { pending_product_id, pending_amount_eur, pending_set_at } = rows[0];
  if (!pending_product_id || !pending_set_at) return null;

  const setAt = new Date(pending_set_at);
  const ageMs = Date.now() - setAt.getTime();
  if (ageMs > PENDING_TTL_MS) {
    log.info({ client_id: clientId, product_id: pending_product_id, age_ms: ageMs }, 'pending product expired — clearing');
    // Fire-and-forget cleanup; do not block the read.
    clearPendingProduct(clientId).catch((err) =>
      log.warn({ client_id: clientId, err }, 'expired pending cleanup failed'),
    );
    return null;
  }

  return {
    productId: pending_product_id,
    amountEur: Number(pending_amount_eur),
    setAt,
  };
}

/**
 * Borrar el pending del cliente.
 *
 * @param {number} clientId
 * @returns {Promise<void>}
 */
export async function clearPendingProduct(clientId) {
  if (!clientId) return;
  await query(
    `UPDATE clients
        SET pending_product_id = NULL,
            pending_amount_eur = NULL,
            pending_set_at     = NULL
      WHERE id = $1`,
    [clientId],
  );
}
