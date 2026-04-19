import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock db
const queryMock = vi.fn();
vi.mock('./db.js', () => ({
  query: (...args) => queryMock(...args),
}));

// Mock products config
vi.mock('../config/products.js', () => ({
  getProducts: vi.fn(() => ({
    sexting_templates: [
      {
        id: 'st_5min',
        duracion_min: 5,
        precio_eur: 15,
        media_pool: [
          { media_id: 'ext_m_001', phase_hint: 'warm_up', order_hint: 1, caption_base: 'mira', is_climax_media: false },
        ],
        phases_order: ['warm_up', 'teasing', 'escalada', 'climax', 'cool_down'],
        phases_duration_target_seg: { warm_up: 60, teasing: 90, escalada: 90, climax: 30, cool_down: 30 },
        cadencia_target: { min_segundos_entre_medias: 30, mensajes_max_sin_media: 5, mensajes_por_media_objetivo: 3 },
      },
    ],
  })),
}));

// Mock the v2 conductor's exports — we don't want to test the engine itself
// here, only the bridge wiring.
const startV2Mock = vi.fn();
const emitKickoffMock = vi.fn();
const resolveMediaMock = vi.fn();
vi.mock('./sexting-conductor.js', () => ({
  startSextingSessionV2: (...args) => startV2Mock(...args),
  emitInitialKickoff: (...args) => emitKickoffMock(...args),
  resolveMediaFile: (...args) => resolveMediaMock(...args),
}));

const {
  detectRoleplayFromHistory,
  getActiveV2SessionForClient,
  startSextingV2ForClient,
} = await import('./sexting-bridge.js');

beforeEach(() => {
  queryMock.mockReset();
  startV2Mock.mockReset();
  emitKickoffMock.mockReset();
  resolveMediaMock.mockReset();
  // Default: kickoff returns a warm_up media (most common case in tests).
  emitKickoffMock.mockResolvedValue({
    action: 'send_kickoff', reason: 'kickoff_warm_up',
    mediaId: 'ext_m_001', captionBase: 'mira',
    phase: 'warm_up', clientState: 'engaged', roleplay: null,
  });
  resolveMediaMock.mockResolvedValue({ file_id: 'TG_FILE_001', tipo: 'photo' });
});

describe('detectRoleplayFromHistory', () => {
  it('returns null when no roleplay keywords present', () => {
    const history = [{ role: 'user', content: 'hola, me apetece sexting' }];
    expect(detectRoleplayFromHistory(history, '5 min')).toBeNull();
  });

  it('detects "profesora" from history', () => {
    const history = [
      { role: 'user', content: 'hola' },
      { role: 'user', content: 'sé mi profe' },
    ];
    expect(detectRoleplayFromHistory(history, '')).toBe('profesora');
  });

  it('detects "doctora" from current text', () => {
    expect(detectRoleplayFromHistory([], 'sé mi doctora porfa')).toBe('doctora');
  });

  it('detects "jefa" from history', () => {
    const history = [{ role: 'user', content: 'quiero que seas mi jefa' }];
    expect(detectRoleplayFromHistory(history, '')).toBe('jefa');
  });

  it('only looks at user role messages, not assistant', () => {
    const history = [{ role: 'assistant', content: 'soy tu profe' }];
    expect(detectRoleplayFromHistory(history, '')).toBeNull();
  });
});

describe('getActiveV2SessionForClient', () => {
  it('returns null when clientId is missing', async () => {
    expect(await getActiveV2SessionForClient(null)).toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('returns null when no active session row exists', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    expect(await getActiveV2SessionForClient(42)).toBeNull();
    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/sexting_sessions_state/);
    expect(sql).toMatch(/ended_at IS NULL/);
    expect(params).toEqual([42]);
  });

  it('returns the active state row when present', async () => {
    const stateRow = { id: 7, session_id: 11, client_id: 42, current_phase: 'teasing' };
    queryMock.mockResolvedValueOnce({ rows: [stateRow] });
    expect(await getActiveV2SessionForClient(42)).toEqual(stateRow);
  });
});

