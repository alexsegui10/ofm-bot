import { agentLogger } from '../lib/logger.js';
import { createInvoice, getAvailableCurrencies } from '../lib/payments/nowpayments.js';
import { createTransaction } from '../lib/transactions.js';
import { initiateBizumPayment } from './payment-verifier.js';
import { env } from '../config/env.js';

const log = agentLogger('sales');

// ─── Catalog helpers ──────────────────────────────────────────────────────────

/**
 * Map router intents to catalog product types.
 * Expanded when pricing.json is populated.
 */
const INTENT_TO_PRODUCT_TYPE = {
  sale_intent_photos: 'photos',
  sale_intent_videos: 'videos',
  sexting_request: 'sexting',
  custom_video_request: 'custom',
  videocall_request: 'videocall',
};

// ─── Currency display helpers ─────────────────────────────────────────────────

const CURRENCY_LABELS = {
  usdttrc20: 'USDT TRC-20',
  usdterc20: 'USDT ERC-20',
  btc: 'Bitcoin',
  eth: 'Ethereum',
  ltc: 'Litecoin',
  trx: 'TRON',
  doge: 'DOGE',
  bnbbsc: 'BNB (BSC)',
  sol: 'Solana',
};

function currencyLabel(currency) {
  return CURRENCY_LABELS[currency.toLowerCase()] ?? currency.toUpperCase();
}

// ─── Payment method selection ─────────────────────────────────────────────────

/**
 * Build a NowPayments invoice and a pending transaction for a product sale.
 *
 * @param {{ clientId, amountEur, productType, productId, description }} params
 * @returns {Promise<{ invoiceUrl: string, paymentId: string, payCurrency: string|null, available: string[], source: string }>}
 */
async function createCryptoPayment({ clientId, amountEur, productType, productId, description }) {
  const orderId = `np_${Date.now()}_${clientId}`;

  // Resolve available currencies before hitting DB/API (pure logic)
  const { payCurrency, available, source } = await getAvailableCurrencies(amountEur);

  // createTransaction first so order_id exists in our DB before the IPN arrives
  await createTransaction({
    clientId,
    paymentId: orderId,
    method: 'nowpayments',
    amountEur,
    productType,
    productId,
  });

  const invoice = await createInvoice({ orderId, amountEur, description });

  return {
    invoiceUrl: invoice.invoice_url,
    paymentId: orderId,
    payCurrency: invoice.pay_currency ?? payCurrency ?? null,
    available,
    source,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate a payment offer for a client.
 *
 * Selects payment method based on `paymentMethod` param:
 *   - "crypto"  → NowPayments invoice (pay_currency auto-selected by amount)
 *   - "bizum"   → Bizum pending record + instructions message
 *   - "stars"   → returns product info for Stars invoice (caller sends via bot.api)
 *
 * @param {{
 *   intent: string,
 *   client: object,
 *   amountEur: number,
 *   productType: string,
 *   productId?: string,
 *   description: string,
 *   paymentMethod?: 'crypto'|'bizum'|'stars',
 * }} params
 *
 * @returns {Promise<{
 *   message: string,
 *   paymentMethod: string,
 *   invoiceUrl?: string,
 *   paymentId?: string,
 *   bizumId?: number,
 *   starsAmount?: number,
 * }>}
 */
export async function runSales({
  intent,
  client,
  amountEur,
  productType,
  productId = null,
  description,
  paymentMethod = 'crypto',
}) {
  const productTypeResolved = productType ?? INTENT_TO_PRODUCT_TYPE[intent] ?? 'content';

  log.info({
    client_id: client.id,
    amount_eur: amountEur,
    product_type: productTypeResolved,
    payment_method: paymentMethod,
  }, 'sales: creating payment offer');

  if (paymentMethod === 'crypto') {
    const { invoiceUrl, paymentId, payCurrency, available, source } = await createCryptoPayment({
      clientId: client.id,
      amountEur,
      productType: productTypeResolved,
      productId,
      description,
    });

    const message =
      `te paso el link para que pagues bebe, son ${amountEur}€\n` +
      `${invoiceUrl}\n` +
      `en cuanto me llegue te lo mando 😈`;

    return { message, paymentMethod: 'crypto', invoiceUrl, paymentId };
  }

  if (paymentMethod === 'bizum') {
    const { bizumId } = await initiateBizumPayment({
      clientId: client.id,
      amountEur,
      productType: productTypeResolved,
      productId,
    });
    const bizumNumber = env.BIZUM_NUMBER ?? '662112420';
    const message =
      `hazme un bizum de ${amountEur}€ al ${bizumNumber}\n` +
      `cuando lo hagas dime y te lo paso`;
    return { message, paymentMethod: 'bizum', bizumId };
  }

  if (paymentMethod === 'stars') {
    const { eurToStars } = await import('../lib/payments/telegram-stars.js');
    const stars = eurToStars(amountEur);

    // Create transaction first — payload = payment_id used as Stars invoice payload
    const paymentId = `xtr_${Date.now()}_${client.id}`;
    await createTransaction({
      clientId: client.id,
      paymentId,
      method: 'telegram_stars',
      amountEur,
      productType: productTypeResolved,
      productId,
    });

    log.info({ client_id: client.id, stars, amount_eur: amountEur, payment_id: paymentId }, 'sales: stars offer prepared');

    return {
      message: `te mando la factura por aquí, son ${stars} stars\npágala y te lo envío altiro`,
      paymentMethod: 'stars',
      starsAmount: stars,
      amountEur,
      description,
      productType: productTypeResolved,
      productId,
      paymentId,
    };
  }

  throw new Error(`runSales: unknown paymentMethod "${paymentMethod}"`);
}
