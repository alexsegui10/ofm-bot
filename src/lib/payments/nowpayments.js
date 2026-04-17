import { createHmac, timingSafeEqual } from 'crypto';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { env } from '../../config/env.js';
import { agentLogger } from '../logger.js';

const log = agentLogger('nowpayments');
const API_BASE = 'https://api.nowpayments.io/v1';
const __dirname = dirname(fileURLToPath(import.meta.url));

// IPN payment_status values we treat as paid
export const PAID_STATUSES = new Set(['finished', 'confirmed', 'partially_paid']);
// IPN payment_status values we treat as failed
export const FAILED_STATUSES = new Set(['failed', 'expired', 'refunded']);

// ─── Payment config ───────────────────────────────────────────────────────────

let _paymentConfig;
function getPaymentConfig() {
  if (!_paymentConfig) {
    const raw = readFileSync(join(__dirname, '../../../config/payment_config.json'), 'utf-8');
    _paymentConfig = JSON.parse(raw);
  }
  return _paymentConfig;
}

/**
 * Select the correct pay_currency for a NowPayments invoice.
 *
 * Background: NowPayments performs a cross-currency swap when the client pays
 * in a different currency than the merchant's payout wallet (USDT TRC20).
 * Swaps have dynamic minimums (~20-25 EUR) driven by network fees and liquidity.
 *
 * Rule (configurable in config/payment_config.json):
 *   price < threshold → force "usdttrc20" (same as payout wallet → no swap, ~1 EUR TRON fee)
 *   price >= threshold → null (client chooses freely; swap minimum is safely covered)
 *
 * @param {number} amountEur
 * @param {object} [config]  Parsed payment_config.json (injectable for tests)
 * @returns {string|null}  pay_currency value to pass to NowPayments, or null for free choice
 */
export function selectPayCurrency(amountEur, config = getPaymentConfig()) {
  const { swap_threshold_eur, below_threshold, above_threshold } = config.crypto;
  return amountEur < swap_threshold_eur
    ? below_threshold.pay_currency
    : above_threshold.pay_currency;
}

// ─── HMAC verification ────────────────────────────────────────────────────────

/**
 * Recursively sort object keys alphabetically (required by NowPayments HMAC spec).
 */
function sortObjectKeys(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(sortObjectKeys);
  return Object.keys(obj).sort().reduce((acc, key) => {
    acc[key] = sortObjectKeys(obj[key]);
    return acc;
  }, {});
}

/**
 * Verify the HMAC-SHA512 signature sent in the x-nowpayments-sig header.
 * Uses timing-safe comparison to prevent timing attacks.
 *
 * @param {object} body - Parsed JSON body from the IPN request
 * @param {string} signature - Value of x-nowpayments-sig header
 * @returns {boolean}
 */
