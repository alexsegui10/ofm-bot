#!/usr/bin/env node
/**
 * scripts/reset-test-client.js
 *
 * Borra todos los datos de los clientes de test para poder
 * repetir pruebas desde cero.
 *
 * Se respetan dos grupos de IDs:
 *   - REAL_TEST_IDS: los Telegram reales usados en pruebas manuales desde
 *     Telegram (se borran al ejecutar este script para poder repetir).
 *   - TEST_CHAT_IDS: 900000001..900000050, IDs ficticios que usa el loop
 *     automático (`scripts/auto-iterate.js`, uno por escenario).
 *
 * Usage:
 *   node scripts/reset-test-client.js              # resetea todos (real + auto)
 *   node scripts/reset-test-client.js --auto-only  # solo los 900000XXX
 *   node scripts/reset-test-client.js --id=900000003  # solo uno concreto
 */

import 'dotenv/config';
import pg from 'pg';

const REAL_TEST_IDS = [8246961433, 5516282183];

// 900000001..900000050 — reservados para escenarios automáticos.
// Se deja margen (50) por si se añaden escenarios en el futuro.
export const TEST_CHAT_IDS = Array.from({ length: 50 }, (_, i) => 900000001 + i);

function parseArgs() {
  const args = process.argv.slice(2);
  const single = args.find((a) => a.startsWith('--id='));
  if (single) {
    const id = parseInt(single.split('=')[1], 10);
    if (!Number.isFinite(id)) throw new Error(`invalid --id value`);
    return { ids: [id] };
  }
  if (args.includes('--auto-only')) {
    return { ids: TEST_CHAT_IDS };
  }
  return { ids: [...REAL_TEST_IDS, ...TEST_CHAT_IDS] };
}

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function resetTestClients() {
  const { ids: targetIds } = parseArgs();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: clientRows } = await client.query(
      `SELECT id, telegram_user_id FROM clients WHERE telegram_user_id = ANY($1::bigint[])`,
      [targetIds],
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

// Run only when invoked as a script (not when imported by other modules)
const isMain = import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` ||
               import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  resetTestClients();
}
