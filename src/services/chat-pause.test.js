import 'dotenv/config';
import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { pauseChatBot, resumeChatBot, getPausedChats, getChatStatus } from './chat-pause.js';
import { query, closePool, runMigrations } from '../lib/db.js';

const TEST_CLIENT_TG_ID = 9991001n;
const TEST_CLIENT_TG_ID_2 = 9991002n;
let clientDbId;
let clientDbId2;

async function ensureClient(tgId) {
  const { rows } = await query(
    `INSERT INTO clients (telegram_user_id, business_connection_id)
     VALUES ($1, 'conn_pause_test')
     ON CONFLICT (telegram_user_id) DO UPDATE SET business_connection_id = EXCLUDED.business_connection_id
     RETURNING id`,
    [tgId],
  );
  return rows[0].id;
}

beforeAll(async () => {
  await runMigrations();
});

beforeEach(async () => {
  clientDbId = await ensureClient(TEST_CLIENT_TG_ID);
  clientDbId2 = await ensureClient(TEST_CLIENT_TG_ID_2);
  await query('DELETE FROM chat_pause_state WHERE client_id IN ($1, $2)', [clientDbId, clientDbId2]);
});

afterAll(async () => {
  await closePool();
});

// ─── pauseChatBot ────────────────────────────────────────────────────────────

describe('pauseChatBot', () => {
  it('inserts a paused row with default status paused_manual', async () => {
    const row = await pauseChatBot(clientDbId, 'admin_pause');
    expect(row.client_id).toBe(clientDbId);
    expect(row.status).toBe('paused_manual');
    expect(row.reason).toBe('admin_pause');
    expect(row.resumed_at).toBeNull();
  });

  it('stores status paused_awaiting_videocall', async () => {
    const row = await pauseChatBot(clientDbId, 'videocall scheduled', {
      status: 'paused_awaiting_videocall',
    });
    expect(row.status).toBe('paused_awaiting_videocall');
  });

  it('stores status paused_awaiting_human', async () => {
    const row = await pauseChatBot(clientDbId, 'verification insistent', {
      status: 'paused_awaiting_human',
    });
    expect(row.status).toBe('paused_awaiting_human');
  });

  it('stores expected_resume_by timestamp', async () => {
    const future = new Date(Date.now() + 10 * 60_000);
    const row = await pauseChatBot(clientDbId, 'x', { expectedResumeBy: future });
    expect(new Date(row.expected_resume_by).getTime()).toBeCloseTo(future.getTime(), -2);
  });

  it('merges metadata', async () => {
    const row = await pauseChatBot(clientDbId, 'x', { metadata: { videocall_time: '20:00' } });
    expect(row.metadata).toEqual({ videocall_time: '20:00' });
  });

  it('updates existing active pause instead of duplicating', async () => {
    const first = await pauseChatBot(clientDbId, 'first');
    const second = await pauseChatBot(clientDbId, 'second', { status: 'paused_awaiting_human' });

    expect(second.id).toBe(first.id); // same row, updated in place
    expect(second.reason).toBe('second');
    expect(second.status).toBe('paused_awaiting_human');

    const { rows } = await query(
      'SELECT COUNT(*)::int AS n FROM chat_pause_state WHERE client_id = $1 AND resumed_at IS NULL',
      [clientDbId],
    );
    expect(rows[0].n).toBe(1);
  });

  it('throws on invalid status', async () => {
    await expect(pauseChatBot(clientDbId, 'x', { status: 'invalid_status' })).rejects.toThrow(/invalid status/);
  });

  it('throws on non-positive clientId', async () => {
    await expect(pauseChatBot(0, 'x')).rejects.toThrow(/positive integer/);
    await expect(pauseChatBot(-1, 'x')).rejects.toThrow(/positive integer/);
    await expect(pauseChatBot('abc', 'x')).rejects.toThrow(/positive integer/);
  });
});

// ─── resumeChatBot ───────────────────────────────────────────────────────────

