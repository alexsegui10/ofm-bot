import express from 'express';
import { webhookCallback } from 'grammy';
import { getBot } from './lib/telegram.js';
import { agentLogger } from './lib/logger.js';
import { handleNowPaymentsWebhook, handlePayPalWebhook, handleBizumConfirmation } from './agents/payment-verifier.js';
import { reloadPricing } from './lib/product-catalog.js';
import { env } from './config/env.js';

const log = agentLogger('http');

/**
 * Creates and returns the Express app.
 * Bot handlers must be registered (via registerBusinessHandlers) before calling
 * this — or before any webhook update arrives. See src/index.js for startup order.
 */
export function createApp() {
  const app = express();

  // JSON parser for Telegram + NowPayments webhooks
  app.use(express.json());
  // URL-encoded parser for Twilio WhatsApp inbound
  app.use(express.urlencoded({ extended: false }));

  // ─── Health check ─────────────────────────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ─── Admin: reload pricing.json from disk without restart ─────────────────
  app.post('/admin/reload-pricing', (_req, res) => {
    try {
      const pricing = reloadPricing();
      log.info('pricing reloaded from disk');
      res.json({ ok: true, categories: Object.keys(pricing) });
    } catch (err) {
      log.error({ err }, 'failed to reload pricing');
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ─── Telegram webhook — grammy processes all updates ──────────────────────
  app.post('/webhook/telegram', webhookCallback(getBot(), 'express'));

  // ─── NowPayments IPN ─────────────────────────────────────────────────────
  app.post('/webhook/nowpayments', handleNowPaymentsWebhook);

  // ─── PayPal webhook (feature-flagged) ────────────────────────────────────
  app.post('/webhook/paypal', handlePayPalWebhook);

  // ─── Twilio WhatsApp inbound (Bizum confirmations from partner) ───────────
  app.post('/webhook/twilio', async (req, res) => {
    const from = req.body?.From ?? '';
    const body = req.body?.Body ?? '';

    log.debug({ from, body: body.slice(0, 80) }, 'twilio inbound received');

    // Only process messages from the partner's WhatsApp number
    const partnerNumber = env.PARTNER_WHATSAPP_TO?.replace('+', '').replace(/\s/g, '');
    const fromNumber = from.replace('whatsapp:', '').replace('+', '').replace(/\s/g, '');

    if (partnerNumber && fromNumber !== partnerNumber) {
      log.warn({ from }, 'twilio: message from unknown number, ignoring');
      return res.type('text/xml').send('<Response></Response>');
    }

    try {
      await handleBizumConfirmation(body);
    } catch (err) {
      log.error({ from, err }, 'twilio: bizum confirmation handler error');
    }

    // Twilio always expects TwiML response
    res.type('text/xml').send('<Response></Response>');
  });

  return app;
}
