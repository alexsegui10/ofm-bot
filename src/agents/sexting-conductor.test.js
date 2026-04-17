import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resolvePlaylistId,
  startSextingSession,
  cancelSextingSession,
  updateSessionRoleplay,
  getActiveSession,
  clearAllSextingTimers,
  _getActiveSessions,
} from './sexting-conductor.js';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../lib/db.js', () => ({
  query: vi.fn(),
}));

vi.mock('../lib/telegram.js', () => ({
  sendMessage: vi.fn().mockResolvedValue({}),
}));

vi.mock('./persona.js', () => ({
  runPersona: vi.fn().mockResolvedValue('mensaje de prueba del sexting'),
}));

vi.mock('./profile-manager.js', () => ({
  getClientById: vi.fn().mockResolvedValue({
    id: 1, username: 'testfan', num_compras: 3, total_gastado: 90, profile: {},
  }),
}));

import { query } from '../lib/db.js';
import { sendMessage } from '../lib/telegram.js';
import { runPersona } from './persona.js';

const PLAYLIST_QUICK = {
  id: 'calenton_rapido',
  name: 'Calentón Rápido',
  duration_minutes: 10,
  phases: [
    { phase_index: 0, name: 'Arranque', start_offset_seconds: 0, prompt_hint: 'fase 0 hint', intensity: 1, mensaje_base: 'llevas un rato en mi cabeza bebe' },
    { phase_index: 1, name: 'Calentamiento', start_offset_seconds: 150, prompt_hint: 'fase 1 hint', intensity: 2, mensaje_base: 'te gusta como me queda esta lencería bebe?' },
  ],
};

