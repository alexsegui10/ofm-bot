import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { createHmac } from 'crypto';
import { verifyIpnSignature, PAID_STATUSES, FAILED_STATUSES, createInvoice, selectPayCurrency, fetchMinAmount, getAvailableCurrencies, clearMinAmountCache } from './nowpayments.js';

vi.mock('../../config/env.js', () => ({
  env: {
    NOWPAYMENTS_API_KEY: 'test_api_key',
    NOWPAYMENTS_IPN_SECRET: 'test_ipn_secret',
    WEBHOOK_BASE_URL: 'https://test.example.com',
  },
}));

// ─── verifyIpnSignature ───────────────────────────────────────────────────────

function makeSignature(body, secret = 'test_ipn_secret') {
  function sortKeys(obj) {
    if (typeof obj !== 'object' || obj === null) return obj;
    if (Array.isArray(obj)) return obj.map(sortKeys);
    return Object.keys(obj).sort().reduce((acc, key) => { acc[key] = sortKeys(obj[key]); return acc; }, {});
  }
  return createHmac('sha512', secret).update(JSON.stringify(sortKeys(body))).digest('hex');
}

describe('verifyIpnSignature', () => {
  const body = { order_id: 'txn_1', payment_status: 'finished', price_amount: 9.99 };

  it('returns true for a valid signature', () => {
    const sig = makeSignature(body);
    expect(verifyIpnSignature(body, sig)).toBe(true);
  });

  it('returns true even if body keys arrive unsorted', () => {
    const unsortedBody = { payment_status: 'finished', price_amount: 9.99, order_id: 'txn_1' };
    const sig = makeSignature(body); // computed on sorted version
    expect(verifyIpnSignature(unsortedBody, sig)).toBe(true);
  });

  it('returns false for a tampered signature', () => {
    expect(verifyIpnSignature(body, 'deadbeef')).toBe(false);
  });

  it('returns false when signature is missing', () => {
    expect(verifyIpnSignature(body, undefined)).toBe(false);
    expect(verifyIpnSignature(body, '')).toBe(false);
  });

  it('returns false when body differs from signed body', () => {
    const sig = makeSignature(body);
    const tampered = { ...body, price_amount: 0.01 };
    expect(verifyIpnSignature(tampered, sig)).toBe(false);
  });

  it('is case-insensitive for hex digits', () => {
    const sig = makeSignature(body).toUpperCase();
    expect(verifyIpnSignature(body, sig)).toBe(true);
  });
});

// ─── selectPayCurrency ────────────────────────────────────────────────────────

const TEST_CONFIG = {
  crypto: {
    swap_threshold_eur: 20,
    below_threshold: { pay_currency: 'usdttrc20' },
    above_threshold: { pay_currency: null },
  },
};

describe('selectPayCurrency', () => {
  it('returns "usdttrc20" when amount < threshold (avoids cross-swap)', () => {
    expect(selectPayCurrency(15, TEST_CONFIG)).toBe('usdttrc20');
    expect(selectPayCurrency(19.99, TEST_CONFIG)).toBe('usdttrc20');
    expect(selectPayCurrency(1, TEST_CONFIG)).toBe('usdttrc20');
  });

  it('returns null when amount >= threshold (free currency choice)', () => {
    expect(selectPayCurrency(20, TEST_CONFIG)).toBeNull();
    expect(selectPayCurrency(25, TEST_CONFIG)).toBeNull();
    expect(selectPayCurrency(100, TEST_CONFIG)).toBeNull();
  });

  it('boundary: exactly at threshold → free choice', () => {
    expect(selectPayCurrency(20, TEST_CONFIG)).toBeNull();
  });

  it('boundary: one cent below threshold → forced USDT TRC20', () => {
    expect(selectPayCurrency(19.99, TEST_CONFIG)).toBe('usdttrc20');
  });
});

// ─── PAID / FAILED status sets ────────────────────────────────────────────────

describe('PAID_STATUSES', () => {
  it('includes finished', () => expect(PAID_STATUSES.has('finished')).toBe(true));
  it('includes confirmed', () => expect(PAID_STATUSES.has('confirmed')).toBe(true));
  it('does not include waiting', () => expect(PAID_STATUSES.has('waiting')).toBe(false));
});

describe('FAILED_STATUSES', () => {
  it('includes failed', () => expect(FAILED_STATUSES.has('failed')).toBe(true));
  it('includes expired', () => expect(FAILED_STATUSES.has('expired')).toBe(true));
  it('does not include finished', () => expect(FAILED_STATUSES.has('finished')).toBe(false));
});

// ─── createInvoice ────────────────────────────────────────────────────────────

