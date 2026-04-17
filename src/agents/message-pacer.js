import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { sendMessage, sendChatAction } from '../lib/telegram.js';
import { agentLogger } from '../lib/logger.js';

const log = agentLogger('message-pacer');
const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Config loading ─────────────────────────────────────────────────────────

function loadConfig() {
  const raw = readFileSync(join(__dirname, '../../config/pacer.json'), 'utf-8');
  return JSON.parse(raw);
}

let _config;
export function getPacerConfig() {
  if (!_config) _config = loadConfig();
  return _config;
}

// ─── Pure helper functions (testable) ───────────────────────────────────────

/**
 * Check if the given hour falls within sleep hours.
 * @param {number} hour  0-23
 * @param {{ start: number, end: number }} sleepHours
 */
export function isInSleepHours(hour, sleepHours) {
  const { start, end } = sleepHours;
  if (start > end) return hour >= start || hour < end;
  return hour >= start && hour < end;
}

/**
 * Check if the given hour falls within any active window.
 * Windows where end > 24 span midnight (e.g. {start:22, end:25} = 22:00-01:00).
 *
 * @param {number} hour  0-23
 * @param {Array<{start:number,end:number}>} activeHours
 */
export function isInActiveHours(hour, activeHours) {
  return activeHours.some(({ start, end }) => {
    if (end > 24) return hour >= start || hour < (end - 24);
    return hour >= start && hour < end;
  });
}

/**
 * Compute the entry delay in milliseconds.
 *
 * @param {number} messageChars  Length of the incoming message in characters
 * @param {object} config  Loaded pacer.json
 * @param {Date}   [now]
 * @param {number|null} [sextingPhaseIndex]  Current sexting phase index; null = no active session
 * @returns {number}  Delay in ms
 */
export function computeEntryDelayMs(messageChars, config, now = new Date(), sextingPhaseIndex = null) {
  // Testing mode → fixed short delay, ignores all other rules
  if (config.testing_mode) {
    const min = config.testing_delay_ms_min ?? 3000;
    const max = config.testing_delay_ms_max ?? 8000;
    return min + Math.random() * (max - min);
  }

  const hour = now.getHours();
  const { entry_delay, sleep_hours, active_hours, inactive_multiplier } = config;

  // Active sexting session → use phase-specific delays (ignores sleep/inactive multiplier)
  if (sextingPhaseIndex !== null && config.sexting_delay?.enabled) {
    const sd = config.sexting_delay;
    let bucket;
    if (sextingPhaseIndex <= 1) bucket = sd.calentamiento;
    else if (sextingPhaseIndex === 2) bucket = sd.subida;
    else if (sextingPhaseIndex === 3) bucket = sd.climax;
    else bucket = sd.cierre;
    if (bucket) {
      return bucket.min_ms + Math.random() * (bucket.max_ms - bucket.min_ms);
    }
  }

  // Sleep hours → respond as if just woken up (1-5 min delay)
  if (isInSleepHours(hour, sleep_hours)) {
    return (60_000 + Math.random() * 4 * 60_000); // 1–5 min
  }

  const baseMs = (
    entry_delay.min_seconds +
    Math.random() * (entry_delay.max_seconds - entry_delay.min_seconds)
  ) * 1000;

  // Add per-word delay (rough estimate: 5 chars ≈ 1 word)
  const words = Math.max(1, messageChars / 5);
  const perWordMs = (entry_delay.per_word_ms ?? 80) * words;

  const total = baseMs + perWordMs;

  if (!isInActiveHours(hour, active_hours)) {
    return Math.min(total * inactive_multiplier, 30 * 60_000); // cap 30 min
  }

  return total;
}

/**
 * Compute how long to show "typing…" before sending a fragment.
 * Based on word count and typing speed config.
 *
 * @param {string} text
 * @param {object} config
 * @returns {number} ms
 */
export function computeTypingDelayMs(text, config) {
  const { typing_speed_wpm, between_fragments } = config;
  const words = (text.split(/\s+/).filter(Boolean).length) || 1;
  const wpm = typing_speed_wpm.min + Math.random() * (typing_speed_wpm.max - typing_speed_wpm.min);
  const typingMs = (words / wpm) * 60_000;
  const minMs = between_fragments.min_seconds * 1000;
  const maxMs = between_fragments.max_seconds * 1000;
  return Math.max(minMs, Math.min(maxMs, typingMs));
}

