/**
 * Sexting Conductor v2 — motor conversacional event-driven según
 * docs/especificacion-rediseno-v2.md §5.
 *
 * Diferencia clave con `src/agents/sexting-conductor.js` (v1 legacy):
 *   v1: playlists prescriptivas con timers por fase. Mensajes pre-escritos.
 *   v2: loop event-driven. Texto generado por IA en tiempo real respondiendo
 *       al cliente. Lo único "fijo" son las fotos/videos del pool con sus
 *       captions base, y la IA decide cuándo enviarlas respetando cadencia.
 *
 * Integración actual:
 *   - El orchestrator crea la sesión con `startSextingSessionV2(...)` al
 *     confirmarse el pago de una plantilla (st_5min/st_10min/st_15min).
 *   - Cada mensaje entrante del cliente durante la sesión va a `handleClientTurn`.
 *   - El timer de fin (`duracion_min * 60s`) dispara `finishSexting('time_up')`.
 *   - Las medias se resuelven con `content-dispatcher.resolveSextingMedia`.
 *
 * NOTA: este módulo mantiene el estado en BBDD (`sexting_sessions_state`). La
 * capa de timers es `setTimeout` in-process; un `restoreTimers()` al boot
 * re-programa las sesiones activas. NO hay job queue externa — consciente,
 * simple y recuperable.
 */

import { query } from './db.js';
import { agentLogger } from './logger.js';
import { getProducts } from '../config/products.js';
import { resolveSextingMedia } from './content-dispatcher.js';

const log = agentLogger('sexting-conductor-v2');

// ─── Timer registry in-process ───────────────────────────────────────────────

/** @type {Map<number, { endTimer: NodeJS.Timeout }>} */
const _endTimers = new Map();

export function _clearAllTimers() {
  for (const { endTimer } of _endTimers.values()) clearTimeout(endTimer);
  _endTimers.clear();
}

export function _getActiveTimers() { return _endTimers; }

// ─── Persistencia de estado ─────────────────────────────────────────────────

/**
 * Crea la fila en `sexting_sessions_state` y devuelve el state completo.
 * Asume que `sexting_sessions` (sesión de negocio/pago) ya existe con id.
 */
async function insertSessionState({
  sessionId, clientId, templateId, durationMin, mediaPool, roleplayContext,
}) {
  const { rows } = await query(
    `INSERT INTO sexting_sessions_state (
       session_id, client_id, template_id, actual_duration_min,
       media_pool_snapshot, roleplay_context
     ) VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     RETURNING *`,
    [sessionId, clientId, templateId, durationMin, JSON.stringify(mediaPool), roleplayContext ?? null],
  );
  return rows[0];
}

async function loadState(sessionId) {
  const { rows } = await query(
    `SELECT * FROM sexting_sessions_state WHERE session_id = $1`,
    [sessionId],
  );
  return rows[0] ?? null;
}

async function updateState(sessionId, patch) {
  const keys = Object.keys(patch);
  if (keys.length === 0) return;
  const setClauses = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const values = keys.map((k) => {
    const v = patch[k];
    if (k === 'media_pool_snapshot' && typeof v !== 'string') return JSON.stringify(v);
    return v;
  });
  await query(
    `UPDATE sexting_sessions_state SET ${setClauses}, updated_at = NOW()
     WHERE session_id = $1`,
    [sessionId, ...values],
  );
}

// ─── Fase derivada del tiempo ────────────────────────────────────────────────

/**
 * Infere la fase actual del sexting en función del tiempo transcurrido y el
 * objetivo del template. Acumulativo — si pasan 50s en una plantilla de 5min,
 * seguimos en warm_up (45s objetivo) porque no ha saltado aún teasing.
 *
 * @param {object} template  De products.json
 * @param {number} elapsedSec
 * @returns {'warm_up'|'teasing'|'escalada'|'climax'|'cool_down'}
 */
