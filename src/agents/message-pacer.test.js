import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  isInSleepHours,
  isInActiveHours,
  computeEntryDelayMs,
  computeTypingDelayMs,
  fragmentMessage,
  queueMessage,
  pendingCount,
  clearAll,
} from './message-pacer.js';

vi.mock('../lib/telegram.js', () => ({
  sendMessage: vi.fn().mockResolvedValue({}),
  sendChatAction: vi.fn().mockResolvedValue({}),
}));

const CONFIG = {
  entry_delay: { min_seconds: 40, max_seconds: 70, per_word_ms: 80 },
  fragment_count: { min: 2, max: 5 },
  between_fragments: { min_seconds: 3, max_seconds: 8 },
  typing_speed_wpm: { min: 50, max: 70 },
  active_hours: [
    { start: 10, end: 13 },
    { start: 16, end: 20 },
    { start: 22, end: 25 },
  ],
  inactive_multiplier: 3.5,
  sleep_hours: { start: 1, end: 10, enabled: true, wake_response: 'mmm acabo de despertar' },
  fragmentation: { probability_short: 0.5, min_fragment_length: 8 },
  sexting_delay: {
    enabled: true,
    calentamiento: { min_ms: 20000, max_ms: 40000 },
    subida:        { min_ms: 15000, max_ms: 30000 },
    climax:        { min_ms: 10000, max_ms: 20000 },
    cierre:        { min_ms: 20000, max_ms: 40000 },
  },
};

afterEach(() => clearAll());

// ─── isInSleepHours ──────────────────────────────────────────────────────────

describe('isInSleepHours', () => {
  const sh = { start: 1, end: 10 };
  it('true at 3am', () => expect(isInSleepHours(3, sh)).toBe(true));
  it('true at 1am (boundary)', () => expect(isInSleepHours(1, sh)).toBe(true));
  it('false at 10am (boundary, exclusive)', () => expect(isInSleepHours(10, sh)).toBe(false));
  it('false at noon', () => expect(isInSleepHours(12, sh)).toBe(false));
  it('false at midnight', () => expect(isInSleepHours(0, sh)).toBe(false));
});

// ─── isInActiveHours ─────────────────────────────────────────────────────────

describe('isInActiveHours', () => {
  const ah = [{ start: 10, end: 13 }, { start: 16, end: 20 }, { start: 22, end: 25 }];
  it('true at 11am', () => expect(isInActiveHours(11, ah)).toBe(true));
  it('true at 17:00', () => expect(isInActiveHours(17, ah)).toBe(true));
  it('true at 23:00', () => expect(isInActiveHours(23, ah)).toBe(true));
  it('true at 00:30 (midnight window)', () => expect(isInActiveHours(0, ah)).toBe(true));
  it('false at 14:00 (between windows)', () => expect(isInActiveHours(14, ah)).toBe(false));
  it('false at 21:30', () => expect(isInActiveHours(21, ah)).toBe(false));
  it('true at 10am (start boundary)', () => expect(isInActiveHours(10, ah)).toBe(true));
  it('false at 13:00 (end boundary, exclusive)', () => expect(isInActiveHours(13, ah)).toBe(false));
});

// ─── computeEntryDelayMs ─────────────────────────────────────────────────────

