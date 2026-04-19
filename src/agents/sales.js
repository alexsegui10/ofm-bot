import { agentLogger } from '../lib/logger.js';
import { createInvoice, getAvailableCurrencies } from '../lib/payments/nowpayments.js';
import { createTransaction } from '../lib/transactions.js';
import { initiateBizumPayment } from './payment-verifier.js';
import { env } from '../config/env.js';
import { getProducts } from '../config/products.js';
import { calculatePhotoPrice } from '../lib/pricing.js';

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
 *   productId?: string|null,
 *   amountEur?: number,
 *   productType?: string,
 *   description?: string,
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

    return {
      message,
      paymentMethod: 'crypto',
      invoiceUrl,
      paymentId,
      productId,
      amountEur,
      productType: productTypeResolved,
      description,
    };
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
    return {
      message,
      paymentMethod: 'bizum',
      bizumId,
      productId,
      amountEur,
      productType: productTypeResolved,
      description,
    };
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

// ─── Product v2 offer ────────────────────────────────────────────────────────

/**
 * Resuelve un productId v2 (del catálogo `products.json`) a los parámetros de
 * runSales y genera la oferta de pago.
 *
 * Acepta:
 *   - "v_001", "v_008"...  → video individual
 *   - "pk_001", "pk_004"...→ pack de fotos
 *   - "st_5min", "st_10min", "st_15min" → plantilla de sexting
 *   - "singles:<tag>:<count>" → fotos sueltas por tag (precio con calculatePhotoPrice)
 *   - "videocall:<minutes>" → videollamada (mín 5 min)
 *   - "custom" → personalizado (precio mínimo)
 *
 * @param {{
 *   productId: string,
 *   client: object,
 *   paymentMethod?: 'crypto'|'bizum'|'stars',
 * }} params
 * @returns {Promise<ReturnType<typeof runSales> | null>}  Null si el productId es
 *          desconocido o inactivo (el caller responde al cliente con un mensaje).
 */
export async function createOfferFromProduct({ productId, client, paymentMethod = 'crypto' }) {
  if (!productId) return null;
  const products = getProducts();

  // ─── Video individual ─────────────────────────────────────────────────────
  if (/^v_\d+$/.test(productId)) {
    const v = products.videos.find((x) => x.id === productId && x.activo);
    if (!v) return null;
    return runSales({
      intent: 'choose_video',
      client,
      amountEur: v.precio_eur,
      productType: 'video',
      productId,
      description: v.titulo,
      paymentMethod,
    });
  }

  // ─── Pack de fotos ────────────────────────────────────────────────────────
  if (/^pk_\d+$/.test(productId)) {
    const pk = products.photo_packs.find((x) => x.id === productId && x.activo);
    if (!pk) return null;
    return runSales({
      intent: 'choose_pack',
      client,
      amountEur: pk.precio_eur,
      productType: 'pack',
      productId,
      description: pk.titulo,
      paymentMethod,
    });
  }

  // ─── Sexting template ─────────────────────────────────────────────────────
  if (/^st_\d+min$/.test(productId)) {
    const st = products.sexting_templates.find((x) => x.id === productId);
    if (!st) return null;
    return runSales({
      intent: 'buy_sexting_template',
      client,
      amountEur: st.precio_eur,
      productType: 'sexting',
      productId,
      description: `Sexting ${st.duracion_min} min`,
      paymentMethod,
    });
  }

  // ─── Singles: "singles:culo:2" ────────────────────────────────────────────
  if (productId.startsWith('singles:')) {
    const [, tag, countStr] = productId.split(':');
    const count = Number(countStr);
    if (!tag || !Number.isInteger(count)) return null;
    if (!products.photo_single.tags_disponibles.includes(tag)) return null;
    const amount = calculatePhotoPrice(count); // puede lanzar si count > 10
    return runSales({
      intent: 'buy_single_photos',
      client,
      amountEur: amount,
      productType: 'photos',
      productId,
      description: `${count} ${count === 1 ? 'foto' : 'fotos'} de ${tag}`,
      paymentMethod,
    });
  }

  // ─── Videollamada: "videocall:7" ─────────────────────────────────────────
  if (productId.startsWith('videocall:')) {
    const mins = Number(productId.split(':')[1]);
    if (!Number.isInteger(mins) || mins < products.videollamada.minimo_minutos) return null;
    return runSales({
      intent: 'videocall_request',
      client,
      amountEur: mins * products.videollamada.precio_por_minuto,
      productType: 'videocall',
      productId,
      description: `Videollamada ${mins} min`,
      paymentMethod,
    });
  }

  // ─── Personalizado ────────────────────────────────────────────────────────
  if (productId === 'custom') {
    return runSales({
      intent: 'custom_video_request',
      client,
      amountEur: products.personalizado.precio_minimo,
      productType: 'custom',
      productId: 'custom',
      description: 'Video personalizado',
      paymentMethod,
    });
  }

  log.warn({ productId }, 'createOfferFromProduct: unknown productId');
  return null;
}

