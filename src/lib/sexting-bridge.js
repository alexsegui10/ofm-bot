/**
 * src/lib/sexting-bridge.js
 *
 * Pasarela entre el orquestador y el motor de sexting v2 (`src/lib/sexting-conductor.js`).
 *
 * Responsabilidades:
 *   - Crear la fila business en `sexting_sessions` (id SERIAL) y arrancar el
 *     state v2 con `startSextingSessionV2` — ambas en una operación atómica
 *     desde el punto de vista del caller (`startSextingV2ForClient`).
 *   - Detectar la sesión v2 activa de un cliente leyendo
 *     `sexting_sessions_state.ended_at IS NULL` (`getActiveV2SessionForClient`).
 *   - Inferir el `roleplay_context` desde mensajes recientes del historial
 *     (`detectRoleplayFromHistory`).
 *
 * El módulo legacy `src/agents/sexting-conductor.js` (playlists v1) sigue
 * siendo el fallback para cualquier producto cuyo `productId` NO empiece por
 * `st_`. La política de routing (st_* → v2, resto → v1) la aplica el caller.
 */

import { query } from './db.js';
import { agentLogger } from './logger.js';
import { getProducts } from '../config/products.js';
import { startSextingSessionV2, emitInitialKickoff, resolveMediaFile } from './sexting-conductor.js';

const log = agentLogger('sexting-bridge');

const ROLEPLAY_HISTORY_PATTERNS = [
  { re: /\b(profe|profesora|maestra)\b/i,    role: 'profesora' },
  { re: /\b(doc|doctora|enfermera)\b/i,      role: 'doctora' },
  { re: /\b(jefa|secretaria)\b/i,            role: 'jefa' },
  { re: /\b(hermanastra|madrastra)\b/i,      role: 'hermanastra' },
  { re: /\b(vecina)\b/i,                     role: 'vecina' },
  { re: /\b(azafata)\b/i,                    role: 'azafata' },
];

/**
 * Inferir un roleplay_context a partir de mensajes recientes del cliente.
 * Devuelve null si no se detecta ninguno.
 *
 * @param {Array<{ role: string, content: string }>} history
 * @param {string} currentText
 * @returns {string|null}
 */
export function detectRoleplayFromHistory(history, currentText = '') {
  const recent = (history || [])
    .filter((m) => m.role === 'user')
    .slice(-5)
    .map((m) => m.content);
  const blob = [...recent, currentText].join(' ');
  for (const { re, role } of ROLEPLAY_HISTORY_PATTERNS) {
    if (re.test(blob)) return role;
  }
  return null;
}

/**
 * Devuelve la fila de `sexting_sessions_state` activa para un cliente
 * (ended_at IS NULL), o null si no hay ninguna.
 *
 * @param {number} clientId
 * @returns {Promise<object|null>}
 */
export async function getActiveV2SessionForClient(clientId) {
  if (!clientId) return null;
  const { rows } = await query(
    `SELECT * FROM sexting_sessions_state
      WHERE client_id = $1 AND ended_at IS NULL
      ORDER BY started_at DESC
      LIMIT 1`,
    [clientId],
  );
  return rows[0] ?? null;
}

/**
 * Arrancar una sesión v2 para un cliente:
 *   1. INSERT en `sexting_sessions` (FK business) — status='active', expires_at = NOW() + duracion.
 *   2. Llamar a `startSextingSessionV2` con el id resultante.
 *
 * Idempotente desde el punto de vista del motor v2: si ya existe state para
 * el sessionId, `startSextingSessionV2` no duplica. Pero esta función SIEMPRE
 * crea una nueva row business — el caller debe asegurar que no la llama dos
 * veces para el mismo pago.
 *
 * @param {{
 *   clientId: number,
 *   templateId: string,             // st_5min / st_10min / st_15min
 *   transactionId?: number|null,
 *   roleplayContext?: string|null,
 *   onFinish?: (sessionId: number, reason: string) => Promise<void>,
 * }} params
 * @returns {Promise<{
 *   sessionId: number,
 *   state: object,
 *   kickoff: {
 *     action: 'send_kickoff'|'skip',
 *     reason: string,
 *     mediaId: string|null,
 *     captionBase: string|null,
 *     mediaFile: { file_id: string, tipo: string }|null,
 *     phase: string,
 *     clientState: string,
 *     roleplay: string|null,
 *   }
 * }>}
 */
export async function startSextingV2ForClient({
  clientId,
  templateId,
  transactionId = null,
  roleplayContext = null,
  onFinish = null,
}) {
  if (!clientId) throw new Error('startSextingV2ForClient: clientId required');
  if (!templateId) throw new Error('startSextingV2ForClient: templateId required');

  const products = getProducts();
  const template = products.sexting_templates.find((t) => t.id === templateId);
  if (!template) throw new Error(`startSextingV2ForClient: template "${templateId}" not found`);

  // 1. Business row in sexting_sessions
  const expiresAtSql = `NOW() + INTERVAL '${template.duracion_min} minutes'`;
  const { rows } = await query(
    `INSERT INTO sexting_sessions (client_id, transaction_id, status, expires_at)
       VALUES ($1, $2, 'active', ${expiresAtSql})
       RETURNING id`,
    [clientId, transactionId],
  );
  const sessionId = rows[0].id;

  // 2. v2 engine state
  const state = await startSextingSessionV2({
    sessionId,
    clientId,
    templateId,
    onFinish,
    roleplayContext,
  });

  // 3. Kickoff post-pago (excepción event-driven, ver doc del conductor):
  //    selecciona media warm_up + marca como usada. Texto lo genera el caller.
  let kickoff = {
    action: 'skip', reason: 'no_kickoff_attempted',
    mediaId: null, captionBase: null, mediaFile: null,
    phase: 'warm_up', clientState: 'engaged', roleplay: roleplayContext,
  };
  try {
    const order = await emitInitialKickoff({ sessionId });
    let mediaFile = null;
    if (order.action === 'send_kickoff' && order.mediaId) {
      try {
        mediaFile = await resolveMediaFile(order.mediaId);
      } catch (err) {
        log.warn({ err, session_id: sessionId, media_id: order.mediaId }, 'kickoff: resolveMediaFile failed (continuing without media)');
        mediaFile = null;
      }
    }
    kickoff = { ...order, mediaFile };
  } catch (err) {
    log.error({ err, session_id: sessionId }, 'kickoff: emitInitialKickoff failed (continuing without kickoff)');
  }

  log.info({
    client_id: clientId, session_id: sessionId, template_id: templateId,
    roleplay_context: roleplayContext,
    kickoff_action: kickoff.action, kickoff_media: kickoff.mediaId,
  }, 'sexting v2: started for client (business row + state + kickoff)');

  return { sessionId, state, kickoff };
}
