import 'dotenv/config';
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import {
  shouldAutoApprove,
  isExpired,
  createPendingBizum,
  getPendingBizum,
  confirmBizum,
  denyBizum,
  autoApproveBizum,
  notifyPartner,
  BIZUM_EXPIRY_MINUTES,
  AUTO_APPROVE_MIN_PURCHASES,
  AUTO_APPROVE_MAX_AMOUNT_EUR,
} from './bizum.js';
import { query, closePool } from '../db.js';

vi.mock('../twilio.js', () => ({
  sendWhatsAppToPartner: vi.fn().mockResolvedValue({ sid: 'SM_test' }),
}));

const TEST_CLIENT_ID = 9999001;

// ─── Pure function tests (no DB) ─────────────────────────────────────────────

describe('shouldAutoApprove', () => {
  it('true when num_compras >= 2 and amount <= 50', () => {
    expect(shouldAutoApprove({ num_compras: 2 }, 50)).toBe(true);
    expect(shouldAutoApprove({ num_compras: 5 }, 49.99)).toBe(true);
  });

  it('false when num_compras < 2', () => {
    expect(shouldAutoApprove({ num_compras: 1 }, 10)).toBe(false);
    expect(shouldAutoApprove({ num_compras: 0 }, 10)).toBe(false);
  });

  it('false when amount > 50', () => {
    expect(shouldAutoApprove({ num_compras: 3 }, 50.01)).toBe(false);
  });

  it('false when client is null', () => {
    expect(shouldAutoApprove(null, 10)).toBe(false);
  });

  it(`boundary: exactly ${AUTO_APPROVE_MIN_PURCHASES} purchases and ${AUTO_APPROVE_MAX_AMOUNT_EUR}€ → true`, () => {
    expect(shouldAutoApprove({ num_compras: AUTO_APPROVE_MIN_PURCHASES }, AUTO_APPROVE_MAX_AMOUNT_EUR)).toBe(true);
  });
});

describe('isExpired', () => {
  it('false for a freshly created record', () => {
    const record = { created_at: new Date().toISOString() };
    expect(isExpired(record)).toBe(false);
  });

  it('true when older than BIZUM_EXPIRY_MINUTES', () => {
    const old = new Date(Date.now() - (BIZUM_EXPIRY_MINUTES + 1) * 60 * 1000);
    expect(isExpired({ created_at: old.toISOString() })).toBe(true);
  });

  it('false just before expiry boundary', () => {
    const almost = new Date(Date.now() - (BIZUM_EXPIRY_MINUTES * 60 * 1000 - 5000));
    expect(isExpired({ created_at: almost.toISOString() })).toBe(false);
  });

  it('accepts a custom now parameter', () => {
    const createdAt = new Date('2025-01-01T12:00:00Z');
    const future = new Date('2025-01-01T12:11:00Z'); // 11 min later → expired
    expect(isExpired({ created_at: createdAt }, future)).toBe(true);
  });
});

// ─── DB integration tests ─────────────────────────────────────────────────────

async function ensureTestClient() {
  const { rows } = await query(
    `INSERT INTO clients (telegram_user_id, business_connection_id)
     VALUES ($1, 'conn_bizum_test')
     ON CONFLICT (telegram_user_id) DO UPDATE SET business_connection_id = EXCLUDED.business_connection_id
     RETURNING id`,
    [TEST_CLIENT_ID],
  );
  return rows[0].id;
}

describe('createPendingBizum / getPendingBizum (DB)', () => {
  let clientDbId;

  beforeEach(async () => {
    clientDbId = await ensureTestClient();
    await query('DELETE FROM pending_bizum_confirmations WHERE client_id = $1', [clientDbId]);
  });

  it('creates a record with status pending', async () => {
    const record = await createPendingBizum({ clientId: clientDbId, transactionId: null, amountEur: 15 });
    expect(record.id).toBeDefined();
    expect(record.status).toBe('pending');
    expect(parseFloat(record.amount)).toBe(15);
  });

  it('retrieves the record by id', async () => {
    const created = await createPendingBizum({ clientId: clientDbId, transactionId: null, amountEur: 25 });
    const fetched = await getPendingBizum(created.id);
    expect(fetched.id).toBe(created.id);
    expect(parseFloat(fetched.amount)).toBe(25);
  });

  it('returns null for non-existent id', async () => {
    expect(await getPendingBizum(999999999)).toBeNull();
  });
});

describe('confirmBizum / denyBizum / autoApproveBizum (DB)', () => {
  let clientDbId;

  beforeEach(async () => {
    clientDbId = await ensureTestClient();
    await query('DELETE FROM pending_bizum_confirmations WHERE client_id = $1', [clientDbId]);
  });

  it('confirmBizum sets status to confirmed', async () => {
    const { id } = await createPendingBizum({ clientId: clientDbId, transactionId: null, amountEur: 10 });
    const result = await confirmBizum(id);
    expect(result.status).toBe('confirmed');
  });

  it('denyBizum sets status to denied', async () => {
    const { id } = await createPendingBizum({ clientId: clientDbId, transactionId: null, amountEur: 10 });
    const result = await denyBizum(id, 'denied_by_partner');
    expect(result.status).toBe('denied');
    expect(result.partner_response).toBe('denied_by_partner');
  });

  it('autoApproveBizum sets status to auto_approved', async () => {
    const { id } = await createPendingBizum({ clientId: clientDbId, transactionId: null, amountEur: 10 });
    const result = await autoApproveBizum(id);
    expect(result.status).toBe('auto_approved');
  });

  it('confirmBizum is idempotent — returns null if already confirmed', async () => {
    const { id } = await createPendingBizum({ clientId: clientDbId, transactionId: null, amountEur: 10 });
    await confirmBizum(id);
    const second = await confirmBizum(id);
    expect(second).toBeNull();
  });
});

describe('notifyPartner (DB)', () => {
  let clientDbId;

  beforeEach(async () => {
    clientDbId = await ensureTestClient();
    await query('DELETE FROM pending_bizum_confirmations WHERE client_id = $1', [clientDbId]);
  });

  it('calls sendWhatsAppToPartner and sets partner_notified_at', async () => {
    const { sendWhatsAppToPartner } = await import('../twilio.js');
    const { id } = await createPendingBizum({ clientId: clientDbId, transactionId: null, amountEur: 20 });
    await notifyPartner({ bizumId: id, clientId: clientDbId, amountEur: 20, clientUsername: 'testfan' });

    expect(sendWhatsAppToPartner).toHaveBeenCalledWith(expect.stringContaining(`#${id}`));
    expect(sendWhatsAppToPartner).toHaveBeenCalledWith(expect.stringContaining('20€'));

    const updated = await getPendingBizum(id);
    expect(updated.partner_notified_at).not.toBeNull();
  });
});

afterAll(() => closePool());
