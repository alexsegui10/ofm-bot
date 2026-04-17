import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleNowPaymentsWebhook,
  handlePayPalWebhook,
  handleTelegramPayment,
  handleBizumConfirmation,
  initiateBizumPayment,
  confirmBizumByClient,
} from './payment-verifier.js';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../lib/payments/nowpayments.js', () => ({
  verifyIpnSignature: vi.fn(),
  PAID_STATUSES: new Set(['finished', 'confirmed', 'partially_paid']),
  FAILED_STATUSES: new Set(['failed', 'expired', 'refunded']),
}));
vi.mock('../lib/payments/paypal.js', () => ({
  isEnabled: vi.fn(() => false),
}));
vi.mock('../lib/payments/telegram-stars.js', () => ({
  parseSuccessfulPayment: vi.fn(),
}));
vi.mock('../lib/payments/bizum.js', () => ({
  createPendingBizum: vi.fn(),
  getPendingBizum: vi.fn(),
  getPendingUnnotifiedBizum: vi.fn(),
  getMostRecentPendingBizum: vi.fn(),
  notifyPartner: vi.fn().mockResolvedValue({}),
  confirmBizum: vi.fn(),
  denyBizum: vi.fn(),
  autoApproveBizum: vi.fn(),
  shouldAutoApprove: vi.fn(() => false),
}));
vi.mock('../lib/payments/bizum-timer.js', () => ({
  startBizumTimer: vi.fn(),
  cancelBizumTimer: vi.fn(),
}));
vi.mock('./sexting-conductor.js', () => ({
  startSextingSession: vi.fn().mockResolvedValue({ sessionId: 99, playlistId: 'calenton_rapido' }),
  resolvePlaylistId: vi.fn().mockReturnValue('calenton_rapido'),
}));
vi.mock('../lib/transactions.js', () => ({
  createTransaction: vi.fn(),
  confirmTransaction: vi.fn(),
  confirmTransactionById: vi.fn(),
  failTransaction: vi.fn(),
  failTransactionById: vi.fn(),
}));
vi.mock('../lib/db.js', () => ({
  query: vi.fn(),
}));
vi.mock('../lib/telegram.js', () => ({
  sendMessage: vi.fn().mockResolvedValue({}),
}));

import { verifyIpnSignature } from '../lib/payments/nowpayments.js';
import { parseSuccessfulPayment } from '../lib/payments/telegram-stars.js';
import {
  getPendingBizum, getPendingUnnotifiedBizum, getMostRecentPendingBizum,
  confirmBizum, denyBizum, notifyPartner, createPendingBizum, shouldAutoApprove,
} from '../lib/payments/bizum.js';
import { startBizumTimer, cancelBizumTimer } from '../lib/payments/bizum-timer.js';
import { confirmTransaction, confirmTransactionById, failTransaction, failTransactionById, createTransaction } from '../lib/transactions.js';
import { query } from '../lib/db.js';
import { sendMessage } from '../lib/telegram.js';

