import twilio from 'twilio';
import { env } from '../config/env.js';
import { agentLogger } from './logger.js';

const log = agentLogger('twilio');

let _client;

function getClient() {
  if (_client) return _client;
  if (!env.TWILIO_ACCOUNT_SID || env.TWILIO_ACCOUNT_SID === 'PENDING') {
    return null;
  }
  _client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  return _client;
}

/**
 * Send a WhatsApp message via Twilio.
 * If Twilio is not configured (PENDING), logs a warning and returns null
 * instead of throwing — safe to call even in FASE 1 before credentials exist.
 */
export async function sendWhatsApp(to, body) {
  const client = getClient();
  if (!client) {
    log.warn({ to, body: body.slice(0, 80) }, 'twilio not configured, skipping whatsapp send');
    return null;
  }
  const start = Date.now();
  try {
    const msg = await client.messages.create({
      from: env.TWILIO_WHATSAPP_FROM,
      to,
      body,
    });
    log.info({ to, sid: msg.sid, latency_ms: Date.now() - start }, 'whatsapp sent');
    return msg;
  } catch (err) {
    log.error({ to, err }, 'whatsapp send failed');
    throw err;
  }
}

export function sendWhatsAppToOwner(body) {
  return sendWhatsApp(env.OWNER_WHATSAPP_TO, body);
}

export function sendWhatsAppToPartner(body) {
  return sendWhatsApp(env.PARTNER_WHATSAPP_TO, body);
}
