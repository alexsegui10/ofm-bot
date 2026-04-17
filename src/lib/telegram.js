import { Bot } from 'grammy';
import { env } from '../config/env.js';
import { agentLogger } from './logger.js';

const log = agentLogger('telegram');

let _bot;

export function getBot() {
  if (!_bot) {
    _bot = new Bot(env.TELEGRAM_BOT_TOKEN);
  }
  return _bot;
}

/**
 * Send a text message through a Business Connection.
 *
 * @param {string} businessConnectionId
 * @param {number|string} chatId
 * @param {string} text
 * @param {object} [extra]  - additional Telegram send options
 */
export async function sendMessage(businessConnectionId, chatId, text, extra = {}) {
  // TEST_MODE: no-op. Pipeline still runs end-to-end (BBDD updated) but no real
  // Telegram API call. Used by scripts/auto-iterate.js to avoid sending to real users.
  if (env.TEST_MODE) {
    log.info({ chatId, text_preview: String(text).slice(0, 80) }, 'SKIPPED (TEST_MODE)');
    return { message_id: Math.floor(Math.random() * 1e9), test_mode: true };
  }

  const start = Date.now();
  try {
    const msg = await getBot().api.sendMessage(chatId, text, {
      business_connection_id: businessConnectionId,
      ...extra,
    });
    log.debug({ chatId, latency_ms: Date.now() - start, message_id: msg.message_id }, 'message sent');
    return msg;
  } catch (err) {
    log.error({ chatId, err }, 'sendMessage failed');
    throw err;
  }
}

/**
 * Send a "typing…" or other chat action through a Business Connection.
 */
export async function sendChatAction(businessConnectionId, chatId, action = 'typing') {
  if (env.TEST_MODE) return;
  try {
    await getBot().api.sendChatAction(chatId, action, {
      business_connection_id: businessConnectionId,
    });
  } catch (err) {
    // Non-fatal — just log
    log.warn({ chatId, action, err }, 'sendChatAction failed');
  }
}

/**
 * Send a document/photo/video through a Business Connection.
 * type: 'document' | 'photo' | 'video' | 'audio'
 */
export async function sendMedia(businessConnectionId, chatId, type, fileId, caption) {
  if (env.TEST_MODE) {
    log.info({ chatId, type, fileId, caption_preview: String(caption ?? '').slice(0, 80) }, 'SKIPPED media (TEST_MODE)');
    return { message_id: Math.floor(Math.random() * 1e9), test_mode: true };
  }
  const methodMap = {
    photo: 'sendPhoto',
    video: 'sendVideo',
    audio: 'sendAudio',
    document: 'sendDocument',
  };
  const method = methodMap[type] ?? 'sendDocument';
  try {
    return await getBot().api[method](chatId, fileId, {
      business_connection_id: businessConnectionId,
      caption,
    });
  } catch (err) {
    log.error({ chatId, type, fileId, err }, 'sendMedia failed');
    throw err;
  }
}

/**
 * Mark a message as read through a Business Connection (blue double-tick).
 * Non-throwing — read receipts are best-effort.
 *
 * @param {string} businessConnectionId
 * @param {number|string} chatId
 * @param {number} messageId
 */
export async function readBusinessMessage(businessConnectionId, chatId, messageId) {
  if (env.TEST_MODE) return;
  try {
    await getBot().api.raw.readBusinessMessage({
      business_connection_id: businessConnectionId,
      chat_id: chatId,
      message_id: messageId,
    });
    log.debug({ chatId, messageId }, 'read receipt sent');
  } catch (err) {
    log.warn({ chatId, messageId, err }, 'readBusinessMessage failed');
  }
}

/**
 * Register the Telegram webhook URL.
 * Called once at startup when WEBHOOK_BASE_URL is set.
 */
export async function setWebhook() {
  const url = `${env.WEBHOOK_BASE_URL}/webhook/telegram`;
  await getBot().api.setWebhook(url, {
    allowed_updates: [
      'message',
      'business_connection',
      'business_message',
      'deleted_business_messages',
      'pre_checkout_query',
    ],
  });
  log.info({ url }, 'webhook registered');
}