function mockRes() {
  const res = { status: vi.fn(), json: vi.fn(), sendStatus: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}
function mockReq(body, headers = {}) {
  return { body, headers, ip: '127.0.0.1' };
}

// ─── handleNowPaymentsWebhook ─────────────────────────────────────────────────

describe('handleNowPaymentsWebhook', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when signature is invalid', async () => {
    verifyIpnSignature.mockReturnValue(false);
    const res = mockRes();
    await handleNowPaymentsWebhook(mockReq({ order_id: 'txn_1', payment_status: 'finished' }, { 'x-nowpayments-sig': 'bad' }), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('calls confirmTransaction on finished status', async () => {
    verifyIpnSignature.mockReturnValue(true);
    confirmTransaction.mockResolvedValue({ id: 1, client_id: 5 });
    const res = mockRes();
    await handleNowPaymentsWebhook(mockReq({ payment_id: 'np_1', payment_status: 'finished', order_id: 'txn_1' }, { 'x-nowpayments-sig': 'ok' }), res);
    expect(confirmTransaction).toHaveBeenCalledWith('txn_1', expect.objectContaining({ nowpayments_payment_id: 'np_1' }));
    expect(res.sendStatus).toHaveBeenCalledWith(200);
  });

  it('calls failTransaction on expired status', async () => {
    verifyIpnSignature.mockReturnValue(true);
    failTransaction.mockResolvedValue({ id: 1 });
    const res = mockRes();
    await handleNowPaymentsWebhook(mockReq({ payment_id: 'np_2', payment_status: 'expired', order_id: 'txn_2' }, { 'x-nowpayments-sig': 'ok' }), res);
    expect(failTransaction).toHaveBeenCalledWith('txn_2', 'expired');
  });

  it('returns 200 for intermediate status without DB changes', async () => {
    verifyIpnSignature.mockReturnValue(true);
    const res = mockRes();
    await handleNowPaymentsWebhook(mockReq({ payment_id: 'np_3', payment_status: 'waiting', order_id: 'txn_3' }, { 'x-nowpayments-sig': 'ok' }), res);
    expect(confirmTransaction).not.toHaveBeenCalled();
    expect(res.sendStatus).toHaveBeenCalledWith(200);
  });
});

// ─── handlePayPalWebhook ──────────────────────────────────────────────────────

describe('handlePayPalWebhook', () => {
  it('returns 200 when PayPal is disabled', async () => {
    const res = mockRes();
    await handlePayPalWebhook(mockReq({}), res);
    expect(res.sendStatus).toHaveBeenCalledWith(200);
  });
});

// ─── handleTelegramPayment ────────────────────────────────────────────────────

describe('handleTelegramPayment', () => {
  beforeEach(() => vi.clearAllMocks());

  it('confirms transaction from successful_payment payload', async () => {
    parseSuccessfulPayment.mockReturnValue({ payload: 'txn_5', stars: 750, currency: 'XTR', telegramChargeId: 'tpc_x' });
    confirmTransaction.mockResolvedValue({ id: 5, client_id: 10 });
    const result = await handleTelegramPayment({ successful_payment: {} }, 10);
    expect(confirmTransaction).toHaveBeenCalledWith('txn_5', expect.objectContaining({ stars_paid: 750 }));
    expect(result.id).toBe(5);
  });

  it('returns null when no successful_payment', async () => {
    parseSuccessfulPayment.mockReturnValue(null);
    expect(await handleTelegramPayment({ text: 'hola' }, 10)).toBeNull();
  });
});

// ─── initiateBizumPayment ─────────────────────────────────────────────────────

describe('initiateBizumPayment', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates transaction + pending bizum and returns instructions message', async () => {
    createTransaction.mockResolvedValue({ id: 10 });
    createPendingBizum.mockResolvedValue({ id: 3, amount: '15.00' });

    const result = await initiateBizumPayment({ clientId: 1, amountEur: 15 });

    expect(createTransaction).toHaveBeenCalledWith(expect.objectContaining({ method: 'bizum', amountEur: 15 }));
    expect(createPendingBizum).toHaveBeenCalledWith(expect.objectContaining({ clientId: 1, transactionId: 10 }));
    expect(result.bizumId).toBe(3);
    expect(result.message).toContain('15€');
    expect(result.message).toContain('+34 662 112 420');
  });
});

// ─── confirmBizumByClient ─────────────────────────────────────────────────────

describe('confirmBizumByClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldAutoApprove.mockReturnValue(false);
  });

  it('returns null when no unnotified pending bizum exists', async () => {
    getPendingUnnotifiedBizum.mockResolvedValue(null);
    const result = await confirmBizumByClient(1, 12345, 'conn_x', {});
    expect(result).toBeNull();
    expect(notifyPartner).not.toHaveBeenCalled();
  });

  it('notifies partner and starts timer when unnotified bizum found', async () => {
    getPendingUnnotifiedBizum.mockResolvedValue({ id: 5, amount: '20.00' });
    const result = await confirmBizumByClient(1, 12345, 'conn_x', { username: 'fan', num_compras: 0 });
    expect(notifyPartner).toHaveBeenCalledWith(expect.objectContaining({ bizumId: 5, amountEur: 20 }));
    expect(startBizumTimer).toHaveBeenCalledWith(5, expect.objectContaining({ chatId: 12345 }));
    expect(result).toContain('ahora lo miro');
  });

  it('returns enthusiastic message when auto-approve conditions are met', async () => {
    getPendingUnnotifiedBizum.mockResolvedValue({ id: 6, amount: '10.00' });
    shouldAutoApprove.mockReturnValue(true);
    const result = await confirmBizumByClient(1, 12345, 'conn_x', { num_compras: 3 });
    expect(result).toContain('ahora lo miro');
  });
});