export function inferPhaseFromTime(template, elapsedSec) {
  const order = template.phases_order;
  const durations = template.phases_duration_target_seg;
  let cursor = 0;
  for (const phase of order) {
    cursor += durations[phase] ?? 0;
    if (elapsedSec < cursor) return phase;
  }
  return order[order.length - 1]; // cool_down al final
}

// ─── shouldSendMediaNow ─────────────────────────────────────────────────────

/**
 * Decide si toca enviar media en este turno.
 *
 * @param {object} state  Fila de sexting_sessions_state
 * @param {object} template  De products.json (sexting_templates[i])
 * @param {object} [opts]
 * @param {() => number} [opts.rand]  Inyectable para tests (default Math.random)
 * @param {number} [opts.now]  Inyectable para tests
 * @returns {{ send: boolean, reason: string }}
 */
export function shouldSendMediaNow(state, template, { rand = Math.random, now = Date.now() } = {}) {
  const cad = template.cadencia_target;
  const lastMs = state.last_media_sent_at ? new Date(state.last_media_sent_at).getTime() : 0;
  const timeSinceLastSec = lastMs ? (now - lastMs) / 1000 : Infinity;

  // Regla dura 1: respetar mínimo entre medias
  if (timeSinceLastSec < cad.min_segundos_entre_medias) {
    return { send: false, reason: 'too_soon' };
  }

  // Regla dura 2: llegamos al máximo de mensajes sin media → mandar
  if (state.messages_since_last_media >= cad.mensajes_max_sin_media) {
    return { send: true, reason: 'max_messages_reached' };
  }

  // Regla flexible: probabilidad según ratio
  const ratio = state.messages_since_last_media / cad.mensajes_por_media_objetivo;
  let prob = Math.min(0.9, ratio * 0.5);

  if (state.current_phase === 'escalada')  prob += 0.15;
  if (state.current_phase === 'warm_up')   prob -= 0.10;
  if (state.current_phase === 'cool_down') prob -= 0.20;

  if (state.client_state === 'cold')   prob += 0.20;
  if (state.client_state === 'rushed') prob += 0.10;

  prob = Math.max(0, Math.min(1, prob));
  return { send: rand() < prob, reason: `prob_${prob.toFixed(2)}` };
}

// ─── selectNextMedia ────────────────────────────────────────────────────────

/**
 * Elige la siguiente media del pool disponible.
 * Preferencia: misma phase_hint que la fase actual, por order_hint ascendente.
 * Fallback: siguiente por order_hint global.
 *
 * @param {object} state
 * @returns {object|null}  Entry del media_pool original, o null si vacío.
 */
export function selectNextMedia(state) {
  const pool = Array.isArray(state.media_pool_snapshot)
    ? state.media_pool_snapshot
    : (typeof state.media_pool_snapshot === 'string'
        ? JSON.parse(state.media_pool_snapshot)
        : []);
  const available = pool.filter((m) => !m.used);
  if (available.length === 0) return null;

  const sameFase = available.filter((m) => m.phase_hint === state.current_phase);
  const pick = (sameFase.length > 0 ? sameFase : available)
    .sort((a, b) => a.order_hint - b.order_hint)[0];
  return pick ?? null;
}

/**
 * Marca una media como usada en el pool snapshot.
 * @param {object[]} pool
 * @param {string} mediaLogicalId
 * @returns {object[]}  Nuevo pool (inmutable)
 */
export function markMediaUsed(pool, mediaLogicalId) {
  return pool.map((m) => (m.media_id === mediaLogicalId ? { ...m, used: true } : m));
}

// ─── Análisis de mensaje del cliente (heurístico, sin LLM) ──────────────────

const FINISHED_PATTERNS = [
  /me\s+corr?[íi]/i,
  /ya\s+est[aá]/i,
  /\bacab[eé]\b/i,
  /\btermin[eé]\b/i,
  /\b(buff|uff)\s+(ya|eso|fue)\b/i,
  /💦|😵/,
];