export function verifyIpnSignature(body, signature) {
  if (!env.NOWPAYMENTS_IPN_SECRET || !signature) return false;
  try {
    const sorted = JSON.stringify(sortObjectKeys(body));
    const computed = createHmac('sha512', env.NOWPAYMENTS_IPN_SECRET)
      .update(sorted)
      .digest('hex');
    const a = Buffer.from(computed.toLowerCase());
    const b = Buffer.from(signature.toLowerCase());
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ─── Dynamic min-amount cache ─────────────────────────────────────────────────

/** @type {Map<string, { minAmount: number, expiresAt: number }>} */
const _minAmountCache = new Map();

/** Clear the cache — exported for tests. */
export function clearMinAmountCache() {
  _minAmountCache.clear();
}

/**
 * Fetch the minimum payable amount for a given currency from NowPayments.
 * Results are cached per-currency for `cache_ttl_minutes` minutes.
 *
 * @param {number} amountEur  - The invoice amount in EUR (used as the `amount` param)
 * @param {string} currencyTo - Target pay_currency (e.g. "btc", "ltc")
 * @param {object} [config]   - Parsed payment_config.json (injectable for tests)
 * @returns {Promise<number>} - min_amount in EUR for that currency
 */
export async function fetchMinAmount(amountEur, currencyTo, config = getPaymentConfig()) {
  const ttlMs = (config.crypto.cache_ttl_minutes ?? 15) * 60 * 1000;
  const now = Date.now();
  const cached = _minAmountCache.get(currencyTo);
  if (cached && cached.expiresAt > now) return cached.minAmount;

  const params = new URLSearchParams({
    currency_from: 'EUR',
    currency_to: currencyTo,
    amount: String(amountEur),
    fiat_equivalent: 'usd',
    is_fee_paid_by_user: 'true',
  });

  const res = await fetch(`${API_BASE}/min-amount?${params}`, {
    headers: { 'x-api-key': env.NOWPAYMENTS_API_KEY },
  });

  if (!res.ok) {
    const text = await res.text();
    log.warn({ status: res.status, body: text, currency_to: currencyTo }, 'fetchMinAmount failed — treating as unavailable');
    return Infinity; // treat as unavailable to be safe
  }

  const data = await res.json();
  const minAmount = Number(data.min_amount ?? data.min_exchange_amount ?? Infinity);
  _minAmountCache.set(currencyTo, { minAmount, expiresAt: now + ttlMs });
  return minAmount;
}

/**
 * Determine which currencies are available for a given EUR amount.
 *
 * Three zones:
 *   1. amount < swap_threshold_eur  → forced USDT TRC20 (no swap)
 *   2. swap_threshold_eur ≤ amount ≤ grey_zone_max_eur → query /v1/min-amount per currency, filter viable ones
 *   3. amount > grey_zone_max_eur   → all accepted_currencies are available (swap min safely covered)
 *
 * @param {number} amountEur
 * @param {object} [config]
 * @returns {Promise<{ payCurrency: string|null, available: string[], source: 'forced'|'api'|'free' }>}
 */
export async function getAvailableCurrencies(amountEur, config = getPaymentConfig()) {
  const { swap_threshold_eur, grey_zone_max_eur, above_threshold } = config.crypto;

  // Zone 1: below threshold → force USDT TRC20
  if (amountEur < swap_threshold_eur) {
    return { payCurrency: 'usdttrc20', available: ['usdttrc20'], source: 'forced' };
  }

  const allCurrencies = above_threshold.accepted_currencies ?? [];

  // Zone 3: above grey zone → all accepted currencies, free choice
  if (amountEur > (grey_zone_max_eur ?? 50)) {
    return { payCurrency: null, available: allCurrencies, source: 'free' };
  }

  // Zone 2: grey zone → query /v1/min-amount per currency and filter
  const results = await Promise.allSettled(
    allCurrencies.map(async (currency) => {
      const minAmount = await fetchMinAmount(amountEur, currency, config);
      return { currency, viable: amountEur >= minAmount };
    }),
  );

  const viable = results
    .filter((r) => r.status === 'fulfilled' && r.value.viable)
    .map((r) => r.value.currency);

  // Always include usdttrc20 as fallback — it never has a swap minimum
  const available = viable.length > 0 ? viable : ['usdttrc20'];

  return { payCurrency: null, available, source: 'api' };
}

// ─── Invoice creation ─────────────────────────────────────────────────────────

/**
 * Create a NowPayments hosted invoice, automatically selecting pay_currency
 * based on amount to avoid cross-swap minimums (see selectPayCurrency).
 *
 * @param {{ orderId: string, amountEur: number, description: string, ipnCallbackUrl?: string, payConfig?: object }} params
 * @returns {Promise<{ id: string, invoice_url: string, pay_currency: string|null, [key: string]: any }>}
 */
export async function createInvoice({ orderId, amountEur, description, ipnCallbackUrl, payConfig }) {
  const payCurrency = selectPayCurrency(amountEur, payConfig ?? getPaymentConfig());

  const body = {
    price_amount: amountEur,
    price_currency: 'EUR',
    order_id: orderId,
    order_description: description,
    ipn_callback_url: ipnCallbackUrl ?? `${env.WEBHOOK_BASE_URL}/webhook/nowpayments`,
    is_fee_paid_by_user: true,
  };

  // Only include pay_currency when it's forced (null = let NowPayments show all options)
  if (payCurrency !== null) {
    body.pay_currency = payCurrency;
  }

  log.debug({ order_id: orderId, amount_eur: amountEur, pay_currency: payCurrency ?? 'free_choice' }, 'creating invoice');

  const res = await fetch(`${API_BASE}/invoice`, {
    method: 'POST',
    headers: {
      'x-api-key': env.NOWPAYMENTS_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    log.error({ status: res.status, body: text, order_id: orderId }, 'createInvoice failed');
    throw new Error(`NowPayments API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  log.info({ invoice_id: data.id, order_id: orderId, amount_eur: amountEur, pay_currency: payCurrency ?? 'free_choice' }, 'invoice created');
  return data;
}