describe('startSextingV2ForClient', () => {
  it('throws when clientId is missing', async () => {
    await expect(startSextingV2ForClient({ templateId: 'st_5min' }))
      .rejects.toThrow(/clientId required/);
  });

  it('throws when templateId is missing', async () => {
    await expect(startSextingV2ForClient({ clientId: 1 }))
      .rejects.toThrow(/templateId required/);
  });

  it('throws when template is unknown', async () => {
    await expect(startSextingV2ForClient({ clientId: 1, templateId: 'st_99min' }))
      .rejects.toThrow(/template "st_99min" not found/);
  });

  it('inserts sexting_sessions row and calls startSextingSessionV2', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 555 }] }); // INSERT
    startV2Mock.mockResolvedValueOnce({ session_id: 555, current_phase: 'warm_up' });

    const result = await startSextingV2ForClient({
      clientId: 42,
      templateId: 'st_5min',
      transactionId: 99,
      roleplayContext: 'doctora',
    });

    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO sexting_sessions/);
    expect(sql).toMatch(/RETURNING id/);
    expect(sql).toMatch(/INTERVAL '5 minutes'/);
    expect(params).toEqual([42, 99]);

    expect(startV2Mock).toHaveBeenCalledTimes(1);
    expect(startV2Mock).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 555,
      clientId: 42,
      templateId: 'st_5min',
      roleplayContext: 'doctora',
    }));

    expect(result.sessionId).toBe(555);
  });

  it('passes onFinish through to the engine', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    startV2Mock.mockResolvedValueOnce({});
    const onFinish = vi.fn();
    await startSextingV2ForClient({ clientId: 1, templateId: 'st_5min', onFinish });
    expect(startV2Mock).toHaveBeenCalledWith(expect.objectContaining({ onFinish }));
  });

  // ── Kickoff post-pago (FIX F1) ─────────────────────────────────────────────
  it('emits kickoff after starting v2 and resolves media file', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 555 }] });
    startV2Mock.mockResolvedValueOnce({ session_id: 555 });

    const result = await startSextingV2ForClient({
      clientId: 42, templateId: 'st_5min', roleplayContext: 'doctora',
    });

    expect(emitKickoffMock).toHaveBeenCalledWith({ sessionId: 555 });
    expect(resolveMediaMock).toHaveBeenCalledWith('ext_m_001');
    expect(result.kickoff).toBeDefined();
    expect(result.kickoff.action).toBe('send_kickoff');
    expect(result.kickoff.mediaId).toBe('ext_m_001');
    expect(result.kickoff.captionBase).toBe('mira');
    expect(result.kickoff.mediaFile).toEqual({ file_id: 'TG_FILE_001', tipo: 'photo' });
  });

  it('kickoff with no media: returns kickoff with mediaFile=null', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 600 }] });
    startV2Mock.mockResolvedValueOnce({});
    emitKickoffMock.mockResolvedValueOnce({
      action: 'send_kickoff', reason: 'pool_empty',
      mediaId: null, captionBase: null,
      phase: 'warm_up', clientState: 'engaged', roleplay: null,
    });

    const result = await startSextingV2ForClient({ clientId: 1, templateId: 'st_5min' });
    expect(resolveMediaMock).not.toHaveBeenCalled();
    expect(result.kickoff.mediaId).toBeNull();
    expect(result.kickoff.mediaFile).toBeNull();
  });

  it('kickoff failure does not break the start (returns sessionId+state)', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 777 }] });
    startV2Mock.mockResolvedValueOnce({ session_id: 777 });
    emitKickoffMock.mockRejectedValueOnce(new Error('boom'));

    const result = await startSextingV2ForClient({ clientId: 1, templateId: 'st_5min' });
    expect(result.sessionId).toBe(777);
    expect(result.kickoff.action).toBe('skip');
  });

  it('resolveMediaFile failure: kickoff still returned with mediaFile=null', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 888 }] });
    startV2Mock.mockResolvedValueOnce({});
    resolveMediaMock.mockRejectedValueOnce(new Error('not found'));

    const result = await startSextingV2ForClient({ clientId: 1, templateId: 'st_5min' });
    expect(result.kickoff.action).toBe('send_kickoff');
    expect(result.kickoff.mediaFile).toBeNull();
  });
});