/**
 * Find the index closest to the middle of `text` that is a natural split point.
 * Returns -1 if no suitable split found.
 *
 * @param {string} text
 * @param {number} minLen  Minimum length for each resulting fragment
 * @returns {number}
 */
function findNaturalSplitPoint(text, minLen = 8) {
  // Target ~30% of length so the first fragment is a short reaction/hook
  // and the second carries the substance of the message.
  const mid = Math.floor(text.length * 0.30);
  // Patterns to split at — splitAt = idx + 1 for all (keeps separator with first fragment;
  // leading/trailing spaces are removed by trim() on the resulting slices)
  const patterns = ['. ', '? ', '! ', ', ', '\n', ' y ', ' pero ', ' que '];
  let best = -1;
  let bestDist = Infinity;

  for (const pat of patterns) {
    let idx = text.indexOf(pat);
    while (idx !== -1) {
      const splitAt = idx + 1;
      if (splitAt >= minLen && (text.length - splitAt) >= minLen) {
        const dist = Math.abs(splitAt - mid);
        if (dist < bestDist) {
          bestDist = dist;
          best = splitAt;
        }
      }
      idx = text.indexOf(pat, idx + 1);
    }
  }
  return best;
}

/**
 * Split a response string into natural short fragments based on message length.
 *
 * Rules:
 *  < 30 chars  → always single message
 *  30-80 chars → split in 2 with probability_short chance (injectable randomFn for tests)
 *  80-150 chars → always split in 2 at natural point
 *  > 150 chars → split 2-4 at sentence boundaries
 *
 * @param {string} text
 * @param {object} config
 * @param {function} [randomFn]  Injected RNG for tests (default: Math.random)
 * @returns {string[]}
 */
export function fragmentMessage(text, config, randomFn = Math.random) {
  const cleaned = text.trim();
  const len = cleaned.length;
  const fragConf = config.fragmentation ?? {};
  const probabilityShort = fragConf.probability_short ?? 0.5;
  const minLen = fragConf.min_fragment_length ?? 8;

  // Very short messages → never split
  if (len < 30) {
    return [cleaned];
  }

  // Medium-short (30–80) → probabilistic split
  if (len < 80) {
    if (randomFn() < probabilityShort) {
      const splitAt = findNaturalSplitPoint(cleaned, minLen);
      if (splitAt > 0) {
        return [cleaned.slice(0, splitAt).trim(), cleaned.slice(splitAt).trim()].filter(Boolean);
      }
    }
    return [cleaned];
  }

  // Medium (80–150) → always split in 2
  if (len <= 150) {
    const splitAt = findNaturalSplitPoint(cleaned, minLen);
    if (splitAt > 0) {
      return [cleaned.slice(0, splitAt).trim(), cleaned.slice(splitAt).trim()].filter(Boolean);
    }
    // Fallback: split at space closest to 30% point
    const mid = Math.floor(len * 0.30);
    const spaceIdx = cleaned.indexOf(' ', mid);
    if (spaceIdx > 0) {
      return [cleaned.slice(0, spaceIdx).trim(), cleaned.slice(spaceIdx).trim()].filter(Boolean);
    }
    return [cleaned];
  }

  // Long (> 150) → split 2-4 at sentence boundaries
  const parts = cleaned
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length >= 2 && parts.length <= 4) {
    return parts;
  }
  if (parts.length > 4) {
    const merged = [];
    const chunkSize = Math.ceil(parts.length / 4);
    for (let i = 0; i < parts.length; i += chunkSize) {
      merged.push(parts.slice(i, i + chunkSize).join(' '));
    }
    return merged;
  }
  // Single part or no sentence break → try natural split
  const splitAt = findNaturalSplitPoint(cleaned, minLen);
  if (splitAt > 0) {
    return [cleaned.slice(0, splitAt).trim(), cleaned.slice(splitAt).trim()].filter(Boolean);
  }
  return [cleaned];
}

/**
 * Send fragments to Telegram with typing indicators between each one.
 * Uses the sleep_hours wake_response prefix if currently in sleep hours.
 *
 * @param {string[]} fragments
 * @param {string} businessConnectionId
 * @param {number} chatId
 * @param {object} [config]
 * @param {function} [delayfn]  Injectable for tests: (ms) => Promise<void>
 */
