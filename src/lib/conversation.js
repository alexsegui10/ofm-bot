import { query } from './db.js';
import { agentLogger } from './logger.js';

const log = agentLogger('conversation');

/**
 * Persist a message turn to the conversations table.
 * @param {number} clientId
 * @param {'user'|'assistant'} role
 * @param {string} content
 * @param {string} [intent]
 * @param {object} [metadata]
 */
export async function saveMessage(clientId, role, content, intent = null, metadata = {}) {
  await query(
    `INSERT INTO conversations (client_id, role, content, intent, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [clientId, role, content, intent, metadata],
  );
}

/**
 * Fetch the last N turns for a client, ordered oldest → newest.
 * Returns an array ready to use as LLM message history.
 *
 * @param {number} clientId
 * @param {number} [limit=10]
 * @returns {Promise<Array<{role: string, content: string}>>}
 */
export async function getHistory(clientId, limit = 10) {
  const { rows } = await query(
    `SELECT role, content
     FROM (
       SELECT role, content, created_at
       FROM conversations
       WHERE client_id = $1
       ORDER BY created_at DESC
       LIMIT $2
     ) sub
     ORDER BY created_at ASC`,
    [clientId, limit],
  );
  return rows;
}

/**
 * Ensures history is valid for Anthropic (must start with 'user', no consecutive same roles).
 * Call this before passing history to callAnthropic().
 *
 * @param {Array<{role: string, content: string}>} history
 * @returns {Array<{role: string, content: string}>}
 */
export function normalizeHistory(history) {
  if (!history.length) return [];

  // Strip leading assistant turns
  let msgs = [...history];
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();

  // Remove consecutive duplicate roles (keep the latest)
  const valid = [];
  for (const msg of msgs) {
    const prev = valid[valid.length - 1];
    if (prev && prev.role === msg.role) {
      valid[valid.length - 1] = msg;
    } else {
      valid.push(msg);
    }
  }
  return valid;
}

/**
 * Returns the timestamp of the most recent message for a client, or null if none.
 *
 * @param {number} clientId
 * @returns {Promise<Date|null>}
 */
/**
 * Returns the number of messages stored for a client BEFORE the current turn.
 * Used by the orchestrator to decide whether to append the catalog (new client = 0).
 * Intentionally a separate query from getHistory so the check is never
 * affected by the LLM-context LIMIT.
 *
 * @param {number} clientId
 * @returns {Promise<number>}
 */
export async function countPriorMessages(clientId) {
  const { rows } = await query(
    'SELECT COUNT(*)::int AS cnt FROM conversations WHERE client_id = $1',
    [clientId],
  );
  return rows[0]?.cnt ?? 0;
}

export async function getLastInteractionDate(clientId) {
  const { rows } = await query(
    `SELECT created_at FROM conversations
     WHERE client_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [clientId],
  );
  return rows[0]?.created_at ? new Date(rows[0].created_at) : null;
}

/**
 * Log a Quality Gate failure for later human review.
 */
export async function logQualityGateFailure({
  clientId,
  originalResponse,
  failureReason,
  regeneratedResponse = null,
  fallbackUsed = false,
  metadata = {},
}) {
  await query(
    `INSERT INTO quality_gate_failures
       (client_id, original_response, failure_reason, regenerated_response, fallback_used, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [clientId, originalResponse, failureReason, regeneratedResponse, fallbackUsed, metadata],
  );
  log.warn({ clientId, failureReason, fallbackUsed }, 'quality gate failure logged');
}