describe('computeEntryDelayMs', () => {
  it('returns value in active hours within 40-70s base + some per-word', () => {
    const now = new Date(); now.setHours(11);
    const d = computeEntryDelayMs(20, CONFIG, now); // ~4 words
    expect(d).toBeGreaterThan(40_000);
    expect(d).toBeLessThan(80_000); // base max + per-word for short msg
  });

  it('returns larger delay in inactive hours', () => {
    const activeNow = new Date(); activeNow.setHours(11);
    const inactiveNow = new Date(); inactiveNow.setHours(15);
    const active = computeEntryDelayMs(20, CONFIG, activeNow);
    const inactive = computeEntryDelayMs(20, CONFIG, inactiveNow);
    expect(inactive).toBeGreaterThan(active);
  });

  it('caps inactive delay at 30 minutes', () => {
    const now = new Date(); now.setHours(15); // inactive hour
    const d = computeEntryDelayMs(10_000, CONFIG, now); // very long message
    expect(d).toBeLessThanOrEqual(30 * 60_000);
  });

  it('returns 1-5 min delay during sleep hours', () => {
    const now = new Date(); now.setHours(3);
    const d = computeEntryDelayMs(20, CONFIG, now);
    expect(d).toBeGreaterThanOrEqual(60_000);
    expect(d).toBeLessThanOrEqual(5 * 60_000);
  });

  it('sexting phase 0 uses calentamiento range (20-40s)', () => {
    const now = new Date(); now.setHours(3); // would be sleep otherwise
    const d = computeEntryDelayMs(20, CONFIG, now, 0);
    expect(d).toBeGreaterThanOrEqual(20_000);
    expect(d).toBeLessThanOrEqual(40_000);
  });

  it('sexting phase 1 uses calentamiento range', () => {
    const now = new Date(); now.setHours(11);
    const d = computeEntryDelayMs(20, CONFIG, now, 1);
    expect(d).toBeGreaterThanOrEqual(20_000);
    expect(d).toBeLessThanOrEqual(40_000);
  });

  it('sexting phase 2 uses subida range (15-30s)', () => {
    const now = new Date(); now.setHours(11);
    const d = computeEntryDelayMs(20, CONFIG, now, 2);
    expect(d).toBeGreaterThanOrEqual(15_000);
    expect(d).toBeLessThanOrEqual(30_000);
  });

  it('sexting phase 3 uses climax range (10-20s)', () => {
    const now = new Date(); now.setHours(11);
    const d = computeEntryDelayMs(20, CONFIG, now, 3);
    expect(d).toBeGreaterThanOrEqual(10_000);
    expect(d).toBeLessThanOrEqual(20_000);
  });

  it('sexting phase 4 uses cierre range (20-40s)', () => {
    const now = new Date(); now.setHours(11);
    const d = computeEntryDelayMs(20, CONFIG, now, 4);
    expect(d).toBeGreaterThanOrEqual(20_000);
    expect(d).toBeLessThanOrEqual(40_000);
  });

  it('sextingPhaseIndex null falls back to normal logic', () => {
    const now = new Date(); now.setHours(11);
    const d = computeEntryDelayMs(20, CONFIG, now, null);
    expect(d).toBeGreaterThan(40_000); // normal active-hours base
  });
});

// ─── computeTypingDelayMs ────────────────────────────────────────────────────

describe('computeTypingDelayMs', () => {
  it('stays within between_fragments bounds', () => {
    const d = computeTypingDelayMs('hola q tal', CONFIG);
    expect(d).toBeGreaterThanOrEqual(CONFIG.between_fragments.min_seconds * 1000);
    expect(d).toBeLessThanOrEqual(CONFIG.between_fragments.max_seconds * 1000);
  });

  it('longer text gives >= delay than single word', () => {
    const short = computeTypingDelayMs('ok', CONFIG);
    const long = computeTypingDelayMs('esto es un mensaje bastante más largo con muchas palabras aquí', CONFIG);
    // Both clamped to same max, but long should hit max sooner
    expect(long).toBeGreaterThanOrEqual(short);
  });
});

// ─── fragmentMessage ─────────────────────────────────────────────────────────