const ROLEPLAY_PATTERNS = [
  { re: /\b(mi|una|la)\s+(profe|profesora|maestra)\b/i,    role: 'profesora' },
  { re: /\b(mi|una|la)\s+(doc|doctora|enfermera)\b/i,      role: 'doctora' },
  { re: /\b(mi|una|la)\s+(jefa|secretaria)\b/i,            role: 'jefa' },
  { re: /\b(hermanastra|madrastra|vecina|azafata)\b/i,     role: 'roleplay_custom' },
];

const TOO_FAST_PATTERNS = [/\bmás\s+r[aá]pido\b/i, /\bya\s+va\b/i, /\bacelera\b/i];
const TOO_SLOW_PATTERNS = [/\bdespacito\b/i, /\bpoco\s+a\s+poco\b/i, /\btranqui\b/i];

/**
 * Analiza heurísticamente un mensaje del cliente. Sin LLM — rápido, barato,
 * 100% determinista para tests.
 *
 * @param {string} text
 * @returns {{ finished: boolean, roleplay: string|null, tooFast: boolean, tooSlow: boolean }}
 */
export function analyzeClientMessage(text) {
  if (!text) return { finished: false, roleplay: null, tooFast: false, tooSlow: false };
  const finished = FINISHED_PATTERNS.some((p) => p.test(text));
  let roleplay = null;
  for (const { re, role } of ROLEPLAY_PATTERNS) {
    if (re.test(text)) {
      const m = text.match(re);
      roleplay = role === 'roleplay_custom' ? m[0].toLowerCase() : role;
      break;
    }
  }
  const tooFast = TOO_FAST_PATTERNS.some((p) => p.test(text));
  const tooSlow = TOO_SLOW_PATTERNS.some((p) => p.test(text));
  return { finished, roleplay, tooFast, tooSlow };
}

// ─── Arranque y finalización de sesión ───────────────────────────────────────

/**
 * Arranca una sesión v2. Idempotente por sessionId (si ya existe state, lo
 * devuelve sin duplicar).
 *
 * @param {{
 *   sessionId: number,  // id de la sesión business en sexting_sessions
 *   clientId: number,
 *   templateId: string, // st_5min / st_10min / st_15min
 *   onFinish?: (sessionId: number, reason: string) => Promise<void>,
 *   roleplayContext?: string|null,
 * }} params
 */
export async function startSextingSessionV2({
  sessionId, clientId, templateId, onFinish = null, roleplayContext = null,
}) {
  const products = getProducts();
  const template = products.sexting_templates.find((t) => t.id === templateId);
  if (!template) throw new Error(`sexting v2: template "${templateId}" not found`);

  // Idempotencia — si ya existe, no duplicamos
  const existing = await loadState(sessionId);
  if (existing) {
    log.info({ session_id: sessionId }, 'sexting v2: session state already exists — skipping create');
    return existing;
  }

  // Snapshot inicial del pool (con flag used=false)
  const mediaPool = template.media_pool.map((m) => ({ ...m, used: false }));

  const state = await insertSessionState({
    sessionId, clientId, templateId,
    durationMin: template.duracion_min,
    mediaPool,
    roleplayContext,
  });

  // Timer de fin (tiempo límite de la plantilla)
  const endTimer = setTimeout(async () => {
    try {
      await finishSexting(sessionId, 'time_up');
      if (onFinish) await onFinish(sessionId, 'time_up');
    } catch (err) {
      log.error({ err, session_id: sessionId }, 'sexting v2: end timer handler failed');
    }
  }, template.duracion_min * 60 * 1000);
  _endTimers.set(sessionId, { endTimer });

  log.info({
    session_id: sessionId, client_id: clientId, template_id: templateId,
    duration_min: template.duracion_min,
  }, 'sexting v2: session started');

  return state;
}

/**
 * Finaliza una sesión: marca end_reason, limpia timer, deja la media pool
 * "liberada" (en el nuevo modelo reserved_for_sexting es global, no por
 * sesión — no hay que revertir nada en media).
 */
