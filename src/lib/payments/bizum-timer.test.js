import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  startBizumTimer,
  cancelBizumTimer,
  pendingTimerCount,
  clearAllBizumTimers,
} from './bizum-timer.js';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../telegram.js', () => ({
  sendMessage: vi.fn().mockResolvedValue({}),
}));
vi.mock('../twilio.js', () => ({
  sendWhatsAppToPartner: vi.fn().mockResolvedValue({}),
}));
vi.mock('../db.js', () => ({
  query: vi.fn(),
}));
vi.mock('./bizum.js', () => ({
  shouldAutoApprove: vi.fn(),
  getPendingBizum: vi.fn(),
  autoApproveBizum: vi.fn().mockResolvedValue({}),
  BIZUM_EXPIRY_MINUTES: 10,
}));
vi.mock('../transactions.js', () => ({
  confirmTransactionById: vi.fn().mockResolvedValue({}),
}));

import { sendMessage } from '../telegram.js';
import { sendWhatsAppToPartner } from '../twilio.js';
import { query } from '../db.js';
import { shouldAutoApprove, getPendingBizum } from './bizum.js';

const CTX = {
  clientId: 1,
  chatId: 99999,
  businessConnectionId: 'conn_test',
  amountEur: 15,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  clearAllBizumTimers();
});

afterEach(() => {
  clearAllBizumTimers();
  vi.useRealTimers();
});

// ─── startBizumTimer / cancelBizumTimer ───────────────────────────────────────

describe('startBizumTimer', () => {
  it('increments pendingTimerCount', () => {
    startBizumTimer(1, CTX);
    expect(pendingTimerCount()).toBe(1);
  });

  it('replaces an existing timer for the same bizumId', () => {
    startBizumTimer(1, CTX);
    startBizumTimer(1, CTX);
    expect(pendingTimerCount()).toBe(1);
  });

  it('supports multiple distinct bizumIds', () => {
    startBizumTimer(1, CTX);
    startBizumTimer(2, CTX);
    expect(pendingTimerCount()).toBe(2);
  });
});

describe('cancelBizumTimer', () => {
  it('removes the timer and decrements count', () => {
    startBizumTimer(5, CTX);
    cancelBizumTimer(5);
    expect(pendingTimerCount()).toBe(0);
  });

  it('is a no-op when timer does not exist', () => {
    expect(() => cancelBizumTimer(999)).not.toThrow();
  });
});

// ─── Auto-approve path ────────────────────────────────────────────────────────

describe('timer fires — auto-approve path', () => {
  it('auto-approves and notifies partner + client when conditions met', async () => {
    getPendingBizum.mockResolvedValue({ id: 7, status: 'pending', transaction_id: 3 });
    query.mockResolvedValue({ rows: [{ id: 1, username: 'testfan', num_compras: 3 }] });
    shouldAutoApprove.mockReturnValue(true);

    startBizumTimer(7, CTX);
    await vi.runAllTimersAsync();

    expect(sendWhatsAppToPartner).toHaveBeenCalledWith(expect.stringContaining('AUTO-APROBADO'));
    expect(sendMessage).toHaveBeenCalledWith(
      CTX.businessConnectionId,
      CTX.chatId,
      expect.stringContaining('confirmado'),
    );
    expect(pendingTimerCount()).toBe(0);
  });
});

// ─── No-auto-approve path ─────────────────────────────────────────────────────

describe('timer fires — delay message path', () => {
  it('messages client to wait when auto-approve conditions not met', async () => {
    getPendingBizum.mockResolvedValue({ id: 8, status: 'pending', transaction_id: null });
    query.mockResolvedValue({ rows: [{ id: 1, num_compras: 0 }] });
    shouldAutoApprove.mockReturnValue(false);

    startBizumTimer(8, CTX);
    await vi.runAllTimersAsync();

    expect(sendMessage).toHaveBeenCalledWith(
      CTX.businessConnectionId,
      CTX.chatId,
      expect.stringContaining('compañero'),
    );
    expect(sendWhatsAppToPartner).not.toHaveBeenCalled();
  });
});

// ─── Already-processed guard ──────────────────────────────────────────────────

describe('timer fires — already processed', () => {
  it('does nothing when bizum was already confirmed before timer fired', async () => {
    getPendingBizum.mockResolvedValue({ id: 9, status: 'confirmed', transaction_id: null });
    query.mockResolvedValue({ rows: [{ id: 1, num_compras: 5 }] });

    startBizumTimer(9, CTX);
    await vi.runAllTimersAsync();

    expect(sendMessage).not.toHaveBeenCalled();
    expect(sendWhatsAppToPartner).not.toHaveBeenCalled();
  });

  it('does nothing when bizum record not found', async () => {
    getPendingBizum.mockResolvedValue(null);
    startBizumTimer(10, CTX);
    await vi.runAllTimersAsync();
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
