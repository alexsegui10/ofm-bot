import { describe, it, expect, vi, beforeEach } from 'vitest';

// db.js debe estar mockeado para que no intente conectarse en tests unitarios
vi.mock('./db.js', () => ({ query: vi.fn() }));
vi.mock('../config/products.js', () => ({
  getProducts: () => ({
    sexting_templates: [
      {
        id: 'st_5min',
        duracion_min: 5,
        cadencia_target: { mensajes_por_media_objetivo: 2.5, mensajes_max_sin_media: 4, min_segundos_entre_medias: 30 },
        phases_order: ['warm_up', 'teasing', 'escalada', 'climax', 'cool_down'],
        phases_duration_target_seg: { warm_up: 45, teasing: 75, escalada: 120, climax: 45, cool_down: 15 },
        media_pool: [
          { media_id: 'ext_m_001', phase_hint: 'warm_up', order_hint: 1, caption_base: 'cap_w1', is_climax_media: false },
          { media_id: 'ext_m_002', phase_hint: 'teasing', order_hint: 2, caption_base: 'cap_t1', is_climax_media: false },
        ],
      },
    ],
  }),
}));

import { query } from './db.js';
import {
  inferPhaseFromTime,
  shouldSendMediaNow,
  selectNextMedia,
  markMediaUsed,
  analyzeClientMessage,
  emitInitialKickoff,
} from './sexting-conductor.js';

// Template mínimo para tests (espejo de products.json st_10min)
const TEMPLATE_10 = {
  id: 'st_10min',
  duracion_min: 10,
  cadencia_target: {
    mensajes_por_media_objetivo: 2.5,
    mensajes_max_sin_media: 4,
    min_segundos_entre_medias: 45,
  },
  phases_order: ['warm_up', 'teasing', 'escalada', 'climax', 'cool_down'],
  phases_duration_target_seg: {
    warm_up: 90, teasing: 120, escalada: 240, climax: 90, cool_down: 60,
  },
  media_pool: [
    { media_id: 'ext_m_101', phase_hint: 'warm_up', order_hint: 1, caption_base: 'c1', intensity: 'low', is_climax_media: false },
    { media_id: 'ext_m_102', phase_hint: 'warm_up', order_hint: 2, caption_base: 'c2', intensity: 'low', is_climax_media: false },
    { media_id: 'ext_m_103', phase_hint: 'teasing', order_hint: 3, caption_base: 'c3', intensity: 'medium', is_climax_media: false },
    { media_id: 'ext_m_108', phase_hint: 'climax',  order_hint: 8, caption_base: 'me corro', intensity: 'peak', is_climax_media: true },
  ],
};

// ─── inferPhaseFromTime ──────────────────────────────────────────────────────

describe('inferPhaseFromTime', () => {
  it('warm_up al principio', () => {
    expect(inferPhaseFromTime(TEMPLATE_10, 30)).toBe('warm_up');
  });
  it('teasing tras warm_up', () => {
    // warm_up termina a los 90s
    expect(inferPhaseFromTime(TEMPLATE_10, 100)).toBe('teasing');
  });
  it('escalada en mitad', () => {
    // tras warm_up (90) + teasing (120) = 210
    expect(inferPhaseFromTime(TEMPLATE_10, 300)).toBe('escalada');
  });
  it('cool_down al final', () => {
    // total = 600s
    expect(inferPhaseFromTime(TEMPLATE_10, 590)).toBe('cool_down');
  });
  it('tras fin → última fase', () => {
    expect(inferPhaseFromTime(TEMPLATE_10, 9999)).toBe('cool_down');
  });
});

// ─── shouldSendMediaNow ──────────────────────────────────────────────────────

