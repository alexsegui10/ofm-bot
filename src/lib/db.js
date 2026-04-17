import pg from 'pg';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { env } from '../config/env.js';
import { agentLogger } from './logger.js';

const { Pool } = pg;
const log = agentLogger('db');

let pool;

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    pool.on('error', (err) => {
      log.error({ err }, 'postgres pool error');
    });
  }
  return pool;
}

/**
 * Run a parameterized query. Logs duration and row count at debug level.
 */
export async function query(text, params) {
  const start = Date.now();
  try {
    const result = await getPool().query(text, params);
    log.debug({ duration_ms: Date.now() - start, rows: result.rowCount }, text.slice(0, 80));
    return result;
  } catch (err) {
    log.error({ err, query: text.slice(0, 120) }, 'query failed');
    throw err;
  }
}

/**
 * Apply any unapplied migration files from db/migrations/ in order.
 * Idempotent — safe to call on every startup.
 */
export async function runMigrations() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const migrationsDir = join(__dirname, '../../db/migrations');

  await query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id          SERIAL PRIMARY KEY,
      filename    TEXT UNIQUE NOT NULL,
      applied_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const { rows } = await query('SELECT filename FROM _migrations');
  const applied = new Set(rows.map((r) => r.filename));

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(migrationsDir, file), 'utf-8');
    await query(sql);
    await query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
    log.info({ migration: file }, 'migration applied');
  }
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    log.info('postgres pool closed');
  }
}
