import 'dotenv/config';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import {
  createTransaction,
  getTransactionByPaymentId,
  getTransactionById,
  confirmTransaction,
  confirmTransactionById,
  failTransaction,
  failTransactionById,
} from './transactions.js';
import { query, closePool } from './db.js';

const TEST_CLIENT_TG_ID = 9998001n;
let clientDbId;

async function ensureClient() {
  const { rows } = await query(
    `INSERT INTO clients (telegram_user_id, business_connection_id)
     VALUES ($1, 'conn_txn_test')
     ON CONFLICT (telegram_user_id) DO UPDATE SET business_connection_id = EXCLUDED.business_connection_id
     RETURNING id`,
    [TEST_CLIENT_TG_ID],
  );
  return rows[0].id;
}

function paymentId(suffix) {
  return `test_txn_${Date.now()}_${suffix}`;
}

beforeEach(async () => {
  clientDbId = await ensureClient();
});

describe('createTransaction', () => {
  it('creates a pending transaction', async () => {
    const txn = await createTransaction({
      clientId: clientDbId,
      paymentId: paymentId('create'),
      method: 'nowpayments',
      amountEur: 9.99,
    });
    expect(txn.id).toBeDefined();
    expect(txn.status).toBe('pending');
    expect(parseFloat(txn.amount_eur)).toBe(9.99);
  });

  it('stores product_type and product_id', async () => {
    const txn = await createTransaction({
      clientId: clientDbId,
      paymentId: paymentId('product'),
      method: 'telegram_stars',
      amountEur: 14.99,
      productType: 'photos',
      productId: 'pack_basic',
    });
    expect(txn.product_type).toBe('photos');
    expect(txn.product_id).toBe('pack_basic');
  });
});

describe('getTransactionByPaymentId', () => {
  it('retrieves the transaction', async () => {
    const pid = paymentId('get');
    await createTransaction({ clientId: clientDbId, paymentId: pid, method: 'bizum', amountEur: 20 });
    const txn = await getTransactionByPaymentId(pid);
    expect(txn).not.toBeNull();
    expect(txn.payment_id).toBe(pid);
  });

  it('returns null for unknown payment_id', async () => {
    expect(await getTransactionByPaymentId('does_not_exist')).toBeNull();
  });
});

describe('confirmTransaction', () => {
  it('sets status to paid and increments client stats', async () => {
    const pid = paymentId('confirm');
    const txn = await createTransaction({ clientId: clientDbId, paymentId: pid, method: 'nowpayments', amountEur: 9.99 });

    const { rows: before } = await query('SELECT num_compras, total_gastado FROM clients WHERE id = $1', [clientDbId]);
    const prevCompras = parseInt(before[0].num_compras, 10);
    const prevGastado = parseFloat(before[0].total_gastado);

    const confirmed = await confirmTransaction(pid, { extra: 'meta' });
    expect(confirmed.status).toBe('paid');
    expect(confirmed.paid_at).not.toBeNull();

    const { rows: after } = await query('SELECT num_compras, total_gastado FROM clients WHERE id = $1', [clientDbId]);
    expect(parseInt(after[0].num_compras, 10)).toBe(prevCompras + 1);
    expect(parseFloat(after[0].total_gastado)).toBeCloseTo(prevGastado + 9.99, 2);
  });

  it('is idempotent — returns null on second confirm', async () => {
    const pid = paymentId('idem');
    await createTransaction({ clientId: clientDbId, paymentId: pid, method: 'bizum', amountEur: 5 });
    await confirmTransaction(pid);
    const second = await confirmTransaction(pid);
    expect(second).toBeNull();
  });

  it('returns null for unknown payment_id', async () => {
    expect(await confirmTransaction('no_such_id')).toBeNull();
  });
});

describe('confirmTransactionById', () => {
  it('confirms by integer DB id', async () => {
    const pid = paymentId('byid');
    const created = await createTransaction({ clientId: clientDbId, paymentId: pid, method: 'telegram_stars', amountEur: 7.5 });
    const confirmed = await confirmTransactionById(created.id);
    expect(confirmed.status).toBe('paid');
  });
});

describe('failTransaction', () => {
  it('sets status to failed', async () => {
    const pid = paymentId('fail');
    await createTransaction({ clientId: clientDbId, paymentId: pid, method: 'nowpayments', amountEur: 9.99 });
    const failed = await failTransaction(pid, 'expired');
    expect(failed.status).toBe('failed');
  });

  it('returns null for unknown payment_id', async () => {
    expect(await failTransaction('no_such')).toBeNull();
  });
});

describe('failTransactionById', () => {
  it('fails by integer DB id', async () => {
    const pid = paymentId('failbyid');
    const created = await createTransaction({ clientId: clientDbId, paymentId: pid, method: 'bizum', amountEur: 15 });
    const failed = await failTransactionById(created.id, 'denied_by_partner');
    expect(failed.status).toBe('failed');
    expect(failed.metadata.failure_reason).toBe('denied_by_partner');
  });
});

afterAll(() => closePool());