describe('shouldSendMediaNow', () => {
  const baseNow = 1_000_000_000_000;
  const baseState = {
    current_phase: 'teasing',
    client_state: 'engaged',
    messages_since_last_media: 2,
    last_media_sent_at: new Date(baseNow - 60_000), // hace 60s
  };

  it('NO envía si no ha pasado el mínimo entre medias', () => {
    const state = { ...baseState, last_media_sent_at: new Date(baseNow - 20_000) };
    const r = shouldSendMediaNow(state, TEMPLATE_10, { now: baseNow, rand: () => 0 });
    expect(r.send).toBe(false);
    expect(r.reason).toBe('too_soon');
  });

  it('SÍ envía si llegamos al max de mensajes sin media', () => {
    const state = { ...baseState, messages_since_last_media: 4 };
    const r = shouldSendMediaNow(state, TEMPLATE_10, { now: baseNow, rand: () => 0.99 });
    expect(r.send).toBe(true);
    expect(r.reason).toBe('max_messages_reached');
  });

  it('probabilidad sube en escalada', () => {
    const state = { ...baseState, current_phase: 'escalada', messages_since_last_media: 2 };
    // ratio = 2/2.5 = 0.8, prob base = 0.4, +0.15 = 0.55
    const r = shouldSendMediaNow(state, TEMPLATE_10, { now: baseNow, rand: () => 0.5 });
    expect(r.send).toBe(true);
    expect(r.reason).toMatch(/prob_0\.5/);
  });

  it('probabilidad baja en warm_up', () => {
    const state = { ...baseState, current_phase: 'warm_up', messages_since_last_media: 2 };
    // ratio = 0.8 * 0.5 = 0.4, -0.10 = 0.30
    const r = shouldSendMediaNow(state, TEMPLATE_10, { now: baseNow, rand: () => 0.5 });
    expect(r.send).toBe(false);
  });

  it('cliente cold sube probabilidad', () => {
    const state = { ...baseState, client_state: 'cold', messages_since_last_media: 2 };
    // 0.4 + 0.20 = 0.6
    const r = shouldSendMediaNow(state, TEMPLATE_10, { now: baseNow, rand: () => 0.5 });
    expect(r.send).toBe(true);
  });

  it('last_media null (primera media) — no too_soon', () => {
    const state = { ...baseState, last_media_sent_at: null, messages_since_last_media: 3 };
    const r = shouldSendMediaNow(state, TEMPLATE_10, { now: baseNow, rand: () => 0.1 });
    // too_soon no aplica → decision flexible
    expect(r.reason).not.toBe('too_soon');
  });
});

// ─── selectNextMedia ─────────────────────────────────────────────────────────

describe('selectNextMedia', () => {
  it('prefiere media de la fase actual', () => {
    const pool = TEMPLATE_10.media_pool.map((m) => ({ ...m, used: false }));
    const state = { current_phase: 'teasing', media_pool_snapshot: pool };
    const next = selectNextMedia(state);
    expect(next.media_id).toBe('ext_m_103'); // único teasing
  });

  it('si no hay de la fase, coge el siguiente global', () => {
    const pool = TEMPLATE_10.media_pool.map((m) => ({ ...m, used: m.phase_hint !== 'warm_up' }));
    // marcamos todos menos warm_up como usados
    const state = { current_phase: 'escalada', media_pool_snapshot: pool };
    const next = selectNextMedia(state);
    expect(next.phase_hint).toBe('warm_up');
    expect(next.order_hint).toBe(1);
  });

  it('devuelve null si todo usado', () => {
    const pool = TEMPLATE_10.media_pool.map((m) => ({ ...m, used: true }));
    const state = { current_phase: 'teasing', media_pool_snapshot: pool };
    expect(selectNextMedia(state)).toBeNull();
  });

  it('acepta media_pool_snapshot como string JSON', () => {
    const pool = TEMPLATE_10.media_pool.map((m) => ({ ...m, used: false }));
    const state = { current_phase: 'warm_up', media_pool_snapshot: JSON.stringify(pool) };
    const next = selectNextMedia(state);
    expect(next.media_id).toBe('ext_m_101');
  });
});

// ─── markMediaUsed ───────────────────────────────────────────────────────────

describe('markMediaUsed', () => {
  it('marca la media correcta sin tocar las demás', () => {
    const pool = TEMPLATE_10.media_pool.map((m) => ({ ...m, used: false }));
    const out = markMediaUsed(pool, 'ext_m_103');
    expect(out.find((m) => m.media_id === 'ext_m_103').used).toBe(true);
    expect(out.find((m) => m.media_id === 'ext_m_101').used).toBe(false);
    // inmutable
    expect(pool.find((m) => m.media_id === 'ext_m_103').used).toBe(false);
  });
});

// ─── analyzeClientMessage ────────────────────────────────────────────────────

describe('analyzeClientMessage', () => {
  it('detects "me corrí" → finished', () => {
    const a = analyzeClientMessage('me corrí bebe');
    expect(a.finished).toBe(true);
  });

  it('detects "ya está" → finished', () => {
    const a = analyzeClientMessage('ya está, buff');
    expect(a.finished).toBe(true);
  });

  it('detects 💦 → finished', () => {
    const a = analyzeClientMessage('💦💦');
    expect(a.finished).toBe(true);
  });

  it('detects roleplay profe', () => {
    const a = analyzeClientMessage('haz de mi profe');
    expect(a.roleplay).toBe('profesora');
  });

  it('detects roleplay doctora', () => {
    const a = analyzeClientMessage('sé mi doctora');
    expect(a.roleplay).toBe('doctora');
  });

  it('detects too fast', () => {
    expect(analyzeClientMessage('más rápido').tooFast).toBe(true);
  });

  it('detects too slow', () => {
    expect(analyzeClientMessage('despacito bebe').tooSlow).toBe(true);
  });

  it('empty text → all false', () => {
    expect(analyzeClientMessage('')).toEqual({ finished: false, roleplay: null, tooFast: false, tooSlow: false });
  });

  it('normal text → neutral', () => {
    const a = analyzeClientMessage('dime cómo estás');
    expect(a.finished).toBe(false);
    expect(a.roleplay).toBeNull();
  });
});