/**
 * HIGH-ROI FIX #1 helper — pure price lookup for a productId (no side effects,
 * no invoice, no DB row). Used by the orchestrator when the client has chosen
 * a product but not yet a payment method, so Alba can ask "bizum, crypto o
 * stars?" stating the correct amount without pre-creating any transaction.
 *
 * Accepts the same productId vocabulary as createOfferFromProduct:
 *   - "v_001"...             → video individual
 *   - "pk_001"...            → pack de fotos
 *   - "st_5min"|"st_10min"|"st_15min" → sexting template
 *   - "singles:<tag>:<count>"         → fotos sueltas
 *   - "videocall:<minutes>"           → videollamada (mín. 5 min)
 *   - "custom"                        → personalizado (precio mínimo)
 *
 * @param {string} productId
 * @returns {{ amountEur: number, description: string, productType: string } | null}
 */
export function lookupProductPrice(productId) {
  if (!productId) return null;
  const products = getProducts();

  if (/^v_\d+$/.test(productId)) {
    const v = products.videos.find((x) => x.id === productId && x.activo);
    if (!v) return null;
    return { amountEur: v.precio_eur, description: v.titulo, productType: 'video' };
  }

  if (/^pk_\d+$/.test(productId)) {
    const pk = products.photo_packs.find((x) => x.id === productId && x.activo);
    if (!pk) return null;
    return { amountEur: pk.precio_eur, description: pk.titulo, productType: 'pack' };
  }

  if (/^st_\d+min$/.test(productId)) {
    const st = products.sexting_templates.find((x) => x.id === productId);
    if (!st) return null;
    return { amountEur: st.precio_eur, description: `Sexting ${st.duracion_min} min`, productType: 'sexting' };
  }

  if (productId.startsWith('singles:')) {
    const [, tag, countStr] = productId.split(':');
    const count = Number(countStr);
    if (!tag || !Number.isInteger(count)) return null;
    if (!products.photo_single.tags_disponibles.includes(tag)) return null;
    try {
      const amount = calculatePhotoPrice(count);
      return {
        amountEur: amount,
        description: `${count} ${count === 1 ? 'foto' : 'fotos'} de ${tag}`,
        productType: 'photos',
      };
    } catch {
      return null;
    }
  }

  if (productId.startsWith('videocall:')) {
    const mins = Number(productId.split(':')[1]);
    if (!Number.isInteger(mins) || mins < products.videollamada.minimo_minutos) return null;
    return {
      amountEur: mins * products.videollamada.precio_por_minuto,
      description: `Videollamada ${mins} min`,
      productType: 'videocall',
    };
  }

  if (productId === 'custom') {
    return {
      amountEur: products.personalizado.precio_minimo,
      description: 'Video personalizado',
      productType: 'custom',
    };
  }

  return null;
}
