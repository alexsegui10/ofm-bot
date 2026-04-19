import { agentLogger } from '../lib/logger.js';
import { handleMessage } from '../orchestrator.js';
import { queueMessage, sendFragments, getPacerConfig } from '../agents/message-pacer.js';
import { sendStarsInvoice } from '../lib/payments/telegram-stars.js';
import { readBusinessMessage, sendMedia } from '../lib/telegram.js';
import { getActiveSession } from '../agents/sexting-conductor.js';

const log = agentLogger('business');

// ─── Roleplay detection ───────────────────────────────────────────────────────

const ROLEPLAY_KEYWORDS = /\b(s[eé]\s+mi|eres\s+mi|actúa\s+como|finge\s+que|haz\s+de|juega\s+(a\s+)?ser|rol\s*play|roleplay|doctora?|profesora?|jefa?|enfermer[ao]|secretaria|pol[ií]c[ií]a|maestra?)\b/i;

/**
 * Returns true if the message appears to request a roleplay scenario.
 * @param {string|null} text
 * @returns {boolean}
 */
function isRoleplayRequest(text) {
  return ROLEPLAY_KEYWORDS.test(text || '');
}

// ─── Message deduplication ────────────────────────────────────────────────────

const _processedMessageIds = new Set();
const _DEDUP_MAX = 1000;

/**
 * Returns true if this messageId was already processed (duplicate Telegram delivery).
 * Keeps at most _DEDUP_MAX entries; evicts oldest when full.
 */
function isDuplicate(messageId) {
  if (!messageId) return false;
  const key = String(messageId);
  if (_processedMessageIds.has(key)) return true;
  if (_processedMessageIds.size >= _DEDUP_MAX) {
    // evict the oldest entry (first inserted)
    _processedMessageIds.delete(_processedMessageIds.values().next().value);
  }
  _processedMessageIds.add(key);
  return false;
}

// ─── Read receipt queue ───────────────────────────────────────────────────────

const _readQueues = new Map();

/**
 * Schedule a read receipt (blue double-tick) 3–5 s after the message arrives.
 * Replaces any pending receipt for the same chat (burst messages: only last one).
 */
export function scheduleReadReceipt(chatId, businessConnectionId, messageId) {
  const key = String(chatId);
  if (_readQueues.has(key)) clearTimeout(_readQueues.get(key));
  const delay = 3000 + Math.random() * 2000; // 3–5 s
  const timer = setTimeout(async () => {
    _readQueues.delete(key);
    await readBusinessMessage(businessConnectionId, chatId, messageId);
  }, delay);
  _readQueues.set(key, timer);
}

/** Cancel all pending read-receipt timers. Used in test teardown. */
export function clearReadQueues() {
  for (const t of _readQueues.values()) clearTimeout(t);
  _readQueues.clear();
}

// ─── Pure data functions (kept for tests + future use) ────────────────────

/**
 * Extracts the relevant fields from a Telegram business_message update.
 * Pure function — no side effects.
 */
export function parseBusinessMessage(update) {
  const msg = update.business_message;
  return {
    businessConnectionId: msg.business_connection_id,
    chatId: msg.chat.id,
    messageId: msg.message_id ?? null,
    fromId: msg.from?.id ?? null,
    fromUsername: msg.from?.username ?? null,
    from: msg.from ?? null,
    text: msg.text ?? null,
    hasMedia: !!(msg.photo || msg.video || msg.document || msg.audio || msg.voice || msg.sticker),
  };
}

/**
 * Echo a single text back through a Business Connection.
 * Used in FASE 2 manual tests and kept for utility use.
 *
 * @param {{ businessConnectionId: string, chatId: number, text: string|null }} parsed
 * @param {{ sendMessage: Function }} api
 */
export async function echoMessage({ businessConnectionId, chatId, text }, api) {
  if (!text) return null;
  return api.sendMessage(chatId, text, {
    business_connection_id: businessConnectionId,
  });
}

// ─── grammy handler registration ─────────────────────────────────────────