// ─── emitInitialKickoff ─────────────────────────────────────────────────────
describe('emitInitialKickoff', () => {
  beforeEach(() => vi.clearAllMocks());

  function mockState({ media_sent_count = 0, ended_at = null, roleplay_context = null, current_phase = 'warm_up', client_state = 'engaged' } = {}) {
    return {
      session_id: 1,
      template_id: 'st_5min',
      media_sent_count,
      ended_at,
      roleplay_context,
      current_phase,
      client_state,
      messages_since_last_media: 0,
      media_pool_snapshot: [
        { media_id: 'ext_m_001', phase_hint: 'warm_up', order_hint: 1, caption_base: 'cap_w1', is_climax_media: false, used: false },
        { media_id: 'ext_m_002', phase_hint: 'teasing', order_hint: 2, caption_base: 'cap_t1', is_climax_media: false, used: false },
      ],
    };
  }

  it('selecciona la primera media warm_up del pool y la marca usada', async () => {
    query.mockResolvedValueOnce({ rows: [mockState()] });   // SELECT loadState
    query.mockResolvedValueOnce({ rows: [] });              // UPDATE state

    const r = await emitInitialKickoff({ sessionId: 1 });

    expect(r.action).toBe('send_kickoff');
    expect(r.mediaId).toBe('ext_m_001');
    expect(r.captionBase).toBe('cap_w1');
    expect(r.phase).toBe('warm_up');
    expect(r.clientState).toBe('engaged');

    // Verifica que UPDATE se llamó con media_pool_snapshot que marca ext_m_001 como used.
    const updateCall = query.mock.calls[1];
    const updateSql = updateCall[0];
    expect(updateSql).toMatch(/UPDATE sexting_sessions_state/);
    const updateValues = updateCall[1];
    // session_id en $1, valores van en $2..$N
    const poolJson = updateValues.find((v) => typeof v === 'string' && v.includes('ext_m_001'));
    expect(poolJson).toBeTruthy();
    expect(poolJson).toMatch(/"used":true/);
  });

  it('preserva roleplay_context en la respuesta', async () => {
    query.mockResolvedValueOnce({ rows: [mockState({ roleplay_context: 'profesora' })] });
    query.mockResolvedValueOnce({ rows: [] });
    const r = await emitInitialKickoff({ sessionId: 1 });
    expect(r.roleplay).toBe('profesora');
  });

  it('idempotente: si media_sent_count > 0 → action=skip, no toca DB', async () => {
    query.mockResolvedValueOnce({ rows: [mockState({ media_sent_count: 1 })] });
    const r = await emitInitialKickoff({ sessionId: 1 });
    expect(r.action).toBe('skip');
    expect(r.reason).toBe('already_kicked_off');
    expect(query).toHaveBeenCalledTimes(1); // solo SELECT, no UPDATE
  });

  it('idempotente: sesión cerrada → action=skip', async () => {
    query.mockResolvedValueOnce({ rows: [mockState({ ended_at: new Date().toISOString() })] });
    const r = await emitInitialKickoff({ sessionId: 1 });
    expect(r.action).toBe('skip');
    expect(r.reason).toBe('session_already_ended');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('si no hay media warm_up disponible → cae al primer disponible por order_hint', async () => {
    const s = mockState();
    s.media_pool_snapshot[0].used = true;  // ext_m_001 ya usada → solo queda teasing
    query.mockResolvedValueOnce({ rows: [s] });
    query.mockResolvedValueOnce({ rows: [] });
    const r = await emitInitialKickoff({ sessionId: 1 });
    expect(r.action).toBe('send_kickoff');
    expect(r.mediaId).toBe('ext_m_002');  // teasing, único disponible
  });

  it('pool vacío → action=send_kickoff con mediaId=null', async () => {
    const s = mockState();
    s.media_pool_snapshot.forEach((m) => { m.used = true; });
    query.mockResolvedValueOnce({ rows: [s] });
    const r = await emitInitialKickoff({ sessionId: 1 });
    expect(r.action).toBe('send_kickoff');
    expect(r.reason).toBe('pool_empty');
    expect(r.mediaId).toBeNull();
    expect(r.captionBase).toBeNull();
    expect(query).toHaveBeenCalledTimes(1); // solo SELECT (no UPDATE en pool vacío)
  });

  it('throws si no existe state para el sessionId', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await expect(emitInitialKickoff({ sessionId: 999 })).rejects.toThrow(/no state for session 999/);
  });
});
