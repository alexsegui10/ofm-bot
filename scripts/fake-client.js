#!/usr/bin/env node
/**
 * scripts/fake-client.js
 *
 * Simulador de cliente para el loop de iteración autónoma.
 * Hace POST /webhook/telegram al server local (localhost:4000) con un
 * `business_message` y luego lee las respuestas de la tabla `conversations`.
 *
 * IMPORTANTE: requiere TEST_MODE=true en .env para evitar que el bot
 * envíe mensajes reales al cliente simulado vía Telegram API.
 *
 * Uso programático:
 *   import { runScenario } from './scripts/fake-client.js';
 *   const result = await runScenario({ chatId: 900000001, messages: ['hola', 'quiero fotos'] });
 *   // result.turns: [ { user: 'hola', assistant: ['saludo', 'catalogo'] }, ... ]
 *
 * Uso CLI (manual):
 *   node scripts/fake-client.js --chatId=900000001 --messages="hola;quiero fotos;bizum"
 */

import 'dotenv/config';
import pg from 'pg';
import { setTimeout as sleep } from 'node:timers/promises';

const WEBHOOK_URL = process.env.FAKE_CLIENT_WEBHOOK_URL
  ?? `http://localhost:${process.env.PORT || 4000}/webhook/telegram`;

const BUSINESS_CONNECTION_ID = process.env.TELEGRAM_BUSINESS_CONNECTION_ID || 'TEST_BUSINESS_CONN';

const { Pool } = pg;
let _pool;
function getPool() {
  if (!_pool) _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return _pool;
}

export async function closePool() {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}

function randomInt(max = 1_000_000_000) {
  return Math.floor(Math.random() * max) + 1;
}

/**
 * Build a fake business_message update compatible with Telegram's payload.
 */
function buildUpdate(chatId, text) {
  return {
    update_id: randomInt(),
    business_message: {
      message_id: randomInt(),
      from: {
        id: chatId,
        is_bot: false,
        first_name: 'TestClient',
        language_code: 'es',
      },
      chat: {
        id: chatId,
        type: 'private',
        first_name: 'TestClient',
      },
      business_connection_id: BUSINESS_CONNECTION_ID,
      text,
      date: Math.floor(Date.now() / 1000),
    },
  };
}

/**
 * Post the update to the local webhook. Returns nothing — all we care about
 * is that the server accepts it (201/200). The pipeline runs async.
 */
async function postToWebhook(update) {
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(update),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Webhook POST failed: ${res.status} ${res.statusText} — ${body}`);
  }
}

/**
 * Find the internal client id given a telegram_user_id (chatId).
 * Returns null if the client hasn't been created yet.
 */
async function getClientId(chatId) {
  const { rows } = await getPool().query(
    `SELECT id FROM clients WHERE telegram_user_id = $1`,
    [chatId],
  );
  return rows[0]?.id ?? null;
}

/**
 * Max assistant-message id for a client (used as "cursor"). Returns 0 if none.
 */
async function getLastAssistantId(clientId) {
  if (!clientId) return 0;
  const { rows } = await getPool().query(
    `SELECT COALESCE(MAX(id), 0) AS maxid
       FROM conversations
      WHERE client_id = $1 AND role = 'assistant'`,
    [clientId],
  );
  return Number(rows[0].maxid) || 0;
}

/**
 * Fetch assistant messages with id > cursor for a client, ordered by id.
 */
async function fetchNewAssistantMessages(clientId, cursor) {
  if (!clientId) return [];
  const { rows } = await getPool().query(
    `SELECT id, content, intent, created_at
       FROM conversations
      WHERE client_id = $1 AND role = 'assistant' AND id > $2
      ORDER BY id ASC`,
    [clientId, cursor],
  );
  return rows;
}

/**
 * Send one message and wait until Alba has produced a response.
 *
 * Heuristic: the pipeline takes ~5-15s (pacer entry delay + LLMs). We poll the
 * BBDD every `pollMs`. We consider Alba "done" when:
 *   - at least one new assistant message exists, AND
 *   - `quietMs` have passed since the most recent new assistant message.
 *
 * Returns the array of assistant message rows created for this turn.
 */
async function sendAndCollect({
  chatId,
  text,
  timeoutMs = 60_000,
  pollMs = 500,
  quietMs = 4_000,
}) {
  // Find (or re-find) our internal client_id BEFORE sending; the orchestrator
  // will create it on first message, so it may initially be null.
  let clientId = await getClientId(chatId);
  const cursor = await getLastAssistantId(clientId);

  const update = buildUpdate(chatId, text);
  await postToWebhook(update);

  const start = Date.now();
  let lastNewMessageAt = null;
  let lastRows = [];

  while (Date.now() - start < timeoutMs) {
    await sleep(pollMs);
    if (!clientId) clientId = await getClientId(chatId);
    if (!clientId) continue;

    const rows = await fetchNewAssistantMessages(clientId, cursor);
    if (rows.length > lastRows.length) {
      lastNewMessageAt = Date.now();
      lastRows = rows;
    }
    // "quiet" steady-state detection
    if (lastRows.length > 0 && lastNewMessageAt && (Date.now() - lastNewMessageAt) >= quietMs) {
      return lastRows;
    }
  }

  // Timeout — return whatever we have
  return lastRows;
}

/**
 * Run a full scenario: sends each message sequentially, collects responses per turn.
 *
 * @param {{ chatId: number, messages: string[], timeoutMs?: number, quietMs?: number }} opts
 * @returns {Promise<{ chatId: number, turns: Array<{ user: string, assistant: Array<{ content: string, intent: string|null }> }> }>}
 */
export async function runScenario({ chatId, messages, timeoutMs, quietMs }) {
  const turns = [];
  for (const text of messages) {
    const rows = await sendAndCollect({ chatId, text, timeoutMs, quietMs });
    turns.push({
      user: text,
      assistant: rows.map((r) => ({ content: r.content, intent: r.intent })),
    });
  }
  return { chatId, turns };
}

// ── CLI entrypoint ──────────────────────────────────────────────────────────
const isMain = import.meta.url.endsWith(
  (process.argv[1] || '').replace(/\\/g, '/').split('/').pop() || '__never__',
);

if (isMain) {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, ...rest] = a.replace(/^--/, '').split('=');
      return [k, rest.join('=')];
    }),
  );
  const chatId = parseInt(args.chatId || '900000001', 10);
  const messages = (args.messages || 'hola').split(';');

  (async () => {
    try {
      const result = await runScenario({ chatId, messages });
      console.log(JSON.stringify(result, null, 2));
    } catch (err) {
      console.error('fake-client error:', err.message);
      process.exit(1);
    } finally {
      await closePool();
    }
  })();
}