describe('resumeChatBot', () => {
  it('marks active pause as resumed', async () => {
    await pauseChatBot(clientDbId, 'test_pause');
    const resumed = await resumeChatBot(clientDbId);
    expect(resumed).not.toBeNull();
    expect(resumed.resumed_at).not.toBeNull();
  });

  it('stores resume_context in metadata', async () => {
    await pauseChatBot(clientDbId, 'x');
    const resumed = await resumeChatBot(clientDbId, 'timeout');
    expect(resumed.metadata.resume_context).toBe('timeout');
  });

  it('returns null when no active pause', async () => {
    const resumed = await resumeChatBot(clientDbId);
    expect(resumed).toBeNull();
  });

  it('does not affect other clients', async () => {
    await pauseChatBot(clientDbId, 'x');
    await pauseChatBot(clientDbId2, 'y');
    await resumeChatBot(clientDbId);
    const status2 = await getChatStatus(clientDbId2);
    expect(status2).toBe('paused_manual');
  });

  it('throws on invalid clientId', async () => {
    await expect(resumeChatBot(0)).rejects.toThrow(/positive integer/);
  });

  it('does not resume already-resumed pauses', async () => {
    await pauseChatBot(clientDbId, 'x');
    const first = await resumeChatBot(clientDbId);
    const second = await resumeChatBot(clientDbId);
    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });
});

// ─── getChatStatus ───────────────────────────────────────────────────────────

describe('getChatStatus', () => {
  it('returns "active" when no pause exists', async () => {
    expect(await getChatStatus(clientDbId)).toBe('active');
  });

  it('returns the paused status when active', async () => {
    await pauseChatBot(clientDbId, 'x', { status: 'paused_awaiting_videocall' });
    expect(await getChatStatus(clientDbId)).toBe('paused_awaiting_videocall');
  });

  it('returns "active" after resume', async () => {
    await pauseChatBot(clientDbId, 'x');
    await resumeChatBot(clientDbId);
    expect(await getChatStatus(clientDbId)).toBe('active');
  });

  it('returns latest paused status when multiple historic rows exist', async () => {
    await pauseChatBot(clientDbId, 'old');
    await resumeChatBot(clientDbId);
    await pauseChatBot(clientDbId, 'new', { status: 'paused_awaiting_human' });
    expect(await getChatStatus(clientDbId)).toBe('paused_awaiting_human');
  });

  it('throws on invalid clientId', async () => {
    await expect(getChatStatus(0)).rejects.toThrow(/positive integer/);
  });
});

// ─── getPausedChats ──────────────────────────────────────────────────────────

describe('getPausedChats', () => {
  it('returns empty array when no pauses', async () => {
    const list = await getPausedChats();
    const ourClientPauses = list.filter((r) => r.client_id === clientDbId || r.client_id === clientDbId2);
    expect(ourClientPauses).toHaveLength(0);
  });

  it('lists active pauses', async () => {
    await pauseChatBot(clientDbId, 'x');
    await pauseChatBot(clientDbId2, 'y', { status: 'paused_awaiting_videocall' });
    const list = await getPausedChats();
    const ids = list.map((r) => r.client_id);
    expect(ids).toContain(clientDbId);
    expect(ids).toContain(clientDbId2);
  });

  it('excludes resumed pauses', async () => {
    await pauseChatBot(clientDbId, 'x');
    await resumeChatBot(clientDbId);
    await pauseChatBot(clientDbId2, 'y');
    const list = await getPausedChats();
    const ids = list.map((r) => r.client_id);
    expect(ids).not.toContain(clientDbId);
    expect(ids).toContain(clientDbId2);
  });

  it('includes telegram_user_id via join', async () => {
    await pauseChatBot(clientDbId, 'x');
    const list = await getPausedChats();
    const entry = list.find((r) => r.client_id === clientDbId);
    expect(entry.telegram_user_id).toBeDefined();
  });
});

// ─── Integration: status enum violations caught by CHECK ─────────────────────

describe('DB CHECK constraint on status', () => {
  it('rejects "active" as row status (active is derived, not stored)', async () => {
    await expect(
      query(
        `INSERT INTO chat_pause_state (client_id, status) VALUES ($1, 'active')`,
        [clientDbId],
      ),
    ).rejects.toThrow();
  });

  it('rejects arbitrary string', async () => {
    await expect(
      query(
        `INSERT INTO chat_pause_state (client_id, status) VALUES ($1, 'foo')`,
        [clientDbId],
      ),
    ).rejects.toThrow();
  });
});