// ─── handleBizumConfirmation ──────────────────────────────────────────────────

describe('handleBizumConfirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query.mockResolvedValue({ rows: [{ telegram_user_id: 99999n, business_connection_id: 'conn_x' }] });
    confirmBizum.mockResolvedValue({ id: 7, status: 'confirmed' });
    denyBizum.mockResolvedValue({ id: 8, status: 'denied' });
    confirmTransactionById.mockResolvedValue({ id: 3, status: 'paid' });
    failTransactionById.mockResolvedValue({ id: 4, status: 'failed' });
  });

  it('returns null for non-command messages', async () => {
    expect(await handleBizumConfirmation('hola qué tal')).toBeNull();
  });

  it('confirms via explicit /confirmar command', async () => {
    getPendingBizum.mockResolvedValue({ id: 7, status: 'pending', transaction_id: 3, client_id: 1, created_at: new Date().toISOString() });
    const result = await handleBizumConfirmation('/confirmar 7');
    expect(result.action).toBe('confirmed');
    expect(cancelBizumTimer).toHaveBeenCalledWith(7);
    expect(confirmBizum).toHaveBeenCalledWith(7);
  });

  it('denies via explicit /denegar command', async () => {
    getPendingBizum.mockResolvedValue({ id: 8, status: 'pending', transaction_id: 4, client_id: 1, created_at: new Date().toISOString() });
    const result = await handleBizumConfirmation('/denegar 8');
    expect(result.action).toBe('denied');
    expect(cancelBizumTimer).toHaveBeenCalledWith(8);
    expect(denyBizum).toHaveBeenCalledWith(8, 'denied_by_partner');
  });

  it('confirms via natural language "ok"', async () => {
    getMostRecentPendingBizum.mockResolvedValue({ id: 7, status: 'pending', transaction_id: null, client_id: 1 });
    const result = await handleBizumConfirmation('ok');
    expect(result.action).toBe('confirmed');
    expect(getMostRecentPendingBizum).toHaveBeenCalled();
  });

  it('confirms via natural language "sí"', async () => {
    getMostRecentPendingBizum.mockResolvedValue({ id: 7, status: 'pending', transaction_id: null, client_id: 1 });
    const result = await handleBizumConfirmation('sí');
    expect(result.action).toBe('confirmed');
  });

  it('confirms via natural language "llegó"', async () => {
    getMostRecentPendingBizum.mockResolvedValue({ id: 7, status: 'pending', transaction_id: null, client_id: 1 });
    const result = await handleBizumConfirmation('llegó');
    expect(result.action).toBe('confirmed');
  });

  it('denies via natural language "no ha llegado"', async () => {
    getMostRecentPendingBizum.mockResolvedValue({ id: 8, status: 'pending', transaction_id: null, client_id: 1 });
    const result = await handleBizumConfirmation('no ha llegado');
    expect(result.action).toBe('denied');
  });

  it('denies via natural language "no"', async () => {
    getMostRecentPendingBizum.mockResolvedValue({ id: 8, status: 'pending', transaction_id: null, client_id: 1 });
    const result = await handleBizumConfirmation('no');
    expect(result.action).toBe('denied');
  });

  it('returns not_found when no pending record exists', async () => {
    getPendingBizum.mockResolvedValue(null);
    expect((await handleBizumConfirmation('/confirmar 999')).action).toBe('not_found');
  });

  it('returns already_processed when status is not pending', async () => {
    getPendingBizum.mockResolvedValue({ id: 5, status: 'confirmed' });
    expect((await handleBizumConfirmation('/confirmar 5')).action).toBe('already_processed');
  });

  it('sends message to client on confirm', async () => {
    getPendingBizum.mockResolvedValue({ id: 7, status: 'pending', transaction_id: null, client_id: 1 });
    await handleBizumConfirmation('/confirmar 7');
    expect(sendMessage).toHaveBeenCalledWith('conn_x', 99999, expect.stringContaining('confirmado'));
  });

  it('sends message to client on deny', async () => {
    getPendingBizum.mockResolvedValue({ id: 8, status: 'pending', transaction_id: null, client_id: 1 });
    await handleBizumConfirmation('/denegar 8');
    expect(sendMessage).toHaveBeenCalledWith('conn_x', 99999, expect.stringContaining('llegado'));
  });
});