describe('fragmentMessage', () => {
  it('returns single fragment for very short text (< 30 chars)', () => {
    expect(fragmentMessage('ok', CONFIG)).toEqual(['ok']);
    expect(fragmentMessage('hola q tal', CONFIG)).toEqual(['hola q tal']);
    expect(fragmentMessage('q haces?', CONFIG)).toHaveLength(1);
  });

  it('medium-short text (30-80) splits in 2 when randomFn < probability_short', () => {
    const text = 'me alegro de haberte conocido, pero tengo que irme ya ahora';
    const frags = fragmentMessage(text, CONFIG, () => 0); // force split
    expect(frags.length).toBe(2);
    expect(frags.every((f) => f.length > 0)).toBe(true);
  });

  it('medium-short text (30-80) stays as 1 when randomFn >= probability_short', () => {
    const text = 'me alegro de haberte conocido, pero tengo que irme ya ahora';
    const frags = fragmentMessage(text, CONFIG, () => 1); // suppress split
    expect(frags).toHaveLength(1);
  });

  it('medium text (80-150) always splits in 2', () => {
    const text = 'siiii me lo paso muy bien en el gym, hoy ha tocado pierna y estoy muerta jaja pero la verdad es que vale la pena';
    expect(text.length).toBeGreaterThanOrEqual(80);
    expect(text.length).toBeLessThanOrEqual(150);
    const frags = fragmentMessage(text, CONFIG);
    expect(frags.length).toBe(2);
    expect(frags.every((f) => f.length > 0)).toBe(true);
  });

  it('long text (> 150 chars) splits 2-4 at sentence boundaries', () => {
    const text = 'hola q tal. estoy muy bien la verdad. hoy he ido al gym y luego he comido bastante bien. por la tarde tengo clase pero luego me quedo libre toda la noche si quieres.';
    expect(text.length).toBeGreaterThan(150);
    const frags = fragmentMessage(text, CONFIG);
    expect(frags.length).toBeGreaterThanOrEqual(2);
    expect(frags.length).toBeLessThanOrEqual(4);
    expect(frags.every((f) => f.length > 0)).toBe(true);
  });

  it('splits at newlines for medium-length text when forced', () => {
    const text = 'me alegro de haberte conocido\npero tengo que irme ya ahora';
    const frags = fragmentMessage(text, CONFIG, () => 0); // force split
    expect(frags.length).toBeGreaterThanOrEqual(2);
  });

  it('returns at most 4 fragments for very long text', () => {
    const text = 'uno. dos. tres. cuatro. cinco. seis. siete. ocho. nueve. diez. once. doce. trece. catorce. quince. dieciseis. diecisiete. dieciocho.';
    const frags = fragmentMessage(text, CONFIG);
    expect(frags.length).toBeLessThanOrEqual(4);
  });

  it('splits at sentence boundaries (legacy check)', () => {
    const frags = fragmentMessage('hola q tal. estoy bien. gracias por preguntar.', CONFIG);
    expect(frags.length).toBeGreaterThanOrEqual(1);
    expect(frags.every((f) => f.length > 0)).toBe(true);
  });
});

// ─── queueMessage ────────────────────────────────────────────────────────────

describe('queueMessage', () => {
  it('increments pendingCount when a message is queued', () => {
    const processFn = vi.fn();
    const shortConfig = { ...CONFIG, entry_delay: { min_seconds: 10, max_seconds: 10, per_word_ms: 0 } };
    queueMessage(12345, 'conn_a', 'hola', processFn, shortConfig);
    expect(pendingCount()).toBe(1);
  });

  it('resets timer and appends text when same chatId messages again', () => {
    const processFn = vi.fn();
    const shortConfig = { ...CONFIG, entry_delay: { min_seconds: 10, max_seconds: 10, per_word_ms: 0 } };
    queueMessage(99999, 'conn_a', 'primer mensaje', processFn, shortConfig);
    queueMessage(99999, 'conn_a', 'segundo mensaje', processFn, shortConfig);
    expect(pendingCount()).toBe(1); // still only 1 entry per chatId
  });

  it('calls processFn with concatenated text after delay', async () => {
    const processFn = vi.fn().mockResolvedValue(undefined);
    const fastConfig = { ...CONFIG, entry_delay: { min_seconds: 0.01, max_seconds: 0.01, per_word_ms: 0 } };
    queueMessage(55555, 'conn_a', 'hola', processFn, fastConfig);
    await new Promise((r) => setTimeout(r, 100));
    expect(processFn).toHaveBeenCalledWith('hola');
  });

  it('uses sexting delay when sextingPhaseIndex is provided', () => {
    const processFn = vi.fn();
    // climax phase → 10-20s, much less than normal 40-70s
    const sextingConfig = { ...CONFIG };
    const start = Date.now();
    queueMessage(77777, 'conn_a', 'hola', processFn, sextingConfig, 3);
    // The timer was set — pendingCount confirms it
    expect(pendingCount()).toBe(1);
  });
});