describe('createInvoice', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns invoice data on success', async () => {
    const mockResponse = { id: 'inv_123', invoice_url: 'https://nowpayments.io/payment/inv_123' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    }));

    const result = await createInvoice({ orderId: 'txn_1', amountEur: 9.99, description: 'Pack fotos' });
    expect(result.id).toBe('inv_123');
    expect(result.invoice_url).toContain('nowpayments.io');
  });

  it('includes order_id and EUR currency in request body', async () => {
    let capturedBody;
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'inv_x', invoice_url: 'url' }) });
    }));

    await createInvoice({ orderId: 'txn_42', amountEur: 19.99, description: 'Pack premium' });
    expect(capturedBody.order_id).toBe('txn_42');
    expect(capturedBody.price_currency).toBe('EUR');
    expect(capturedBody.price_amount).toBe(19.99);
  });

  it('uses custom ipnCallbackUrl when provided', async () => {
    let capturedBody;
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'inv_x', invoice_url: 'url' }) });
    }));

    await createInvoice({ orderId: 'txn_1', amountEur: 5, description: 'x', ipnCallbackUrl: 'https://custom.example.com/ipn' });
    expect(capturedBody.ipn_callback_url).toBe('https://custom.example.com/ipn');
  });

  it('includes pay_currency in body when amount is below threshold', async () => {
    let capturedBody;
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'inv_x', invoice_url: 'url', pay_currency: 'USDTTRC20' }) });
    }));

    await createInvoice({
      orderId: 'txn_small',
      amountEur: 15,
      description: 'test',
      payConfig: TEST_CONFIG,
    });
    expect(capturedBody.pay_currency).toBe('usdttrc20');
  });

  it('omits pay_currency in body when amount is at or above threshold', async () => {
    let capturedBody;
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'inv_x', invoice_url: 'url', pay_currency: null }) });
    }));

    await createInvoice({
      orderId: 'txn_large',
      amountEur: 25,
      description: 'test',
      payConfig: TEST_CONFIG,
    });
    expect(capturedBody.pay_currency).toBeUndefined();
  });

  it('throws on API error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    }));

    await expect(createInvoice({ orderId: 'txn_1', amountEur: 9.99, description: 'test' }))
      .rejects.toThrow('NowPayments API error 401');
  });
});

// ─── fetchMinAmount ───────────────────────────────────────────────────────────

const TEST_CONFIG_GREY = {
  crypto: {
    swap_threshold_eur: 20,
    grey_zone_max_eur: 50,
    cache_ttl_minutes: 15,
    below_threshold: { pay_currency: 'usdttrc20' },
    above_threshold: {
      pay_currency: null,
      accepted_currencies: ['usdttrc20', 'btc', 'ltc'],
    },
  },
};

describe('fetchMinAmount', () => {
  beforeEach(() => {
    clearMinAmountCache();
    vi.restoreAllMocks();
  });
  afterEach(() => vi.restoreAllMocks());

  it('returns min_amount from API response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ min_amount: 12.5 }),
    }));
    const result = await fetchMinAmount(15, 'btc', TEST_CONFIG_GREY);
    expect(result).toBe(12.5);
  });

  it('caches result and does not call fetch again within TTL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ min_amount: 10 }),
    });
    vi.stubGlobal('fetch', mockFetch);
    await fetchMinAmount(15, 'ltc', TEST_CONFIG_GREY);
    await fetchMinAmount(15, 'ltc', TEST_CONFIG_GREY);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns Infinity on API error (treats currency as unavailable)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('error'),
    }));
    const result = await fetchMinAmount(15, 'eth', TEST_CONFIG_GREY);
    expect(result).toBe(Infinity);
  });

  it('clears cache after clearMinAmountCache', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ min_amount: 5 }),
    });
    vi.stubGlobal('fetch', mockFetch);
    await fetchMinAmount(15, 'trx', TEST_CONFIG_GREY);
    clearMinAmountCache();
    await fetchMinAmount(15, 'trx', TEST_CONFIG_GREY);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

// ─── getAvailableCurrencies ───────────────────────────────────────────────────

describe('getAvailableCurrencies', () => {
  beforeEach(() => {
    clearMinAmountCache();
    vi.restoreAllMocks();
  });
  afterEach(() => vi.restoreAllMocks());

  it('zone 1: amount < threshold → forced usdttrc20, source forced', async () => {
    const result = await getAvailableCurrencies(10, TEST_CONFIG_GREY);
    expect(result.payCurrency).toBe('usdttrc20');
    expect(result.available).toEqual(['usdttrc20']);
    expect(result.source).toBe('forced');
  });

  it('zone 1: boundary 19.99 → forced', async () => {
    const result = await getAvailableCurrencies(19.99, TEST_CONFIG_GREY);
    expect(result.source).toBe('forced');
  });

  it('zone 3: amount > grey_zone_max → all currencies, source free', async () => {
    const result = await getAvailableCurrencies(60, TEST_CONFIG_GREY);
    expect(result.payCurrency).toBeNull();
    expect(result.available).toEqual(['usdttrc20', 'btc', 'ltc']);
    expect(result.source).toBe('free');
  });

  it('zone 2: grey zone → queries API, returns only viable currencies', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url) => {
      const url = _url.toString();
      if (url.includes('currency_to=btc')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ min_amount: 16 }) }); // 30 >= 16, viable
      }
      if (url.includes('currency_to=ltc')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ min_amount: 35 }) }); // 30 < 35, not viable
      }
      // usdttrc20 — always viable (min_amount 0)
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ min_amount: 0 }) });
    }));
    const result = await getAvailableCurrencies(30, TEST_CONFIG_GREY);
    expect(result.source).toBe('api');
    expect(result.available).toContain('btc');
    expect(result.available).toContain('usdttrc20');
    expect(result.available).not.toContain('ltc');
  });

  it('zone 2: falls back to usdttrc20 when all API calls fail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 503, text: () => Promise.resolve('down'),
    }));
    const result = await getAvailableCurrencies(25, TEST_CONFIG_GREY);
    expect(result.source).toBe('api');
    expect(result.available).toEqual(['usdttrc20']);
  });

  it('zone 2: boundary exactly at threshold (20) → api zone', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve({ min_amount: 10 }),
    }));
    const result = await getAvailableCurrencies(20, TEST_CONFIG_GREY);
    expect(result.source).toBe('api');
  });

  it('zone 2: boundary exactly at grey_zone_max (50) → api zone', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve({ min_amount: 10 }),
    }));
    const result = await getAvailableCurrencies(50, TEST_CONFIG_GREY);
    expect(result.source).toBe('api');
  });
});
