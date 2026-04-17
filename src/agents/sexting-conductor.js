import { query } from '../lib/db.js';
import { sendMessage } from '../lib/telegram.js';
import { runPersona } from './persona.js';
import { getClientById } from './profile-manager.js';
import { agentLogger } from '../lib/logger.js';

const log = agentLogger('sexting-conductor');

// Maps product_id from catalog to playlist id in DB
const PRODUCT_TO_PLAYLIST = {
  'sexting__paquetes_predefinidos_basico_10min':   'calenton_rapido',
  'sexting__paquetes_predefinidos_completo_20min': 'noche_completa',
  'sexting__paquetes_predefinidos_intenso_30min':  'noche_completa',
};

// ─── In-memory session registry ───────────────────────────────────────────────

/** @type {Map<number, { timers: NodeJS.Timeout[], sessionId: number, clientId: number, chatId: number, businessConnectionId: string, currentRoleplay: string|null }>} */
const _sessions = new Map();

/** @returns {Map} Exposed for tests. */
export function _getActiveSessions() { return _sessions; }

/** Cancel and clear all active sessions — for test teardown. */
export function clearAllSextingTimers() {
  for (const { timers } of _sessions.values()) {
    timers.forEach(clearTimeout);
  }
  _sessions.clear();
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

/**
 * Fetch playlist definition from DB.
 * @param {string} playlistId
 * @returns {Promise<{ id: string, name: string, duration_minutes: number, phases: object[] } | null>}
 */
export async function getPlaylist(playlistId) {
  const { rows } = await query(
    'SELECT id, name, duration_minutes, phases FROM sexting_playlists WHERE id = $1 AND is_active = TRUE',
    [playlistId],
  );
  return rows[0] ?? null;
}

/**
 * Create a sexting_session row (or return existing active one for same client).
 */
async function createSextingSession({ transactionId, clientId, playlistId, durationMinutes, currentRoleplay }) {
  const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);
  const { rows } = await query(
    `INSERT INTO sexting_sessions
       (client_id, transaction_id, status, expires_at, current_phase, playlist_id, current_roleplay)
     VALUES ($1, $2, 'active', $3, 0, $4, $5)
     RETURNING *`,
    [clientId, transactionId ?? null, expiresAt, playlistId, currentRoleplay ?? null],
  );
  return rows[0];
}

/**
 * Persist the current phase index.
 */
async function updateSessionPhase(sessionId, phaseIndex) {
  await query(
    'UPDATE sexting_sessions SET current_phase = $1, updated_at = NOW() WHERE id = $2',
    [phaseIndex, sessionId],
  );
}

/**
 * Mark session completed.
 */
async function completeSession(sessionId) {
  await query(
    "UPDATE sexting_sessions SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = $1",
    [sessionId],
  );
}

/**
 * Mark session expired.
 */
async function expireSession(sessionId) {
  await query(
    "UPDATE sexting_sessions SET status = 'expired', updated_at = NOW() WHERE id = $1",
    [sessionId],
  );
}

// ─── Phase execution ──────────────────────────────────────────────────────────

/**
 * Execute a playlist phase: generate Persona response and send it to the client.
 */