export async function finishSexting(sessionId, reason) {
  const t = _endTimers.get(sessionId);
  if (t) { clearTimeout(t.endTimer); _endTimers.delete(sessionId); }
  await query(
    `UPDATE sexting_sessions_state
        SET ended_at = NOW(), end_reason = $2, current_phase = 'cool_down',
            client_state = 'finished', updated_at = NOW()
      WHERE session_id = $1 AND ended_at IS NULL`,
    [sessionId, reason],
  );
  log.info({ session_id: sessionId, reason }, 'sexting v2: session finished');
}

/**
 * Decide el siguiente paso en el loop conversacional tras un mensaje del
 * cliente. NO envía mensajes — devuelve una "orden" que el orchestrator
 * ejecuta. Así el conductor v2 es testeable sin mockear telegram.
 *
 * @param {{
 *   sessionId: number,
 *   clientMessage: string,
 *   now?: number,       // inyectable para tests
 *   rand?: () => number,// inyectable para tests
 * }} params
 * @returns {Promise<{
 *   action: 'respond' | 'respond_and_send_media' | 'finish',
 *   reason: string,
 *   mediaId?: string,         // media_id lógico (ext_m_XXX)
 *   captionBase?: string,
 *   phase: string,
 *   clientState: string,
 *   roleplay: string|null,
 *   isClimax?: boolean,
 *   elapsedSec: number,
 * }>}
 */
export async function handleClientTurn({ sessionId, clientMessage, now = Date.now(), rand = Math.random }) {
  const state = await loadState(sessionId);
  if (!state) throw new Error(`sexting v2: no state for session ${sessionId}`);
  if (state.ended_at) return { action: 'finish', reason: 'already_ended', phase: state.current_phase, clientState: state.client_state, roleplay: state.roleplay_context, elapsedSec: 0 };

  const products = getProducts();
  const template = products.sexting_templates.find((t) => t.id === state.template_id);
  if (!template) throw new Error(`sexting v2: template ${state.template_id} vanished from catalog`);

  const startedAtMs = new Date(state.started_at).getTime();
  const elapsedSec = (now - startedAtMs) / 1000;

  // Timeout por tiempo total — el orchestrator debe haber ejecutado onFinish,
  // pero si aquí llega antes del timer, forzamos fin
  if (elapsedSec >= template.duracion_min * 60) {
    await finishSexting(sessionId, 'time_up');
    return { action: 'finish', reason: 'time_up', phase: 'cool_down', clientState: 'finished', roleplay: state.roleplay_context, elapsedSec };
  }

  // Análisis del cliente
  const analysis = analyzeClientMessage(clientMessage);
  let clientStateNext = state.client_state;
  if (analysis.tooFast) clientStateNext = 'rushed';
  else if (analysis.tooSlow) clientStateNext = 'cold';
  else clientStateNext = 'engaged';

  let roleplay = state.roleplay_context;
  if (analysis.roleplay && !roleplay) roleplay = analysis.roleplay;

  // Saltar a climax si el cliente dice que ha acabado
  if (analysis.finished) {
    const pool = parsePool(state.media_pool_snapshot);
    const climax = pool.find((m) => m.is_climax_media && !m.used);
    if (climax) {
      const newPool = markMediaUsed(pool, climax.media_id);
      await updateState(sessionId, {
        current_phase: 'climax',
        client_state: 'engaged',
        media_pool_snapshot: newPool,
        media_sent_count: state.media_sent_count + 1,
        messages_since_last_media: 0,
        last_media_sent_at: new Date(now),
        roleplay_context: roleplay,
      });
      return {
        action: 'respond_and_send_media',
        reason: 'client_finished_jump_to_climax',
        mediaId: climax.media_id,
        captionBase: climax.caption_base,
        isClimax: true,
        phase: 'climax',
        clientState: 'engaged',
        roleplay,
        elapsedSec,
      };
    }
    // No hay climax disponible → pasar a cool_down sin media
    await updateState(sessionId, { current_phase: 'cool_down', client_state: 'finished', roleplay_context: roleplay });
    return { action: 'respond', reason: 'client_finished_no_climax', phase: 'cool_down', clientState: 'finished', roleplay, elapsedSec };
  }

  // Fase derivada del tiempo
  const phase = inferPhaseFromTime(template, elapsedSec);

  // Contador de mensajes desde última media
  const messagesSinceLastMedia = state.messages_since_last_media + 1;

  // Estado actualizado en memoria para la decisión
  const decisionState = {
    ...state,
    current_phase: phase,
    client_state: clientStateNext,
    messages_since_last_media: messagesSinceLastMedia,
  };

  const decision = shouldSendMediaNow(decisionState, template, { rand, now });

  if (!decision.send) {
    await updateState(sessionId, {
      current_phase: phase,
      client_state: clientStateNext,
      messages_since_last_media: messagesSinceLastMedia,
      roleplay_context: roleplay,
    });
    return {
      action: 'respond',
      reason: decision.reason,
      phase,
      clientState: clientStateNext,
      roleplay,
      elapsedSec,
    };
  }

  // Seleccionamos media
  const next = selectNextMedia(decisionState);
  if (!next) {
    // pool agotado — respondemos solo con texto
    await updateState(sessionId, {
      current_phase: phase,
      client_state: clientStateNext,
      messages_since_last_media: messagesSinceLastMedia,
      roleplay_context: roleplay,
    });
    return {
      action: 'respond',
      reason: 'pool_empty',
      phase,
      clientState: clientStateNext,
      roleplay,
      elapsedSec,
    };
  }

  const pool = parsePool(state.media_pool_snapshot);
  const newPool = markMediaUsed(pool, next.media_id);
  await updateState(sessionId, {
    current_phase: next.is_climax_media ? 'climax' : phase,
    client_state: clientStateNext,
    media_pool_snapshot: newPool,
    media_sent_count: state.media_sent_count + 1,
    messages_since_last_media: 0,
    last_media_sent_at: new Date(now),
    roleplay_context: roleplay,
  });

  return {
    action: 'respond_and_send_media',
    reason: decision.reason,
    mediaId: next.media_id,
    captionBase: next.caption_base,
    isClimax: next.is_climax_media === true,
    phase: next.is_climax_media ? 'climax' : phase,
    clientState: clientStateNext,
    roleplay,
    elapsedSec,
  };
}