export async function sendFragments(
  fragments,
  businessConnectionId,
  chatId,
  config = getPacerConfig(),
  delayfn = (ms) => new Promise((r) => setTimeout(r, ms)),
) {
  const now = new Date();
  const hour = now.getHours();
  let allFragments = [...fragments];

  // Prepend wake message if in sleep hours
  if (isInSleepHours(hour, config.sleep_hours) && config.sleep_hours.enabled && config.sleep_hours.wake_response) {
    allFragments = [config.sleep_hours.wake_response, ...allFragments];
  }

  for (let i = 0; i < allFragments.length; i++) {
    const frag = allFragments[i];

    // Show typing indicator
    await sendChatAction(businessConnectionId, chatId, 'typing');

    // Wait proportional to fragment length
    const typingMs = computeTypingDelayMs(frag, config);
    await delayfn(typingMs);

    // Send the fragment
    await sendMessage(businessConnectionId, chatId, frag);

    // Brief pause between fragments (except after the last one)
    if (i < allFragments.length - 1) {
      const pauseMs = 800 + Math.random() * 400; // 0.8–1.2s natural pause
      await delayfn(pauseMs);
    }
  }
}

// ─── Queue (entry delay + message concatenation) ────────────────────────────

/**
 * Map<chatId, { timer, texts: string[], businessConnectionId, processFn }>
 * processFn(concatenatedText) → void
 */
const _queue = new Map();

/**
 * Set of chatIds currently running a pipeline.
 * Prevents concurrent pipelines for the same chat.
 */
const _activePipelines = new Set();

/**
 * Queue an incoming message. Starts (or resets) the entry-delay timer.
 * When the timer fires, all queued texts are concatenated and processFn is called.
 *
 * @param {number|string} chatId
 * @param {string} businessConnectionId
 * @param {string|null} text  Message text (null/undefined for media-only)
 * @param {function} processFn  async (concatenatedText: string) => void
 * @param {object} [config]
 * @param {number|null} [sextingPhaseIndex]  Current sexting phase; null = no active session
 */
export function queueMessage(chatId, businessConnectionId, text, processFn, config = getPacerConfig(), sextingPhaseIndex = null) {
  const key = String(chatId);
  const msgText = text || '[media]';

  if (_queue.has(key)) {
    // Reset timer — append new message
    clearTimeout(_queue.get(key).timer);
    _queue.get(key).texts.push(msgText);
    log.debug({ chatId, queued: _queue.get(key).texts.length }, 'pacer: timer reset, message appended');
  } else {
    _queue.set(key, { texts: [msgText], businessConnectionId, processFn });
  }

  const delayMs = computeEntryDelayMs(msgText.length, config, new Date(), sextingPhaseIndex);
  log.debug({ chatId, delay_ms: Math.round(delayMs) }, 'pacer: entry delay set');

  const entry = _queue.get(key);
  entry.timer = setTimeout(async () => {
    _queue.delete(key);
    const concatenated = entry.texts.join(' ');

    // Guard: if a pipeline is already running for this chat, requeue with short delay
    if (_activePipelines.has(key)) {
      log.warn({ chatId }, 'pacer: pipeline already active — requeueing in 5s');
      const requeue = { texts: [concatenated], businessConnectionId: entry.businessConnectionId, processFn: entry.processFn };
      _queue.set(key, requeue);
      requeue.timer = setTimeout(async () => {
        _queue.delete(key);
        if (_activePipelines.has(key)) {
          log.warn({ chatId }, 'pacer: pipeline still active after requeue — dropping');
          return;
        }
        _activePipelines.add(key);
        log.debug({ chatId, concatenated_length: requeue.texts[0].length }, 'pacer: firing (after requeue)');
        try {
          await requeue.processFn(requeue.texts[0]);
        } catch (err) {
          log.error({ chatId, err }, 'pacer: processFn threw (requeue)');
        } finally {
          _activePipelines.delete(key);
        }
      }, 5000);
      return;
    }

    _activePipelines.add(key);
    log.debug({ chatId, concatenated_length: concatenated.length }, 'pacer: firing');
    try {
      await entry.processFn(concatenated);
    } catch (err) {
      log.error({ chatId, err }, 'pacer: processFn threw');
    } finally {
      _activePipelines.delete(key);
    }
  }, delayMs);
}

/**
 * Returns how many chats currently have a pending entry-delay timer.
 * Useful for diagnostics and tests.
 */
export function pendingCount() {
  return _queue.size;
}

/**
 * Cancel all pending timers. Used in test teardown.
 */
export function clearAll() {
  for (const entry of _queue.values()) clearTimeout(entry.timer);
  _queue.clear();
}
