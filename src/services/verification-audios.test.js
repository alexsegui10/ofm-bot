import 'dotenv/config';
import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import {
  getRandomVerificationAudio,
  markAudioUsed,
  countAvailableAudios,
} from './verification-audios.js';
import { query, closePool, runMigrations } from '../lib/db.js';

beforeAll(async () => {
  await runMigrations();
});

beforeEach(async () => {
  // Clean slate per test — esta tabla es compartida pero de uso reducido.
  await query(`DELETE FROM verification_audios WHERE file_path LIKE 'test/%'`);
});

afterAll(async () => {
  await query(`DELETE FROM verification_audios WHERE file_path LIKE 'test/%'`);
  await closePool();
});

async function seedAudio(filePath, overrides = {}) {
  const { rows } = await query(
    `INSERT INTO verification_audios (file_path, transcript, context_tag, last_used_at, use_count)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      filePath,
      overrides.transcript ?? null,
      overrides.contextTag ?? 'verification',
      overrides.lastUsedAt ?? null,
      overrides.useCount ?? 0,
    ],
  );
  return rows[0];
}

// ─── countAvailableAudios ─────────────────────────────────────────────────────

describe('countAvailableAudios', () => {
  it('returns 0 when pool is empty', async () => {
    expect(await countAvailableAudios('verification')).toBe(0);
  });

  it('counts only matching context_tag', async () => {
    await seedAudio('test/a.mp3', { contextTag: 'verification' });
    await seedAudio('test/b.mp3', { contextTag: 'other' });
    expect(await countAvailableAudios('verification')).toBe(1);
    expect(await countAvailableAudios('other')).toBe(1);
  });
});

// ─── getRandomVerificationAudio ───────────────────────────────────────────────

describe('getRandomVerificationAudio', () => {
  it('returns null when pool is empty', async () => {
    expect(await getRandomVerificationAudio()).toBeNull();
  });

  it('returns the audio when pool has 1 entry', async () => {
    await seedAudio('test/only.mp3');
    const r = await getRandomVerificationAudio();
    expect(r).not.toBeNull();
    expect(r.file_path).toBe('test/only.mp3');
    expect(r.use_count).toBe(1); // marcado como usado
    expect(r.last_used_at).not.toBeNull();
  });

  it('prefers NULL last_used_at (never-used audios first)', async () => {
    await seedAudio('test/used.mp3', { lastUsedAt: new Date('2026-01-01'), useCount: 5 });
    await seedAudio('test/fresh.mp3'); // NULL last_used_at
    const r = await getRandomVerificationAudio();
    expect(r.file_path).toBe('test/fresh.mp3');
  });

  it('orders by last_used_at ASC (oldest usage first)', async () => {
    await seedAudio('test/newer.mp3', { lastUsedAt: new Date('2026-04-21'), useCount: 1 });
    await seedAudio('test/older.mp3', { lastUsedAt: new Date('2026-01-01'), useCount: 1 });
    const r = await getRandomVerificationAudio();
    expect(r.file_path).toBe('test/older.mp3');
  });

  it('breaks ties on use_count ASC', async () => {
    const now = new Date('2026-01-01');
    await seedAudio('test/heavy.mp3', { lastUsedAt: now, useCount: 10 });
    await seedAudio('test/light.mp3', { lastUsedAt: now, useCount: 1 });
    const r = await getRandomVerificationAudio();
    expect(r.file_path).toBe('test/light.mp3');
  });

  it('marks the returned audio as used (updates counts)', async () => {
    const before = await seedAudio('test/a.mp3');
    expect(before.use_count).toBe(0);
    const after = await getRandomVerificationAudio();
    expect(after.use_count).toBe(1);
    expect(after.last_used_at).not.toBeNull();
  });

  it('excludes IDs in excludedIds', async () => {
    const a = await seedAudio('test/a.mp3');
    const b = await seedAudio('test/b.mp3');
    const r = await getRandomVerificationAudio({ excludedIds: [a.id] });
    expect(r.id).toBe(b.id);
  });

  it('returns null when all audios are excluded', async () => {
    const a = await seedAudio('test/a.mp3');
    const b = await seedAudio('test/b.mp3');
    const r = await getRandomVerificationAudio({ excludedIds: [a.id, b.id] });
    expect(r).toBeNull();
  });

  it('filters by contextTag', async () => {
    await seedAudio('test/verify.mp3', { contextTag: 'verification' });
    await seedAudio('test/other.mp3', { contextTag: 'other' });
    const r = await getRandomVerificationAudio({ contextTag: 'other' });
    expect(r.file_path).toBe('test/other.mp3');
  });

  it('rotates audios on consecutive calls (no immediate repeat)', async () => {
    await seedAudio('test/a.mp3');
    await seedAudio('test/b.mp3');
    await seedAudio('test/c.mp3');
    const first = await getRandomVerificationAudio();
    const second = await getRandomVerificationAudio();
    const third = await getRandomVerificationAudio();
    const ids = [first.id, second.id, third.id];
    expect(new Set(ids).size).toBe(3); // los 3 son distintos
  });
});

// ─── markAudioUsed ────────────────────────────────────────────────────────────

describe('markAudioUsed', () => {
  it('increments use_count and sets last_used_at', async () => {
    const a = await seedAudio('test/a.mp3');
    const r = await markAudioUsed(a.id);
    expect(r.use_count).toBe(1);
    expect(r.last_used_at).not.toBeNull();
  });

  it('is cumulative across multiple calls', async () => {
    const a = await seedAudio('test/a.mp3');
    await markAudioUsed(a.id);
    await markAudioUsed(a.id);
    const r = await markAudioUsed(a.id);
    expect(r.use_count).toBe(3);
  });

  it('throws on invalid id', async () => {
    await expect(markAudioUsed(0)).rejects.toThrow(/positive integer/);
    await expect(markAudioUsed(-1)).rejects.toThrow(/positive integer/);
    await expect(markAudioUsed('abc')).rejects.toThrow(/positive integer/);
  });

  it('throws if id does not exist', async () => {
    await expect(markAudioUsed(999999999)).rejects.toThrow(/not found/);
  });
});
