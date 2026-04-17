import { describe, it, expect, vi } from 'vitest';

// db.js debe estar mockeado para que no intente conectarse en tests unitarios
vi.mock('./db.js', () => ({ query: vi.fn() }));

import {
  inferPhaseFromTime,
  shouldSendMediaNow,
  selectNextMedia,
  markMediaUsed,
  analyzeClientMessage,
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
