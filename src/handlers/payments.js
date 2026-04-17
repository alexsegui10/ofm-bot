import { agentLogger } from '../lib/logger.js';
import { answerPreCheckout } from '../lib/payments/telegram-stars.js';
import { handleTelegramPayment } from '../agents/payment-verifier.js';
import { query } from '../lib/db.js';

const log = agentLogger('payments-handler');

/**
 * Register Telegram payment event handlers on the bot.
 *
 * Handles:
 *   - pre_checkout_query  — must be answered within 10 seconds
 *   - message:successful_payment — Stars payment completed
 *
 * @param {import('grammy').Bot} bot
 */
export function registerPaymentHandlers(bot) {
  // ── pre_checkout_query ───────────────────────────────────────────────────
  // Telegram sends this before charging the user. Must answer OK within 10s.
  bot.on('pre_checkout_query', async (ctx) => {
    const pcq = ctx.update.pre_checkout_query;
    log.info({
      pre_checkout_query_id: pcq.id,
      payload: pcq.invoice_payload,
      total_amount: pcq.total_amount,
      currency: pcq.currency,
      from_id: pcq.from.id,
    }, 'pre_checkout_query received');

    try {
      // Always approve — validation (stock check, etc.) would go here
      await answerPreCheckout(ctx.api, pcq.id, { ok: true });
      log.debug({ pre_checkout_query_id: pcq.id }, 'pre_checkout_query approved');
    } catch (err) {
      log.error({ err, pre_checkout_query_id: pcq.id }, 'failed to answer pre_checkout_query');
    }
  });

  // ── successful_payment ───────────────────────────────────────────────────
  bot.on('message:successful_payment', async (ctx) => {
    const msg = ctx.message;
    const fromId = msg.from?.id;

    log.info({
      from_id: fromId,
      payload: msg.successful_payment?.invoice_payload,
      stars: msg.successful_payment?.total_amount,
    }, 'successful_payment received');

    try {
      // Resolve client from telegram_user_id
      const { rows } = await query(
        'SELECT id FROM clients WHERE telegram_user_id = $1',
        [BigInt(fromId)],
      );
      const clientId = rows[0]?.id ?? null;

      const txn = await handleTelegramPayment(msg, clientId);

      if (txn) {
        log.info({ transaction_id: txn.id, client_id: clientId }, 'stars payment processed');
        // TODO FASE 5: trigger content delivery via content-curator
      }
    } catch (err) {
      log.error({ err, from_id: fromId }, 'failed to process successful_payment');
    }
  });

  log.info('payment handlers registered');
}
