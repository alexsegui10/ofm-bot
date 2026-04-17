import 'dotenv/config';
import { describe, it, expect, afterAll } from 'vitest';
import { query, runMigrations, closePool } from './db.js';

describe('FASE 1 — Database', () => {
  it('connects to Postgres and runs a simple query', async () => {
    const { rows } = await query('SELECT 1 AS n');
    expect(rows[0].n).toBe(1);
  });

  it('runMigrations applies all migrations without error', async () => {
    await expect(runMigrations()).resolves.not.toThrow();
  });

  it('_migrations table exists after runMigrations', async () => {
    const { rows } = await query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename='_migrations'"
    );
    expect(rows.length).toBe(1);
  });

  it('all 8 domain tables exist', async () => {
    const expectedTables = [
      'clients',
      'conversations',
      'transactions',
      'media',
      'quality_gate_failures',
      'pending_payments',
      'handoff_sessions',
      'pending_bizum_confirmations',
    ];
    const { rows } = await query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public'"
    );
    const existing = rows.map((r) => r.tablename);
    for (const t of expectedTables) {
      expect(existing, `table ${t} should exist`).toContain(t);
    }
  });

  afterAll(() => closePool());
});
