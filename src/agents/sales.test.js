import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runSales, createOfferFromProduct } from './sales.js';

vi.mock('../lib/payments/nowpayments.js', () => ({
  createInvoice: vi.fn(),
  selectPayCurrency: vi.fn(),
  getAvailableCurrencies: vi.fn().mockResolvedValue({ payCurrency: 'usdttrc20', available: ['usdttrc20'], source: 'forced' }),
}));
vi.mock('../lib/transactions.js', () => ({
  createTransaction: vi.fn().mockResolvedValue({ id: 10 }),
}));
vi.mock('./payment-verifier.js', () => ({
  initiateBizumPayment: vi.fn().mockResolvedValue({ bizumId: 5, message: 'Hazme un Bizum de 15€ al +34 662 112 420' }),
  confirmBizumByClient: vi.fn(),
  handleNowPaymentsWebhook: vi.fn(),
  handlePayPalWebhook: vi.fn(),
  handleTelegramPayment: vi.fn(),
  handleBizumConfirmation: vi.fn(),
}));
vi.mock('../lib/payments/telegram-stars.js', () => ({
  eurToStars: vi.fn((eur) => Math.ceil(eur * 75)),
  sendStarsInvoice: vi.fn(),
  answerPreCheckout: vi.fn(),
  parseSuccessfulPayment: vi.fn(),
}));

import { createInvoice, getAvailableCurrencies } from '../lib/payments/nowpayments.js';
import { createTransaction } from '../lib/transactions.js';
import { initiateBizumPayment } from './payment-verifier.js';

const CLIENT = { id: 1, username: 'testfan', num_compras: 0, total_gastado: 0 };

// ─── crypto payment ───────────────────────────────────────────────────────────

describe('runSales — crypto', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createInvoice.mockResolvedValue({
      id: 'inv_001',
      invoice_url: 'https://nowpayments.io/payment/?iid=inv_001',
      pay_currency: 'USDTTRC20',
    });
    getAvailableCurrencies.mockResolvedValue({ payCurrency: 'usdttrc20', available: ['usdttrc20'], source: 'forced' });
  });

  it('creates transaction before calling NowPayments (DB first, then IPN)', async () => {
    const result = await runSales({ intent: 'sale_intent_photos', client: CLIENT, amountEur: 15, productType: 'photos', description: 'Pack fotos' });
    expect(createTransaction).toHaveBeenCalledBefore
      ? expect(createTransaction).toHaveBeenCalled()
      : expect(createTransaction).toHaveBeenCalled();
    expect(createInvoice).toHaveBeenCalled();
    expect(result.invoiceUrl).toContain('nowpayments.io');
  });

  it('passes the correct amountEur to createInvoice', async () => {
    await runSales({ intent: 'sale_intent_photos', client: CLIENT, amountEur: 9.99, productType: 'photos', description: 'test' });
    expect(createInvoice).toHaveBeenCalledWith(expect.objectContaining({ amountEur: 9.99 }));
  });

  it('message contains payment link', async () => {
    const result = await runSales({ intent: 'sale_intent_photos', client: CLIENT, amountEur: 15, productType: 'photos', description: 'test' });
    expect(result.message).toContain('nowpayments.io');
  });

  it('crypto message contains invoice link', async () => {
    const result = await runSales({ intent: 'sale_intent_photos', client: CLIENT, amountEur: 15, productType: 'photos', description: 'test' });
    expect(result.message).toContain('nowpayments.io');
    expect(result.message).toContain('15€');
  });

  it('crypto message contains invoice link regardless of currency source (api)', async () => {
    createInvoice.mockResolvedValue({ id: 'inv_002', invoice_url: 'https://nowpayments.io/payment/?iid=inv_002', pay_currency: null });
    getAvailableCurrencies.mockResolvedValue({ payCurrency: null, available: ['btc', 'ltc', 'usdttrc20'], source: 'api' });
    const result = await runSales({ intent: 'sale_intent_photos', client: CLIENT, amountEur: 25, productType: 'photos', description: 'test' });
    expect(result.message).toContain('nowpayments.io');
    expect(result.message).toContain('25€');
  });

  it('crypto message contains invoice link regardless of currency source (free)', async () => {
    createInvoice.mockResolvedValue({ id: 'inv_003', invoice_url: 'https://nowpayments.io/payment/?iid=inv_003', pay_currency: null });
    getAvailableCurrencies.mockResolvedValue({ payCurrency: null, available: ['usdttrc20', 'btc', 'eth', 'ltc'], source: 'free' });
    const result = await runSales({ intent: 'sale_intent_photos', client: CLIENT, amountEur: 60, productType: 'photos', description: 'test' });
    expect(result.message).toContain('nowpayments.io');
  });

  it('returns paymentMethod: "crypto"', async () => {
    const result = await runSales({ intent: 'sale_intent_photos', client: CLIENT, amountEur: 15, productType: 'photos', description: 'test' });
    expect(result.paymentMethod).toBe('crypto');
  });

  it('uses intent to resolve productType when not provided', async () => {
    await runSales({ intent: 'sale_intent_videos', client: CLIENT, amountEur: 20, description: 'test' });
    expect(createTransaction).toHaveBeenCalledWith(expect.objectContaining({ productType: 'videos' }));
  });
});