function mockPlaylist(playlist = PLAYLIST_QUICK) {
  query.mockImplementation(async (sql) => {
    if (sql.includes('sexting_playlists')) return { rows: [playlist] };
    if (sql.includes('INSERT INTO sexting_sessions')) return { rows: [{ id: 42 }] };
    if (sql.includes('UPDATE sexting_sessions')) return { rows: [] };
    if (sql.includes('SELECT * FROM sexting_sessions')) return { rows: [] };
    return { rows: [] };
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  clearAllSextingTimers();
});

afterEach(() => {
  clearAllSextingTimers();
  vi.useRealTimers();
});

// ─── resolvePlaylistId ────────────────────────────────────────────────────────

describe('resolvePlaylistId', () => {
  it('maps basico_10min product to calenton_rapido', () => {
    expect(resolvePlaylistId('sexting__paquetes_predefinidos_basico_10min')).toBe('calenton_rapido');
  });

  it('maps completo_20min product to noche_completa', () => {
    expect(resolvePlaylistId('sexting__paquetes_predefinidos_completo_20min')).toBe('noche_completa');
  });

  it('maps intenso_30min product to noche_completa', () => {
    expect(resolvePlaylistId('sexting__paquetes_predefinidos_intenso_30min')).toBe('noche_completa');
  });

  it('falls back to calenton_rapido for unknown productId', () => {
    expect(resolvePlaylistId('unknown_product')).toBe('calenton_rapido');
    expect(resolvePlaylistId(null)).toBe('calenton_rapido');
  });
});

// ─── startSextingSession ──────────────────────────────────────────────────────

describe('startSextingSession', () => {
  it('creates a DB session and returns sessionId + playlistId', async () => {
    mockPlaylist();
    const result = await startSextingSession({
      transactionId: 10,
      clientId: 1,
      chatId: 111222,
      businessConnectionId: 'conn_1',
    });
    expect(result.sessionId).toBe(42);
    expect(result.playlistId).toBe('calenton_rapido');
  });

  it('registers session in _sessions map', async () => {
    mockPlaylist();
    await startSextingSession({
      transactionId: 10, clientId: 1, chatId: 111222, businessConnectionId: 'conn_1',
    });
    expect(_getActiveSessions().size).toBe(1);
  });

  it('uses explicitly provided playlistId over productId mapping', async () => {
    mockPlaylist({ ...PLAYLIST_QUICK, id: 'noche_completa' });
    const result = await startSextingSession({
      transactionId: 10, clientId: 1, chatId: 111222, businessConnectionId: 'conn_1',
      playlistId: 'noche_completa',
    });
    expect(result.playlistId).toBe('noche_completa');
  });

  it('throws if playlist not found in DB', async () => {
    query.mockResolvedValue({ rows: [] });
    await expect(
      startSextingSession({ transactionId: 1, clientId: 1, chatId: 1, businessConnectionId: 'c' }),
    ).rejects.toThrow('not found');
  });

  it('stores currentRoleplay in session data', async () => {
    mockPlaylist();
    await startSextingSession({
      transactionId: 10, clientId: 1, chatId: 111222, businessConnectionId: 'conn_1',
      currentRoleplay: 'doctora',
    });
    const session = [..._getActiveSessions().values()][0];
    expect(session.currentRoleplay).toBe('doctora');
  });

  it('executes phase 0 immediately (offset 0)', async () => {
    mockPlaylist();
    await startSextingSession({
      transactionId: 10, clientId: 1, chatId: 111222, businessConnectionId: 'conn_1',
    });
    await vi.runAllTimersAsync();
    expect(runPersona).toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalled();
  });

  it('uses mensaje_base in instruction when present', async () => {
    mockPlaylist();
    await startSextingSession({
      transactionId: 10, clientId: 1, chatId: 111222, businessConnectionId: 'conn_1',
    });
    await vi.runAllTimersAsync();
    const [,,,, instruction] = runPersona.mock.calls[0];
    expect(instruction).toContain('llevas un rato en mi cabeza bebe');
  });

  it('injects roleplay into Persona instruction when present', async () => {
    mockPlaylist();
    await startSextingSession({
      transactionId: 10, clientId: 1, chatId: 111222, businessConnectionId: 'conn_1',
      currentRoleplay: 'profesora',
    });
    await vi.runAllTimersAsync();
    const [,,,, instruction] = runPersona.mock.calls[0];
    expect(instruction).toContain('profesora');
  });

  it('falls back to prompt_hint when mensaje_base is empty', async () => {
    const playlistNoBase = {
      ...PLAYLIST_QUICK,
      phases: [
        { phase_index: 0, name: 'Arranque', start_offset_seconds: 0, prompt_hint: 'usa este hint', intensity: 1, mensaje_base: '' },
      ],
    };
    mockPlaylist(playlistNoBase);
    await startSextingSession({
      transactionId: 10, clientId: 1, chatId: 111222, businessConnectionId: 'conn_1',
    });
    await vi.runAllTimersAsync();
    const [,,,, instruction] = runPersona.mock.calls[0];
    expect(instruction).toBe('usa este hint');
  });

  it('sends end message and removes from _sessions when session expires', async () => {
    mockPlaylist();
    await startSextingSession({
      transactionId: 10, clientId: 1, chatId: 111222, businessConnectionId: 'conn_1',
    });
    await vi.runAllTimersAsync();
    expect(_getActiveSessions().size).toBe(0);
    const endCall = sendMessage.mock.calls.at(-1);
    expect(endCall[2]).toContain('noche increíble');
  });
});

// ─── cancelSextingSession ─────────────────────────────────────────────────────

describe('cancelSextingSession', () => {
  it('removes session from map and updates DB', async () => {
    mockPlaylist();
    await startSextingSession({
      transactionId: 10, clientId: 1, chatId: 111222, businessConnectionId: 'conn_1',
    });
    expect(_getActiveSessions().size).toBe(1);

    // Reset mock for the UPDATE call
    query.mockResolvedValue({ rows: [] });
    await cancelSextingSession(42);

    expect(_getActiveSessions().size).toBe(0);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('expired'), [42]);
  });

  it('is safe to call with unknown sessionId', async () => {
    query.mockResolvedValue({ rows: [] });
    await expect(cancelSextingSession(9999)).resolves.not.toThrow();
  });
});

// ─── updateSessionRoleplay ────────────────────────────────────────────────────

describe('updateSessionRoleplay', () => {
  it('updates in-memory and DB roleplay', async () => {
    mockPlaylist();
    await startSextingSession({
      transactionId: 10, clientId: 1, chatId: 111222, businessConnectionId: 'conn_1',
    });

    query.mockResolvedValue({ rows: [] });
    await updateSessionRoleplay(42, 'enfermera');

    const session = _getActiveSessions().get(42);
    expect(session.currentRoleplay).toBe('enfermera');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('current_roleplay'),
      ['enfermera', 42],
    );
  });
});

// ─── getActiveSession ─────────────────────────────────────────────────────────

describe('getActiveSession', () => {
  it('returns null when no active session', async () => {
    query.mockResolvedValue({ rows: [] });
    expect(await getActiveSession(1)).toBeNull();
  });

  it('returns session row when found', async () => {
    query.mockResolvedValue({ rows: [{ id: 42, client_id: 1, status: 'active' }] });
    expect(await getActiveSession(1)).toMatchObject({ id: 42, status: 'active' });
  });
});
