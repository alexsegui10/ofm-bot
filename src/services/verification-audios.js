// Sistema 3 (SPEC-HANDOFF-V1 §3) — Pool de audios de verificación pregrabados.
//
// Capa de servicios pura. El caller (Sistema 3, a implementar en C5) decide
// qué hacer si el pool está vacío (fallback texto). Aquí sólo resolvemos
// rotación y mantenemos contadores de uso.

import { query } from '../lib/db.js';
import { agentLogger } from '../lib/logger.js';

const log = agentLogger('verification-audios');

/**
 * Devuelve el audio menos usado que coincide con `contextTag`, excluyendo
 * los `excludedIds`. Devuelve `null` si el pool (filtrado) está vacío — el
 * caller se encarga del fallback.
 *
 * Orden de rotación:
 *   1. last_used_at ASC NULLS FIRST  — audios nunca usados van primero
 *   2. use_count ASC                 — ante empate, menos usado gana
 *   3. id ASC                        — tiebreaker determinista para tests
 *
 * Marca el audio elegido como usado ANTES de devolverlo (UPDATE last_used_at,
 * use_count += 1). Hacerlo inline garantiza que dos llamadas consecutivas no
 * devuelvan el mismo audio aunque no haya `excludedIds` explícito.
 *
 * @param {object} [options]
 * @param {string} [options.contextTag='verification']
 * @param {number[]} [options.excludedIds=[]]  IDs de audios ya usados con ese cliente.
 * @returns {Promise<object|null>}  La fila del audio (con counts actualizados) o null.
 */
export async function getRandomVerificationAudio({
  contextTag = 'verification',
  excludedIds = [],
} = {}) {
  const { rows } = await query(
    `SELECT * FROM verification_audios
     WHERE context_tag = $1 AND NOT (id = ANY($2::int[]))
     ORDER BY last_used_at ASC NULLS FIRST, use_count ASC, id ASC
     LIMIT 1`,
    [contextTag, excludedIds],
  );

  if (rows.length === 0) {
    log.warn({ context_tag: contextTag, excluded_count: excludedIds.length }, 'verification audio pool empty');
    return null;
  }

  const audio = rows[0];
  const updated = await markAudioUsed(audio.id);
  log.info({ audio_id: audio.id, file_path: audio.file_path, use_count: updated.use_count }, 'verification audio selected');
  return updated;
}

/**
 * Incrementa el contador de uso y refresca last_used_at. Expuesto para tests
 * y por si el caller necesita rotar manualmente (p.ej. audio enviado desde
 * otro canal pero queremos tracking).
 *
 * @param {number} id
 * @returns {Promise<object>}  La fila actualizada.
 */
export async function markAudioUsed(id) {
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`markAudioUsed: id must be a positive integer, got ${id}`);
  }
  const { rows } = await query(
    `UPDATE verification_audios
     SET last_used_at = NOW(), use_count = use_count + 1
     WHERE id = $1
     RETURNING *`,
    [id],
  );
  if (rows.length === 0) throw new Error(`markAudioUsed: audio id=${id} not found`);
  return rows[0];
}

/**
 * Número de audios disponibles para un contextTag. Útil para que el caller
 * decida ir directo al fallback sin pasar por getRandom (saving a round-trip).
 *
 * @param {string} [contextTag='verification']
 * @returns {Promise<number>}
 */
export async function countAvailableAudios(contextTag = 'verification') {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS n FROM verification_audios WHERE context_tag = $1`,
    [contextTag],
  );
  return rows[0].n;
}