async function executePhase(sessionData, phase) {
  const { sessionId, clientId, chatId, businessConnectionId, currentRoleplay } = sessionData;

  log.info({ session_id: sessionId, phase_index: phase.phase_index, phase_name: phase.name }, 'sexting: executing phase');

  try {
    const client = await getClientById(clientId);
    if (!client) {
      log.warn({ session_id: sessionId, client_id: clientId }, 'sexting: client not found for phase');
      return;
    }

    // Use mensaje_base (pre-written human text) if present; fall back to prompt_hint.
    let instruction;
    if (phase.mensaje_base) {
      const clientName = client?.profile?.nombre ?? null;
      instruction =
        `Tienes este mensaje base que debes enviar: "${phase.mensaje_base}". ` +
        `Personalízalo mínimamente (1-2 palabras como mucho)` +
        (clientName ? `, puedes añadir su nombre "${clientName}" si encaja natural` : '') +
        `. NO cambies el contenido ni el tono. NO añadas precios ni catálogo.`;
    } else {
      instruction = phase.prompt_hint;
    }

    if (currentRoleplay) {
      instruction += ` Recuerda: el cliente ha pedido que juegues el rol de "${currentRoleplay}".`;
    }

    const message = await runPersona('', [], client, 'sexting_request', instruction);
    if (message) {
      await sendMessage(businessConnectionId, chatId, message);
    }

    await updateSessionPhase(sessionId, phase.phase_index);
  } catch (err) {
    log.error({ err, session_id: sessionId, phase_index: phase.phase_index }, 'sexting: phase execution error');
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolve which playlist to use for a product.
 * Falls back to 'calenton_rapido' if not mapped.
 *
 * @param {string|null} productId
 * @returns {string}
 */
export function resolvePlaylistId(productId) {
  return PRODUCT_TO_PLAYLIST[productId] ?? 'calenton_rapido';
}

/**
 * Start a new sexting session: create DB record, load playlist, schedule phase timers.
 *
 * @param {{
 *   transactionId: number|null,
 *   clientId: number,
 *   chatId: number,
 *   businessConnectionId: string,
 *   productId?: string,
 *   playlistId?: string,
 *   currentRoleplay?: string|null,
 * }} params
 * @returns {Promise<{ sessionId: number, playlistId: string }>}
 */
export async function startSextingSession({
  transactionId,
  clientId,
  chatId,
  businessConnectionId,
  productId = null,
  playlistId: explicitPlaylistId = null,
  currentRoleplay = null,
}) {
  const playlistId = explicitPlaylistId ?? resolvePlaylistId(productId);
  const playlist = await getPlaylist(playlistId);

  if (!playlist) {
    throw new Error(`sexting-conductor: playlist "${playlistId}" not found`);
  }

  const session = await createSextingSession({
    transactionId,
    clientId,
    playlistId,
    durationMinutes: playlist.duration_minutes,
    currentRoleplay,
  });

  const sessionId = session.id;
  const sessionData = { sessionId, clientId, chatId, businessConnectionId, currentRoleplay };
  const timers = [];

  log.info({
    session_id: sessionId,
    client_id: clientId,
    playlist_id: playlistId,
    phases: playlist.phases.length,
    duration_minutes: playlist.duration_minutes,
  }, 'sexting: session started');

  // Schedule each phase timer
  const phases = Array.isArray(playlist.phases) ? playlist.phases : [];
  for (const phase of phases) {
    const delayMs = (phase.start_offset_seconds ?? 0) * 1000;
    const t = setTimeout(async () => {
      await executePhase(sessionData, phase);
    }, delayMs);
    timers.push(t);
  }

  // Schedule session end
  const endDelayMs = playlist.duration_minutes * 60 * 1000;
  const endTimer = setTimeout(async () => {
    log.info({ session_id: sessionId }, 'sexting: session expired by timer');
    await expireSession(sessionId);
    _sessions.delete(sessionId);

    try {
      await sendMessage(businessConnectionId, chatId,
        'ha sido una noche increíble 🔥 si quieres repetir ya sabes donde encontrarme 😈');
    } catch {}
  }, endDelayMs);
  timers.push(endTimer);

  _sessions.set(sessionId, { ...sessionData, timers });

  return { sessionId, playlistId };
}

/**
 * Cancel an active session (e.g. refund or admin action).
 * Does NOT send any message to the client.
 *
 * @param {number} sessionId
 */
export async function cancelSextingSession(sessionId) {
  const session = _sessions.get(sessionId);
  if (session) {
    session.timers.forEach(clearTimeout);
    _sessions.delete(sessionId);
  }
  await expireSession(sessionId);
  log.info({ session_id: sessionId }, 'sexting: session cancelled');
}

/**
 * Update the current roleplay for an active session (called by orchestrator when
 * client requests a role mid-session).
 *
 * @param {number} sessionId
 * @param {string} roleplay
 */
export async function updateSessionRoleplay(sessionId, roleplay) {
  const session = _sessions.get(sessionId);
  if (session) {
    session.currentRoleplay = roleplay;
  }
  await query(
    'UPDATE sexting_sessions SET current_roleplay = $1, updated_at = NOW() WHERE id = $2',
    [roleplay, sessionId],
  );
  log.info({ session_id: sessionId, roleplay }, 'sexting: roleplay updated');
}

/**
 * Get active session for a client identified by their Telegram chat ID (BIGINT).
 * Joins with clients table to resolve the internal integer client_id.
 *
 * @param {number|string} telegramChatId  Telegram user/chat ID (may be > 2^31)
 * @returns {Promise<object|null>}
 */
export async function getActiveSession(telegramChatId) {
  const { rows } = await query(
    `SELECT ss.* FROM sexting_sessions ss
     JOIN clients c ON ss.client_id = c.id
     WHERE c.telegram_user_id = $1 AND ss.status = 'active'
     ORDER BY ss.created_at DESC LIMIT 1`,
    [String(telegramChatId)],
  );
  return rows[0] ?? null;
}
