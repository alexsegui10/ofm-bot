import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerPaymentHandlers } from './payments.js';

vi.mock('../lib/payments/telegram-stars.js', () => ({
  answerPreCheckout: vi.fn().mockResolvedValue(true),
}));
vi.mock('../agents/payment-verifier.js', () => ({
  handleTelegramPayment: vi.fn().mockResolvedValue({ id: 1, status: 'paid' }),
  handleNowPaymentsWebhook: vi.fn(),
  handlePayPalWebhook: vi.fn(),
  handleBizumConfirmation: vi.fn(),
  initiateBizumPayment: vi.fn(),
  confirmBizumByClient: vi.fn(),
}));
vi.mock('../lib/db.js', () => ({
  query: vi.fn().mockResolvedValue({ rows: [{ id: 42 }] }),
}));

import { answerPreCheckout } from '../lib/payments/telegram-stars.js';
import { handleTelegramPayment } from '../agents/payment-verifier.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

function buildBot() {
  const handlers = {};
  return {
    on: (event, handler) => { handlers[event] = handler; },
    _handlers: handlers,
  };
}

// ─── registerPaymentHandlers ──────────────────────────────────────────────────

describe('registerPaymentHandlers', () => {
  let bot;
  beforeEach(() => {
    vi.clearAllMocks();
    bot = buildBot();
    registerPaymentHandlers(bot);
  });

  it('registers pre_checkout_query handler', () => {
    expect(bot._handlers['pre_checkout_query']).toBeDefined();
  });

  it('registers message:successful_payment handler', () => {
    expect(bot._handlers['message:successful_payment']).toBeDefined();
  });

  it('pre_checkout_query handler answers OK', async () => {
    const ctx = {
      update: {
        pre_checkout_query: {
          id: 'pcq_1',
          invoice_payload: 'txn_42',
          total_amount: 750,
          currency: 'XTR',
          from: { id: 12345 },
        },
      },
      api: {},
    };
    await bot._handlers['pre_checkout_query'](ctx);
    expect(answerPreCheckout).toHaveBeenCalledWith(ctx.api, 'pcq_1', { ok: true });
  });

  it('successful_payment handler calls handleTelegramPayment', async () => {
    const ctx = {
      message: {
        from: { id: 12345 },
        successful_payment: {
          invoice_payload: 'txn_42',
          total_amount: 750,
          currency: 'XTR',
          telegram_payment_charge_id: 'tpc_abc',
        },
      },
    };
    await bot._handlers['message:successful_payment'](ctx);
    expect(handleTelegramPayment).toHaveBeenCalledWith(ctx.message, 42);
  });

  it('successful_payment does not throw when client not found', async () => {
    const { query } = await import('../lib/db.js');
    query.mockResolvedValueOnce({ rows: [] }); // client not found
    const ctx = {
      message: {
        from: { id: 99999 },
        successful_payment: {
          invoice_payload: 'txn_xx',
          total_amount: 100,
          currency: 'XTR',
          telegram_payment_charge_id: 'tpc_z',
        },
      },
    };
    await expect(bot._handlers['message:successful_payment'](ctx)).resolves.not.toThrow();
  });
});