function parsePool(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') return JSON.parse(raw);
  return [];
}

/**
 * Resuelve la media lógica al file_id real vía content-dispatcher.
 * Thin wrapper para que el orchestrator no tenga que conocer content-dispatcher.
 */
export async function resolveMediaFile(mediaLogicalId) {
  return resolveSextingMedia(mediaLogicalId);
}

/**
 * Restaura los timers de sesiones activas al reiniciar el proceso.
 * Llamar desde src/index.js tras `runMigrations`.
 */
export async function restoreTimers(onFinish = null) {
  const { rows } = await query(
    `SELECT session_id, template_id, started_at FROM sexting_sessions_state
     WHERE ended_at IS NULL`,
  );
  const products = getProducts();
  const now = Date.now();
  let restored = 0;
  for (const r of rows) {
    const template = products.sexting_templates.find((t) => t.id === r.template_id);
    if (!template) continue;
    const startedAt = new Date(r.started_at).getTime();
    const endAt = startedAt + template.duracion_min * 60 * 1000;
    const msLeft = endAt - now;
    if (msLeft <= 0) {
      // Ya debería haber terminado — cierre inmediato
      await finishSexting(r.session_id, 'time_up');
      if (onFinish) await onFinish(r.session_id, 'time_up');
      continue;
    }
    const endTimer = setTimeout(async () => {
      await finishSexting(r.session_id, 'time_up');
      if (onFinish) await onFinish(r.session_id, 'time_up');
    }, msLeft);
    _endTimers.set(r.session_id, { endTimer });
    restored++;
  }
  log.info({ restored_count: restored }, 'sexting v2: timers restored');
  return restored;
}