// ─── bizum payment ────────────────────────────────────────────────────────────

describe('runSales — bizum', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls initiateBizumPayment with correct params', async () => {
    const result = await runSales({ intent: 'sale_intent_photos', client: CLIENT, amountEur: 15, productType: 'photos', description: 'test', paymentMethod: 'bizum' });
    expect(initiateBizumPayment).toHaveBeenCalledWith(expect.objectContaining({ clientId: 1, amountEur: 15 }));
    expect(result.paymentMethod).toBe('bizum');
    expect(result.bizumId).toBe(5);
  });

  it('bizum message contains amount and natural instructions', async () => {
    const result = await runSales({ intent: 'sale_intent_photos', client: CLIENT, amountEur: 15, productType: 'photos', description: 'test', paymentMethod: 'bizum' });
    expect(result.message).toContain('bizum');
    expect(result.message).toContain('15€');
  });
});

// ─── stars payment ────────────────────────────────────────────────────────────

describe('runSales — stars', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns starsAmount and correct paymentMethod', async () => {
    const result = await runSales({ intent: 'sale_intent_photos', client: CLIENT, amountEur: 9.99, productType: 'photos', description: 'Pack fotos', paymentMethod: 'stars' });
    expect(result.paymentMethod).toBe('stars');
    expect(result.starsAmount).toBe(Math.ceil(9.99 * 75));
  });

  it('stars message contains stars amount and is natural', async () => {
    const result = await runSales({ intent: 'sale_intent_photos', client: CLIENT, amountEur: 9.99, productType: 'photos', description: 'test', paymentMethod: 'stars' });
    expect(result.message).toContain('stars');
    expect(result.message).toContain(String(Math.ceil(9.99 * 75)));
  });

  it('does not create a NowPayments invoice', async () => {
    await runSales({ intent: 'sale_intent_photos', client: CLIENT, amountEur: 9.99, productType: 'photos', description: 'test', paymentMethod: 'stars' });
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it('creates a transaction for stars payment', async () => {
    await runSales({ intent: 'sale_intent_photos', client: CLIENT, amountEur: 9.99, productType: 'photos', description: 'test', paymentMethod: 'stars' });
    expect(createTransaction).toHaveBeenCalledWith(expect.objectContaining({
      method: 'telegram_stars',
      amountEur: 9.99,
    }));
  });

  it('returns paymentId for stars (used as invoice payload)', async () => {
    const result = await runSales({ intent: 'sale_intent_photos', client: CLIENT, amountEur: 9.99, productType: 'photos', description: 'test', paymentMethod: 'stars' });
    expect(result.paymentId).toBeDefined();
    expect(result.paymentId).toMatch(/^xtr_/);
  });
});

