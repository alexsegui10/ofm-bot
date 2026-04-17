import { describe, it, expect, vi } from 'vitest';
import {
  eurToStars,
  sendStarsInvoice,
  answerPreCheckout,
  parseSuccessfulPayment,
  XTR_PER_EUR,
} from './telegram-stars.js';

// ─── eurToStars ───────────────────────────────────────────────────────────────

describe('eurToStars', () => {
  it(`converts at ${XTR_PER_EUR} XTR/EUR`, () => {
    expect(eurToStars(1)).toBe(XTR_PER_EUR);
  });

  it('rounds up fractional stars', () => {
    // Any non-integer result should be ceiled
    const stars = eurToStars(0.01);
    expect(stars).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(stars)).toBe(true);
  });

  it('returns correct stars for 9.99€', () => {
    expect(eurToStars(9.99)).toBe(Math.ceil(9.99 * XTR_PER_EUR));
  });
});

// ─── parseSuccessfulPayment ───────────────────────────────────────────────────

describe('parseSuccessfulPayment', () => {
  it('extracts payment fields from a successful_payment message', () => {
    const message = {
      successful_payment: {
        invoice_payload: 'txn_42',
        total_amount: 750,
        currency: 'XTR',
        telegram_payment_charge_id: 'tpc_abc',
        provider_payment_charge_id: null,
      },
    };
    const result = parseSuccessfulPayment(message);
    expect(result.payload).toBe('txn_42');
    expect(result.stars).toBe(750);
    expect(result.currency).toBe('XTR');
    expect(result.telegramChargeId).toBe('tpc_abc');
    expect(result.providerChargeId).toBeNull();
  });

  it('returns null when message has no successful_payment', () => {
    expect(parseSuccessfulPayment({ text: 'hola' })).toBeNull();
    expect(parseSuccessfulPayment(null)).toBeNull();
    expect(parseSuccessfulPayment({})).toBeNull();
  });
});

// ─── sendStarsInvoice ─────────────────────────────────────────────────────────

describe('sendStarsInvoice', () => {
  it('calls api.sendInvoice with XTR currency and correct stars', async () => {
    const mockApi = { sendInvoice: vi.fn().mockResolvedValue({ message_id: 1 }) };
    await sendStarsInvoice(mockApi, 12345, {
      title: 'Pack fotos',
      description: 'Fotos exclusivas',
      amountEur: 9.99,
      payload: 'txn_1',
    });

    const [chatId, title, , , currency, prices] = mockApi.sendInvoice.mock.calls[0];
    expect(chatId).toBe(12345);
    expect(title).toBe('Pack fotos');
    expect(currency).toBe('XTR');
    expect(prices[0].amount).toBe(eurToStars(9.99));
  });
});

// ─── answerPreCheckout ────────────────────────────────────────────────────────

describe('answerPreCheckout', () => {
  it('calls api.answerPreCheckoutQuery with ok=true by default', async () => {
    const mockApi = { answerPreCheckoutQuery: vi.fn().mockResolvedValue(true) };
    await answerPreCheckout(mockApi, 'pcq_abc');
    expect(mockApi.answerPreCheckoutQuery).toHaveBeenCalledWith('pcq_abc', true, expect.any(Object));
  });

  it('passes ok=false and errorMessage when provided', async () => {
    const mockApi = { answerPreCheckoutQuery: vi.fn().mockResolvedValue(true) };
    await answerPreCheckout(mockApi, 'pcq_abc', { ok: false, errorMessage: 'no stock' });
    expect(mockApi.answerPreCheckoutQuery).toHaveBeenCalledWith('pcq_abc', false, { error_message: 'no stock' });
  });
});
