// Sistema common (SPEC-HANDOFF-V1 regla 5): notifyOwner con adaptador
// desacoplado. Hoy `TwilioWhatsAppAdapter`. Mañana podrá ser `TelegramAdapter`,
// `EmailAdapter`, `PanelWebAdapter` sin cambiar la lógica que llama a
// `notifyOwner`.

import { sendWhatsApp as twilioSendWhatsApp } from '../lib/twilio.js';
import { env } from '../config/env.js';
import { agentLogger } from '../lib/logger.js';

const log = agentLogger('notify-owner');

// ─── Event templates ─────────────────────────────────────────────────────────
//
// Mapa extensible. Sistemas 1 y 3 (futuros commits C4, C5) añaden aquí sus
// plantillas. Firma: `(payload: object) => string`. El objeto payload es
// propio de cada evento — documentar los campos esperados en el JSDoc del
// caller, no aquí (evitamos duplicar la verdad).
//
// Exportado mutable para permitir testing + extensión en sistemas siguientes
// sin tocar este archivo.

export const EVENT_TEMPLATES = {
  /**
   * Sistema 1 — cliente confirma día/hora de videollamada.
   * payload: { clientId, clientName, confirmedTime, telegramLink, recentMessages[] }
   */
  videocall_scheduled(payload) {
    const {
      clientId,
      clientName = '(sin nombre)',
      confirmedTime = '(no especificado)',
      telegramLink = null,
      recentMessages = [],
    } = payload;
    const lines = [
      '🎥 Videollamada programada',
      `Cliente: ${clientName} (id=${clientId})`,
      `Cuándo: ${confirmedTime}`,
    ];
    if (telegramLink) lines.push(`Chat: ${telegramLink}`);
    if (recentMessages.length > 0) {
      lines.push('Últimos mensajes:');
      recentMessages.slice(-3).forEach((m) => lines.push(`  [${m.role}] ${String(m.content).slice(0, 120)}`));
    }
    return lines.join('\n');
  },

  /**
   * Sistema 3 — cliente insiste en preguntar si es IA.
   * payload: { clientId, clientName, literalMessage }
   */
  ia_verification_serious(payload) {
    const { clientId, clientName = '(sin nombre)', literalMessage = '' } = payload;
    return [
      '⚠️ Cliente insiste en preguntar si eres IA',
      `Cliente: ${clientName} (id=${clientId})`,
      `Mensaje literal: "${String(literalMessage).slice(0, 240)}"`,
      'Chat pausado — usa /reactivar cuando estés listo.',
    ].join('\n');
  },
};

// ─── Adapters ─────────────────────────────────────────────────────────────────

/**
 * Envía notificaciones por WhatsApp vía Twilio. La credencial y destinatario
 * se leen de env (TWILIO_* y OWNER_WHATSAPP_TO). Si Twilio no está configurado
 * (p.ej. en dev local con stub) `sendWhatsApp` loggea warning y devuelve null
 * sin lanzar — el caller nunca revienta por falta de credenciales.
 *
 * La dependencia a `sendWhatsApp` es inyectable vía constructor para tests
 * unitarios (no llamadas de red reales).
 */
export class TwilioWhatsAppAdapter {
  constructor({ to = null, sendFn = twilioSendWhatsApp } = {}) {
    this.to = to ?? env.OWNER_WHATSAPP_TO;
    this.sendFn = sendFn;
  }

  async deliver(body) {
    if (!this.to) {
      log.warn({ body_preview: body.slice(0, 60) }, 'TwilioWhatsAppAdapter: no recipient configured (OWNER_WHATSAPP_TO vacío)');
      return null;
    }
    return await this.sendFn(this.to, body);
  }
}

/** Adaptador que no envía nada — registra localmente. Útil para dev/TEST_MODE. */
export class NoopAdapter {
  constructor() {
    this.sent = [];
  }
  async deliver(body) {
    this.sent.push(body);
    log.info({ body_preview: body.slice(0, 80) }, 'NoopAdapter: skipped (dev/test)');
    return { noop: true };
  }
}

// Singleton para la instancia de producción. Se sobreescribe en tests.
let _defaultAdapter = null;

/** Devuelve (y lazy-inicializa) el adaptador por defecto. */
export function getDefaultAdapter() {
  if (_defaultAdapter === null) {
    _defaultAdapter = env.TEST_MODE
      ? new NoopAdapter()
      : new TwilioWhatsAppAdapter();
  }
  return _defaultAdapter;
}

/** Reemplaza el adaptador por defecto (tests + cambio a futuro panel web). */
export function setDefaultAdapter(adapter) {
  _defaultAdapter = adapter;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Notifica al owner de un evento. Resuelve plantilla por `event`, la
 * renderiza con `payload`, y entrega vía `adapter.deliver(body)`.
 *
 * @param {string} event  Nombre del evento — debe existir en EVENT_TEMPLATES.
 * @param {object} payload  Datos específicos del evento (ver cada template).
 * @param {object} [options]
 * @param {{deliver: (body: string) => Promise<any>}} [options.adapter]  Override del default.
 * @returns {Promise<any>}  Lo que devuelva adapter.deliver (p.ej. mensaje Twilio).
 */
export async function notifyOwner(event, payload = {}, { adapter = getDefaultAdapter() } = {}) {
  const template = EVENT_TEMPLATES[event];
  if (!template) {
    log.error({ event, known: Object.keys(EVENT_TEMPLATES) }, 'notifyOwner: unknown event');
    throw new Error(`notifyOwner: unknown event "${event}"`);
  }
  const body = template(payload);
  try {
    const result = await adapter.deliver(body);
    log.info({ event, body_preview: body.slice(0, 80) }, 'owner notified');
    return result;
  } catch (err) {
    log.error({ event, err }, 'notifyOwner delivery failed');
    throw err;
  }
}