export function registerBusinessHandlers(bot, api = bot.api) {
  // ── business_connection ──────────────────────────────────────────────
  bot.on('business_connection', (ctx) => {
    const conn = ctx.update.business_connection;
    log.info({
      event: 'business_connection',
      business_connection_id: conn.id,
      user_id: conn.user.id,
      username: conn.user.username ?? null,
      is_enabled: conn.is_enabled,
    }, conn.is_enabled ? 'business connection enabled' : 'business connection disabled');
  });

  // ── business_message ─────────────────────────────────────────────────
  bot.on('business_message', async (ctx) => {
    const parsed = parseBusinessMessage(ctx.update);

    log.info({
      event: 'business_message',
      business_connection_id: parsed.businessConnectionId,
      chat_id: parsed.chatId,
      from_id: parsed.fromId,
      from_username: parsed.fromUsername,
      has_text: !!parsed.text,
      has_media: parsed.hasMedia,
      text_preview: parsed.text?.slice(0, 80) ?? null,
    }, 'business message received');

    if (isDuplicate(parsed.messageId)) {
      log.warn({ chat_id: parsed.chatId, message_id: parsed.messageId }, 'duplicate message_id — skipping');
      return;
    }

    // Schedule read receipt (blue double-tick) 3–5 s after arrival
    if (parsed.messageId) {
      scheduleReadReceipt(parsed.chatId, parsed.businessConnectionId, parsed.messageId);
    }

    // Look up active sexting session to apply phase-specific entry delays
    let sextingPhaseIndex = null;
    try {
      const session = await getActiveSession(parsed.chatId);
      if (session) sextingPhaseIndex = session.current_phase;
    } catch (err) {
      log.warn({ chat_id: parsed.chatId, err }, 'getActiveSession failed — ignoring');
    }

    const activeSexting = sextingPhaseIndex !== null;

    // Queue message through the entry-delay pacer.
    // When the timer fires, the full 9-agent pipeline runs.
    queueMessage(
      parsed.chatId,
      parsed.businessConnectionId,
      parsed.text,
      async (concatenatedText) => {
        try {
          const result = await handleMessage({
            text: concatenatedText,
            chatId: parsed.chatId,
            businessConnectionId: parsed.businessConnectionId,
            fromId: parsed.fromId,
            from: parsed.from,
            hasMedia: parsed.hasMedia,
            activeSexting,
            isRoleplay: isRoleplayRequest(concatenatedText),
          });

          if (result.fragments?.length) {
            await sendFragments(
              result.fragments,
              parsed.businessConnectionId,
              parsed.chatId,
              getPacerConfig(),
            );
          }

          // Sexting v2 kickoff media: sent right after the warm_up text fragments
          // so the client sees text → photo/video as a single coherent arrival.
          if (result.kickoffMedia?.fileId) {
            try {
              await sendMedia(
                parsed.businessConnectionId,
                parsed.chatId,
                result.kickoffMedia.type,
                result.kickoffMedia.fileId,
                result.kickoffMedia.caption,
              );
            } catch (err) {
              log.error({ chat_id: parsed.chatId, err }, 'kickoff media send failed');
            }
          }

          // Send Telegram Stars invoice if the sales agent returned one
          if (result.starsInvoice) {
            await sendStarsInvoice(api, parsed.chatId, {
              title: 'Contenido exclusivo',
              description: result.starsInvoice.description,
              amountEur: result.starsInvoice.amountEur,
              payload: result.starsInvoice.payload,
              businessConnectionId: parsed.businessConnectionId,
            });
          }
        } catch (err) {
          log.error({ chat_id: parsed.chatId, err }, 'pipeline error');
        }
      },
      getPacerConfig(),
      sextingPhaseIndex,
    );
  });

  // ── deleted_business_messages ─────────────────────────────────────────
  bot.on('deleted_business_messages', (ctx) => {
    const upd = ctx.update.deleted_business_messages;
    log.info({
      event: 'deleted_business_messages',
      business_connection_id: upd?.business_connection_id,
      message_ids: upd?.message_ids,
    }, 'business messages deleted by user');
  });

  log.info('business handlers registered');
}
