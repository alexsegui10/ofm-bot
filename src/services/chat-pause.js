// Sistema 2 (SPEC-HANDOFF-V1 §2) — Pausa/reactivación manual de chats.
//
// Capa de servicios pura: sin conocimiento de Telegram, invocable por el
// adaptador de comandos admin y (más adelante) por un endpoint HTTP del
// panel web. Tests son integración real contra Postgres.

import { query } from '../lib/db.js';
import { agentLogger } from '../lib/logger.js';

const log = agentLogger('chat-pause');

const VALID_PAUSED_STATUSES = new Set([
  'paused_awaiting_videocall',
  'paused_manual',
  'paused_awaiting_human',
]);

/**
 * Pausa el chat del cliente indicado.
 *
 * Spec §2 firma original: `pauseChatBot(clientId, reason, expectedResumeBy)`.
 * Implementación con options object por claridad — permite pasar `status`
 * (enum) y `metadata` sin romper la firma positional:
 *
 *   pauseChatBot(id, 'admin_manual')                              // default paused_manual
 *   pauseChatBot(id, 'videocall scheduled', { status: 'paused_awaiting_videocall', expectedResumeBy: date })
 *
 * Idempotente: si el cliente ya tiene una pausa activa, actualiza la fila
 * existente en lugar de insertar una nueva (evita duplicados incoherentes).
 *
 * @param {number} clientId
 * @param {string} reason  Motivo libre para auditoría.
 * @param {object} [options]
 * @param {'paused_manual'|'paused_awaiting_videocall'|'paused_awaiting_human'} [options.status='paused_manual']
 * @param {Date|null} [options.expectedResumeBy]
 * @param {object} [options.metadata]
 * @returns {Promise<object>} La fila insertada o actualizada.
 */
export async function pauseChatBot(clientId, reason, options = {}) {
  const {
    status = 'paused_manual',
    expectedResumeBy = null,
    metadata = {},
  } = options;

  if (!Number.isInteger(clientId) || clientId <= 0) {
    throw new Error(`pauseChatBot: clientId must be a positive integer, got ${clientId}`);
  }
  if (!VALID_PAUSED_STATUSES.has(status)) {
    throw new Error(`pauseChatBot: invalid status "${status}". Must be one of ${[...VALID_PAUSED_STATUSES].join(', ')}`);
  }

  // Si ya hay pausa activa, actualizarla en lugar de duplicar.
  const existing = await query(
    `SELECT id FROM chat_pause_state
     WHERE client_id = $1 AND resumed_at IS NULL
     ORDER BY paused_at DESC LIMIT 1`,
    [clientId],
  );

  if (existing.rows.length > 0) {
    const { rows } = await query(
      `UPDATE chat_pause_state
       SET status = $2, reason = $3, expected_resume_by = $4,
           metadata = metadata || $5::jsonb, paused_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [existing.rows[0].id, status, reason, expectedResumeBy, JSON.stringify(metadata)],
    );
    log.info({ client_id: clientId, status, reason, pause_id: rows[0].id, reused: true }, 'chat pause updated');
    return rows[0];
  }

  const { rows } = await query(
    `INSERT INTO chat_pause_state (client_id, status, reason, expected_resume_by, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     RETURNING *`,
    [clientId, status, reason, expectedResumeBy, JSON.stringify(metadata)],
  );
  log.info({ client_id: clientId, status, reason, pause_id: rows[0].id }, 'chat paused');
  return rows[0];
}

/**
 * Reactiva el chat del cliente. Marca la pausa activa con `resumed_at = NOW()`.
 *
 * Si no hay pausa activa, es no-op (devuelve null) y se loggea un warning —
 * evita que los comandos /reactivar sobre chats no pausados revienten.
 *
 * NOTA spec §2: "el siguiente mensaje que llegue del cliente debe ir al bot
 * con todo el historial del periodo pausado cargado en el contexto del
 * Profile Manager". Esa carga la hace el orquestador en el siguiente turno;
 * este servicio sólo marca la pausa como terminada.
 *
 * @param {number} clientId
 * @param {string} [context='manual']  De dónde vino la reactivación.
 * @returns {Promise<object|null>} La fila actualizada o null si no había pausa.
 */
export async function resumeChatBot(clientId, context = 'manual') {
  if (!Number.isInteger(clientId) || clientId <= 0) {
    throw new Error(`resumeChatBot: clientId must be a positive integer, got ${clientId}`);
  }

  const { rows } = await query(
    `UPDATE chat_pause_state
     SET resumed_at = NOW(),
         metadata = metadata || jsonb_build_object('resume_context', $2::text)
     WHERE client_id = $1 AND resumed_at IS NULL
     RETURNING *`,
    [clientId, context],
  );

  if (rows.length === 0) {
    log.warn({ client_id: clientId, context }, 'resumeChatBot: no active pause found');
    return null;
  }
  log.info({ client_id: clientId, context, pause_id: rows[0].id }, 'chat resumed');
  return rows[0];
}

/**
 * Lista de chats actualmente pausados.
 *
 * @returns {Promise<Array<object>>}
 */
export async function getPausedChats() {
  const { rows } = await query(
    `SELECT cps.*, c.telegram_user_id
     FROM chat_pause_state cps
     JOIN clients c ON c.id = cps.client_id
     WHERE cps.resumed_at IS NULL
     ORDER BY cps.paused_at DESC`,
  );
  return rows;
}

/**
 * Estado actual del chat de un cliente.
 *
 *   - Si hay una fila con resumed_at IS NULL → devuelve ese status literal
 *     (uno de los 3 paused_*).
 *   - Si no la hay → 'active'.
 *
 * @param {number} clientId
 * @returns {Promise<'active'|'paused_awaiting_videocall'|'paused_manual'|'paused_awaiting_human'>}
 */
export async function getChatStatus(clientId) {
  if (!Number.isInteger(clientId) || clientId <= 0) {
    throw new Error(`getChatStatus: clientId must be a positive integer, got ${clientId}`);
  }

  const { rows } = await query(
    `SELECT status FROM chat_pause_state
     WHERE client_id = $1 AND resumed_at IS NULL
     ORDER BY paused_at DESC LIMIT 1`,
    [clientId],
  );
  return rows.length > 0 ? rows[0].status : 'active';
}
