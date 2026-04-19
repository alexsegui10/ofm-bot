import 'dotenv/config';
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { mergeProfiles, getClientTier, getOrCreateClient, updateProfile, getClientById, markClientCatalogSeen } from './profile-manager.js';
import { closePool, query } from '../lib/db.js';

vi.mock('../lib/llm-client.js', () => ({
  callAnthropic: vi.fn(),
  callOpenRouter: vi.fn(),
}));
import { callAnthropic } from '../lib/llm-client.js';

// ─── Pure function tests (no DB) ────────────────────────────────────────────

describe('mergeProfiles', () => {
  it('merges simple scalar fields', () => {
    const merged = mergeProfiles({ nombre: 'old' }, { nombre: 'Pedro' });
    expect(merged.nombre).toBe('Pedro');
  });

  it('deduplicates array fields', () => {
    const merged = mergeProfiles(
      { gustos: ['fotos', 'videos'] },
      { gustos: ['videos', 'sexting'] },
    );
    expect(merged.gustos).toEqual(['fotos', 'videos', 'sexting']);
  });

  it('ignores null/empty values', () => {
    const merged = mergeProfiles({ nombre: 'Pedro' }, { nombre: null, otro: '' });
    expect(merged.nombre).toBe('Pedro');
    expect(merged.otro).toBeUndefined();
  });

  it('starts from empty existing profile', () => {
    const merged = mergeProfiles({}, { nombre: 'Ana', gustos: ['gym'] });
    expect(merged).toEqual({ nombre: 'Ana', gustos: ['gym'] });
  });

  it('deep-merges object fields', () => {
    const merged = mergeProfiles(
      { novedades: { ciudad: 'Madrid' } },
      { novedades: { trabajo: 'estudiante' } },
    );
    expect(merged.novedades).toEqual({ ciudad: 'Madrid', trabajo: 'estudiante' });
  });
});

describe('getClientTier', () => {
  it('returns "new" for a fresh client', () => {
    expect(getClientTier({ total_gastado: 0, num_compras: 0 })).toBe('new');
  });
  it('returns "recurrente" for a client with 1+ purchases', () => {
    expect(getClientTier({ total_gastado: 10, num_compras: 1 })).toBe('recurrente');
  });
  it('returns "vip" for a client spending ≥ 200€', () => {
    expect(getClientTier({ total_gastado: 250, num_compras: 5 })).toBe('vip');
  });
  it('returns "new" for null client', () => {
    expect(getClientTier(null)).toBe('new');
  });
});

// ─── DB integration tests ─────────────────────────────────────────────────

describe('getOrCreateClient (DB)', () => {
  const TEST_USER_ID = 777888999n;

  beforeEach(async () => {
    await query('DELETE FROM clients WHERE telegram_user_id = $1', [TEST_USER_ID]);
  });

  it('creates a new client when not found', async () => {
    const client = await getOrCreateClient(TEST_USER_ID, 'conn_test', { id: TEST_USER_ID, username: 'testuser' });
    expect(client.id).toBeDefined();
    expect(client.username).toBe('testuser');
  });

  it('returns existing client on second call', async () => {
    const first = await getOrCreateClient(TEST_USER_ID, 'conn_a', null);
    const second = await getOrCreateClient(TEST_USER_ID, 'conn_b', null);
    expect(second.id).toBe(first.id);
    expect(second.business_connection_id).toBe('conn_b');
  });
});

describe('updateProfile (DB)', () => {
  const TEST_USER_ID = 777000111n;

  beforeEach(async () => {
    callAnthropic.mockClear();
    await query('DELETE FROM clients WHERE telegram_user_id = $1', [TEST_USER_ID]);
  });

  it('extracts and persists profile updates from message', async () => {
    callAnthropic.mockResolvedValue('{"nombre":"Carlos","gustos":["fotos lencería"]}');
    const client = await getOrCreateClient(TEST_USER_ID, 'conn_test', null);
    await updateProfile(client.id, 'soy Carlos y me gustan las fotos de lencería', {});
    const updated = await getClientById(client.id);
    expect(updated.profile.nombre).toBe('Carlos');
    expect(updated.profile.gustos).toContain('fotos lencería');
  });

  it('skips update when LLM returns empty object', async () => {
    callAnthropic.mockResolvedValue('{}');
    const client = await getOrCreateClient(TEST_USER_ID, 'conn_test', null);
    await updateProfile(client.id, 'hola', {});
    // no error thrown, profile unchanged
    const updated = await getClientById(client.id);
    expect(Object.keys(updated.profile)).toHaveLength(0);
  });

  it('skips update for empty message', async () => {
    const client = await getOrCreateClient(TEST_USER_ID, 'conn_test', null);
    await expect(updateProfile(client.id, '', {})).resolves.toBeUndefined();
    expect(callAnthropic).not.toHaveBeenCalled();
  });
});

// ─── markClientCatalogSeen (FIX D9) ──────────────────────────────────────────
describe('markClientCatalogSeen (DB)', () => {
  const TEST_USER_ID = 778899100n;

  beforeEach(async () => {
    await query('DELETE FROM clients WHERE telegram_user_id = $1', [TEST_USER_ID]);
  });

  it('flips has_seen_catalog from false to true on first call', async () => {
    const client = await getOrCreateClient(TEST_USER_ID, 'conn_test', null);
    expect(client.has_seen_catalog).toBe(false);  // default

    await markClientCatalogSeen(client.id);

    const updated = await getClientById(client.id);
    expect(updated.has_seen_catalog).toBe(true);
  });

  it('is idempotent — second call does not error', async () => {
    const client = await getOrCreateClient(TEST_USER_ID, 'conn_test', null);
    await markClientCatalogSeen(client.id);
    await markClientCatalogSeen(client.id);
    const updated = await getClientById(client.id);
    expect(updated.has_seen_catalog).toBe(true);
  });

  it('no-op for invalid clientId (does not throw)', async () => {
    await expect(markClientCatalogSeen(null)).resolves.toBeUndefined();
    await expect(markClientCatalogSeen(0)).resolves.toBeUndefined();
  });
});

afterAll(() => closePool());