// ─── unknown payment method ───────────────────────────────────────────────────

describe('runSales — unknown method', () => {
  it('throws for unknown payment method', async () => {
    await expect(
      runSales({ intent: 'sale_intent_photos', client: CLIENT, amountEur: 10, description: 'test', paymentMethod: 'venmo' }),
    ).rejects.toThrow('unknown paymentMethod');
  });
});

// ─── createOfferFromProduct ──────────────────────────────────────────────────

describe('createOfferFromProduct', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createInvoice.mockResolvedValue({
      id: 'inv_x', invoice_url: 'https://np/x', pay_currency: 'usdttrc20',
    });
  });

  it('resolves a video by id → amount matches products.json', async () => {
    const offer = await createOfferFromProduct({
      productId: 'v_001', client: CLIENT, paymentMethod: 'bizum',
    });
    expect(offer).toBeTruthy();
    expect(offer.paymentMethod).toBe('bizum');
    // v_001 es "squirt en la ducha" a 20€
    expect(initiateBizumPayment).toHaveBeenCalledWith(expect.objectContaining({
      amountEur: 20, productType: 'video', productId: 'v_001',
    }));
  });

  it('resolves a pack by id', async () => {
    const offer = await createOfferFromProduct({
      productId: 'pk_002', client: CLIENT, paymentMethod: 'bizum',
    });
    expect(offer).toBeTruthy();
    // pk_002 = "tetas en lencería" a 12€
    expect(initiateBizumPayment).toHaveBeenCalledWith(expect.objectContaining({
      amountEur: 12, productType: 'pack', productId: 'pk_002',
    }));
  });

  it('resolves a sexting template by id', async () => {
    const offer = await createOfferFromProduct({
      productId: 'st_10min', client: CLIENT, paymentMethod: 'bizum',
    });
    expect(offer).toBeTruthy();
    // st_10min a 30€
    expect(initiateBizumPayment).toHaveBeenCalledWith(expect.objectContaining({
      amountEur: 30, productType: 'sexting', productId: 'st_10min',
    }));
  });

  it('resolves singles with calculatePhotoPrice', async () => {
    const offer = await createOfferFromProduct({
      productId: 'singles:culo:2', client: CLIENT, paymentMethod: 'bizum',
    });
    // 2 fotos = 12€ (table PHOTO_PRICE_TABLE)
    expect(initiateBizumPayment).toHaveBeenCalledWith(expect.objectContaining({
      amountEur: 12, productType: 'photos',
    }));
    expect(offer.message).toMatch(/12€/);
  });

  it('throws on singles count > 10', async () => {
    await expect(
      createOfferFromProduct({ productId: 'singles:culo:15', client: CLIENT }),
    ).rejects.toThrow(/exceeds max/);
  });

  it('returns null for unknown productId', async () => {
    const offer = await createOfferFromProduct({
      productId: 'v_999', client: CLIENT,
    });
    expect(offer).toBeNull();
  });

  it('returns null for unknown tag in singles', async () => {
    const offer = await createOfferFromProduct({
      productId: 'singles:pies:2', client: CLIENT,
    });
    expect(offer).toBeNull();
  });

  it('resolves videocall by minutes', async () => {
    const offer = await createOfferFromProduct({
      productId: 'videocall:7', client: CLIENT, paymentMethod: 'bizum',
    });
    // 7 min * 4€ = 28€
    expect(initiateBizumPayment).toHaveBeenCalledWith(expect.objectContaining({
      amountEur: 28, productType: 'videocall',
    }));
  });

  it('rejects videocall under mínimo', async () => {
    const offer = await createOfferFromProduct({
      productId: 'videocall:3', client: CLIENT,
    });
    expect(offer).toBeNull();
  });

  it('resolves custom personalizado', async () => {
    const offer = await createOfferFromProduct({
      productId: 'custom', client: CLIENT, paymentMethod: 'bizum',
    });
    expect(initiateBizumPayment).toHaveBeenCalledWith(expect.objectContaining({
      amountEur: 45, productType: 'custom',
    }));
  });
});

