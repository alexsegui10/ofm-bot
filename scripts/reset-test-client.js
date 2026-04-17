#!/usr/bin/env node
/**
 * scripts/reset-test-client.js
 *
 * Borra todos los datos de los clientes de test para poder
 * repetir pruebas desde cero.
 *
 * Usage:
 *   node scripts/reset-test-client.js
 */

import 'dotenv/config';
import pg from 'pg';

const TEST_TELEGRAM_IDS = [8246961433, 5516282183];

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function resetTestClients() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Resolve internal client IDs for all test telegram users
    const { rows: clientRows } = await client.query(
      `SELECT id, telegram_user_id FROM clients WHERE telegram_user_id = ANY($1::bigint[])`,
      [TEST_TELEGRAM_IDS],
    );

    if (clientRows.length === 0) {
      console.log('No test clients found in DB — nothing to reset.');
      await client.query('ROLLBACK');
      return;
    }

    const clientIds = clientRows.map((r) => r.id);
    console.log(`Found ${clientIds.length} test client(s): ${clientRows.map((r) => `id=${r.id} (tg=${r.telegram_user_id})`).join(', ')}`);

    const tables = [
      'conversations',
      'transactions',
      'sexting_sessions',
      'quality_gate_failures',
      'pending_payments',
      'handoff_sessions',
      'pending_bizum_confirmations',
    ];

    for (const table of tables) {
      const res = await client.query(
        `DELETE FROM ${table} WHERE client_id = ANY($1::int[])`,
        [clientIds],
      );
      console.log(`  ${table}: ${res.rowCount} row(s) deleted`);
    }

    const clientRes = await client.query(
      `DELETE FROM clients WHERE id = ANY($1::int[])`,
      [clientIds],
    );
    console.log(`  clients: ${clientRes.rowCount} row(s) deleted`);

    await client.query('COMMIT');
    console.log(`\nReset ${clientIds.length} test client(s) complete.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Reset failed, transaction rolled back:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

resetTestClients();
