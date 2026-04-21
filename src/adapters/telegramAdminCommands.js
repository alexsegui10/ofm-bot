// Adaptador: comandos admin vía Telegram (chat privado bot↔Alex).
//
// SPEC-HANDOFF-V1 §2 — La lógica de pausa/reactivación vive en
// `src/services/chat-pause.js` (servicios puros). Este archivo sólo traduce
// comandos Telegram a llamadas al servicio y formatea la respuesta. Cuando
// exista panel web, se añadirá un adaptador HTTP paralelo sin tocar los
// servicios.
//
// Comandos:
//   /pausar <client_id> [motivo]   → pauseChatBot
//   /reactivar <client_id>         → resumeChatBot
//   /estado <client_id>            → getChatStatus
//   /pausados                      → getPausedChats
//   /whoami                        → devuelve from.id (sin auth, diagnóstico)
//
// Cualquier otro comando o mensaje no-admin se ignora silenciosamente salvo
// /whoami, que responde siempre para diagnóstico.

import { env } from '../config/env.js';
import { agentLogger } from '../lib/logger.js';
import {
  pauseChatBot,
  resumeChatBot,
  getPausedChats,
  getChatStatus,
} from '../services/chat-pause.js';
import { query } from '../lib/db.js';

const log = agentLogger('admin-cmd');

// ─── Pure parser ─────────────────────────────────────────────────────────────

/**
 * Parse un texto de mensaje admin a {command, args}. Devuelve null si no
 * parece un comando (no empieza por "/").
 *
 * Exportada para testing.
 *
 * @param {string} text
 * @returns {{ command: string, args: string[] } | null}
 */
export function parseAdminCommand(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return null;
  const parts = trimmed.split(/\s+/);
  const commandRaw = parts[0].slice(1).toLowerCase();
  // grammY permite comandos con @bot suffix — "/pausar@alba_bot"
  const command = commandRaw.split('@')[0];
  const args = parts.slice(1);
  return { command, args };
}

/**
 * Resuelve un identificador numérico dado por el admin a un `clients.id`.
 *
 * Acepta:
 *   - Postgres PK (`clients.id`)
 *   - Telegram user id (`clients.telegram_user_id`)
 *
 * Simplifica la UX del admin — no tiene que recordar qué columna usar.
 *
 * @param {string} raw  Valor bruto tecleado por el admin
 * @returns {Promise<number|null>} clients.id o null si no existe
 */
export async function resolveClientIdentifier(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  const { rows } = await query(
    `SELECT id FROM clients WHERE id = $1 OR telegram_user_id = $1 LIMIT 1`,
    [n],
  );
  return rows.length > 0 ? rows[0].id : null;
}

// ─── Command handlers (puros, reciben services por DI) ────────────────────────

/**
 * Los handlers son funciones async que reciben `{ args, services }` y
 * devuelven el texto de respuesta para enviar al admin. El DI por `services`
 * permite mockear en tests unitarios sin hablar con Postgres.
 *
 * Exportados como mapa para que el wiring (registerAdminCommands) y los tests
 * los usen igual.
 */
export const adminCommandHandlers = {
  async pausar({ args, services }) {
    const [rawId, ...motivoParts] = args;
    if (!rawId) return 'uso: /pausar <client_id> [motivo]';
    const clientId = await services.resolveClientIdentifier(rawId);
    if (clientId === null) return `no encuentro cliente con id "${rawId}"`;
    const motivo = motivoParts.join(' ').trim() || 'admin_manual';
    const row = await services.pauseChatBot(clientId, motivo);
    return `✅ pausado client_id=${clientId} status=${row.status} motivo="${motivo}"`;
  },

  async reactivar({ args, services }) {
    const [rawId] = args;
    if (!rawId) return 'uso: /reactivar <client_id>';
    const clientId = await services.resolveClientIdentifier(rawId);
    if (clientId === null) return `no encuentro cliente con id "${rawId}"`;
    const row = await services.resumeChatBot(clientId, 'admin_manual');
    if (row === null) return `ℹ️ client_id=${clientId} no tenía pausa activa`;
    return `✅ reactivado client_id=${clientId} (pausado ${row.paused_at})`;
  },

  async estado({ args, services }) {
    const [rawId] = args;
    if (!rawId) return 'uso: /estado <client_id>';
    const clientId = await services.resolveClientIdentifier(rawId);
    if (clientId === null) return `no encuentro cliente con id "${rawId}"`;
    const status = await services.getChatStatus(clientId);
    return `client_id=${clientId}: ${status}`;
  },

  async pausados(_ctx) {
    const { services } = _ctx;
    const list = await services.getPausedChats();
    if (list.length === 0) return 'no hay chats pausados';
    const lines = list.map((r) =>
      `• client_id=${r.client_id} tg=${r.telegram_user_id} status=${r.status} desde=${r.paused_at} motivo="${r.reason ?? ''}"`,
    );
    return `${list.length} pausado(s):\n${lines.join('\n')}`;
  },

  async whoami({ fromId }) {
    return `tu Telegram user.id es: ${fromId}`;
  },
};

// ─── Dispatcher (pure) ────────────────────────────────────────────────────────

/**
 * Ejecuta un comando admin. Aplica la autenticación contra ADMIN_TELEGRAM_USER_ID
 * (excepto /whoami que es diagnóstico sin auth).
 *
 * Exportada para testing — los tests pasan un mock de services.
 *
 * @param {{ text: string, fromId: number|string, adminId: string|number, services: object }} input
 * @returns {Promise<string|null>}  Texto a responder, o null si ignorar.
 */
export async function dispatchAdminCommand({ text, fromId, adminId, services }) {
  const parsed = parseAdminCommand(text);
  if (!parsed) return null;
  const { command, args } = parsed;

  const handler = adminCommandHandlers[command];
  if (!handler) return null;

  const isAdmin = String(fromId) === String(adminId);
  if (command !== 'whoami' && !isAdmin) {
    log.warn({ from_id: fromId, command }, 'admin command rejected: unauthorized');
    return null;
  }

  try {
    return await handler({ args, services, fromId });
  } catch (err) {
    log.error({ command, args, err }, 'admin command failed');
    return `❌ error ejecutando /${command}: ${err.message}`;
  }
}

// ─── Wiring (impure — hace I/O) ───────────────────────────────────────────────

/**
 * Registra el listener `bot.on('message')` que atiende comandos admin.
 * Debe llamarse una vez al arranque del servidor.
 *
 * @param {import('grammy').Bot} bot
 */
export function registerAdminCommands(bot) {
  const services = { pauseChatBot, resumeChatBot, getPausedChats, getChatStatus, resolveClientIdentifier };

  bot.on('message', async (ctx) => {
    // Sólo chats privados 1:1 con el bot — ignoramos grupos.
    if (ctx.chat?.type !== 'private') return;
    const text = ctx.message?.text;
    if (!text) return;

    const reply = await dispatchAdminCommand({
      text,
      fromId: ctx.from?.id,
      adminId: env.ADMIN_TELEGRAM_USER_ID,
      services,
    });
    if (reply === null) return;

    try {
      await ctx.api.sendMessage(ctx.chat.id, reply);
      log.info({ from_id: ctx.from?.id, command_preview: text.slice(0, 40) }, 'admin command replied');
    } catch (err) {
      log.error({ err }, 'admin command reply failed');
    }
  });
}