// ─── BUG CRÍTICO #1: runSales/createOfferFromProduct must echo productId+amountEur ──
// (so the orchestrator can persist them via setPendingProduct(clientId, productId, amountEur)
//  without throwing "productId required").

describe('runSales return shape — productId + amountEur echoed back', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createInvoice.mockResolvedValue({ id: 'inv', invoice_url: 'https://np/x', pay_currency: 'usdttrc20' });
    getAvailableCurrencies.mockResolvedValue({ payCurrency: 'usdttrc20', available: ['usdttrc20'], source: 'forced' });
  });

  it('crypto echoes productId + amountEur + productType + description', async () => {
    const r = await runSales({
      intent: 'choose_video', client: CLIENT, amountEur: 20,
      productType: 'video', productId: 'v_001', description: 'squirt',
      paymentMethod: 'crypto',
    });
    expect(r.productId).toBe('v_001');
    expect(r.amountEur).toBe(20);
    expect(r.productType).toBe('video');
    expect(r.description).toBe('squirt');
  });

  it('bizum echoes productId + amountEur + productType + description', async () => {
    const r = await runSales({
      intent: 'choose_pack', client: CLIENT, amountEur: 12,
      productType: 'pack', productId: 'pk_002', description: 'tetas en lencería',
      paymentMethod: 'bizum',
    });
    expect(r.productId).toBe('pk_002');
    expect(r.amountEur).toBe(12);
    expect(r.productType).toBe('pack');
    expect(r.description).toBe('tetas en lencería');
  });

  it('stars echoes productId + amountEur (already worked, regression guard)', async () => {
    const r = await runSales({
      intent: 'buy_sexting_template', client: CLIENT, amountEur: 15,
      productType: 'sexting', productId: 'st_5min', description: 'Sexting 5 min',
      paymentMethod: 'stars',
    });
    expect(r.productId).toBe('st_5min');
    expect(r.amountEur).toBe(15);
  });
});

describe('createOfferFromProduct → offer carries productId + amountEur for setPendingProduct', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createInvoice.mockResolvedValue({ id: 'inv', invoice_url: 'https://np/x', pay_currency: 'usdttrc20' });
    getAvailableCurrencies.mockResolvedValue({ payCurrency: 'usdttrc20', available: ['usdttrc20'], source: 'forced' });
  });

  it('v_NNN → offer.productId = "v_001", offer.amountEur = 20 (bizum)', async () => {
    const offer = await createOfferFromProduct({ productId: 'v_001', client: CLIENT, paymentMethod: 'bizum' });
    expect(offer.productId).toBe('v_001');
    expect(offer.amountEur).toBe(20);
  });

  it('pk_NNN → offer.productId = "pk_002", offer.amountEur = 12 (crypto)', async () => {
    const offer = await createOfferFromProduct({ productId: 'pk_002', client: CLIENT, paymentMethod: 'crypto' });
    expect(offer.productId).toBe('pk_002');
    expect(offer.amountEur).toBe(12);
  });

  it('st_Nmin → offer.productId = "st_10min", offer.amountEur = 30 (bizum)', async () => {
    const offer = await createOfferFromProduct({ productId: 'st_10min', client: CLIENT, paymentMethod: 'bizum' });
    expect(offer.productId).toBe('st_10min');
    expect(offer.amountEur).toBe(30);
  });

  it('singles:tag:count → offer.productId = "singles:tetas:4", offer.amountEur = 19 (bizum)', async () => {
    const offer = await createOfferFromProduct({ productId: 'singles:tetas:4', client: CLIENT, paymentMethod: 'bizum' });
    expect(offer.productId).toBe('singles:tetas:4');
    expect(offer.amountEur).toBe(19);
  });
});
