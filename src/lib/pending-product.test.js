import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the db module before importing the SUT.
const queryMock = vi.fn();
vi.mock('./db.js', () => ({
  query: (...args) => queryMock(...args),
}));

const {
  setPendingProduct,
  getPendingProduct,
  clearPendingProduct,
  PENDING_TTL_MS,
} = await import('./pending-product.js');

beforeEach(() => {
  queryMock.mockReset();
});

describe('setPendingProduct', () => {
  it('runs an UPDATE with productId + amountEur', async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 1 });
    await setPendingProduct(42, 'v_001', 20);
    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/UPDATE clients/);
    expect(sql).toMatch(/pending_product_id/);
    expect(sql).toMatch(/pending_amount_eur/);
    expect(sql).toMatch(/pending_set_at\s*=\s*NOW\(\)/);
    expect(params).toEqual([42, 'v_001', 20]);
  });

  it('throws when clientId is missing', async () => {
    await expect(setPendingProduct(null, 'v_001', 20)).rejects.toThrow(/clientId required/);
  });

  it('throws when productId is missing', async () => {
    await expect(setPendingProduct(1, '', 20)).rejects.toThrow(/productId required/);
  });

  it('throws when amountEur is not a positive number', async () => {
    await expect(setPendingProduct(1, 'v_001', 0)).rejects.toThrow(/amountEur must be a positive number/);
    await expect(setPendingProduct(1, 'v_001', -3)).rejects.toThrow(/amountEur must be a positive number/);
    await expect(setPendingProduct(1, 'v_001', 'free')).rejects.toThrow(/amountEur must be a positive number/);
  });
});

describe('getPendingProduct', () => {
  it('returns null when client row is empty', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const result = await getPendingProduct(42);
    expect(result).toBeNull();
  });

  it('returns null when pending fields are NULL', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{
      pending_product_id: null,
      pending_amount_eur: null,
      pending_set_at:     null,
    }] });
    const result = await getPendingProduct(42);
    expect(result).toBeNull();
  });

  it('returns the pending product when within TTL', async () => {
    const setAt = new Date(Date.now() - 5 * 60 * 1000); // 5 min ago
    queryMock.mockResolvedValueOnce({ rows: [{
      pending_product_id: 'v_001',
      pending_amount_eur: '20.00',
      pending_set_at:     setAt.toISOString(),
    }] });
    const result = await getPendingProduct(42);
    expect(result).not.toBeNull();
    expect(result.productId).toBe('v_001');
    expect(result.amountEur).toBe(20);
    expect(result.setAt).toBeInstanceOf(Date);
  });

  it('returns null and clears the pending when TTL expired', async () => {
    const setAt = new Date(Date.now() - PENDING_TTL_MS - 1000); // > 30 min ago
    queryMock
      .mockResolvedValueOnce({ rows: [{
        pending_product_id: 'v_001',
        pending_amount_eur: '20.00',
        pending_set_at:     setAt.toISOString(),
      }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // clear UPDATE
    const result = await getPendingProduct(42);
    expect(result).toBeNull();
    // Wait one microtask so the fire-and-forget cleanup runs.
    await new Promise((r) => setImmediate(r));
    // Should have called twice: SELECT then UPDATE … = NULL.
    expect(queryMock).toHaveBeenCalledTimes(2);
    const [secondSql] = queryMock.mock.calls[1];
    expect(secondSql).toMatch(/UPDATE clients/);
    expect(secondSql).toMatch(/= NULL/);
  });

  it('returns null when clientId is missing', async () => {
    const result = await getPendingProduct(null);
    expect(result).toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe('clearPendingProduct', () => {
  it('runs an UPDATE that nulls all 3 columns', async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 1 });
    await clearPendingProduct(42);
    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/UPDATE clients/);
    expect(sql).toMatch(/pending_product_id\s*=\s*NULL/);
    expect(sql).toMatch(/pending_amount_eur\s*=\s*NULL/);
    expect(sql).toMatch(/pending_set_at\s*=\s*NULL/);
    expect(params).toEqual([42]);
  });

  it('no-ops when clientId is falsy', async () => {
    await clearPendingProduct(null);
    expect(queryMock).not.toHaveBeenCalled();
  });
});
