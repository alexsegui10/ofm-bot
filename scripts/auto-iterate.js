#!/usr/bin/env node
/**
 * scripts/auto-iterate.js
 *
 * Loop de iteración autónoma para el bot OFM.
 *
 * Modos:
 *   --mode=baseline  (default): ejecuta UNA pasada de los escenarios P1
 *                     sin hacer cambios de código. Produce el baseline.
 *   --mode=loop     : loop completo (baseline → análisis → fix → retry)
 *                     con salvaguardas (commit, revert si empeora, max 20 it).
 *
 * Pre-requisitos:
 *   1. TEST_MODE=true en .env
 *   2. Postgres local corriendo (docker compose up -d postgres)
 *   3. Server OFM corriendo en localhost:4000 (npm run dev en otra terminal)
 *      o se arranca con --spawn-server (no implementado en baseline).
 *   4. ANTHROPIC_API_KEY válida en .env
 *
 * Salidas:
 *   - docs/MEJORAS.md       — resumen de la sesión
 *   - docs/PREGUNTAS-PENDIENTES.md — dudas si las hay
 *   - stdout — log humano-legible
 */

import 'dotenv/config';
import { execSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

import { PRIORITY_1 } from './scenarios.js';
import { runScenario, closePool } from './fake-client.js';
import { createEvaluator } from './evaluate-response.js';
import { TEST_CHAT_IDS } from './reset-test-client.js';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const MEJORAS_PATH = path.join(REPO_ROOT, 'docs', 'MEJORAS.md');
const PREGUNTAS_PATH = path.join(REPO_ROOT, 'docs', 'PREGUNTAS-PENDIENTES.md');

const MAX_ITERATIONS = 20;
const MAX_CONSECUTIVE_FAILS_PER_SCENARIO = 3;
const SERVER_HEALTH_URL = `http://localhost:${process.env.PORT || 4000}/health`;

// ─── Args ────────────────────────────────────────────────────────────────
function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, ...rest] = a.replace(/^--/, '').split('=');
      return [k, rest.length ? rest.join('=') : true];
    }),
  );
  return {
    mode: args.mode || 'baseline',
    only: args.only || null,           // CSV de IDs: "A1,A3"
    skipReset: Boolean(args.skipReset),
  };
}

// ─── Utilidades ──────────────────────────────────────────────────────────
function now() {
  return new Date().toISOString();
}

function log(...parts) {
  console.log(`[${now()}]`, ...parts);
}

async function checkServerHealth() {
  try {
    const res = await fetch(SERVER_HEALTH_URL);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const json = await res.json();
    return json.status === 'ok';
  } catch (err) {
    throw new Error(`Server no responde en ${SERVER_HEALTH_URL}: ${err.message}`);
  }
}

/**
 * Reset de un chatId concreto. Usa pool propio (más simple que llamar al script).
 */
async function resetChat(chatId) {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query(
      `SELECT id FROM clients WHERE telegram_user_id = $1`,
      [chatId],
    );
    if (rows.length === 0) return;
    const clientId = rows[0].id;
    const tables = [
      'conversations', 'transactions', 'sexting_sessions',
      'quality_gate_failures', 'pending_payments', 'handoff_sessions',
      'pending_bizum_confirmations',
    ];
    for (const table of tables) {
      await pool.query(`DELETE FROM ${table} WHERE client_id = $1`, [clientId]);
    }
    await pool.query(`DELETE FROM clients WHERE id = $1`, [clientId]);
  } finally {
    await pool.end();
  }
}

// ─── Run single scenario ────────────────────────────────────────────────
async function runSingle(scenario, evaluator) {
  log(`▶ ${scenario.id} — ${scenario.title}`);
  await resetChat(scenario.chatId);

  let result;
  try {
    result = await runScenario({
      chatId: scenario.chatId,
      messages: scenario.messages,
      timeoutMs: 60_000,
      quietMs: 5_000,
    });
  } catch (err) {
    log(`  ⚠ fake-client error:`, err.message);
    return {
      id: scenario.id,
      title: scenario.title,
      passed: false,
      turns: [],
      verdict: {
        passed: false,
        violations: [`fake_client_error: ${err.message}`],
        suggestions: [],
        pending_questions: [],
      },
    };
  }

  let verdict;
  try {
    verdict = await evaluator.evaluate({ scenario, turns: result.turns });
  } catch (err) {
    log(`  ⚠ evaluator error:`, err.message);
    verdict = {
      passed: false,
      violations: [`evaluator_error: ${err.message}`],
      suggestions: [],
      pending_questions: [],
    };
  }

  log(`  ${verdict.passed ? '✅' : '❌'} ${scenario.id}`);
  if (!verdict.passed) {
    for (const v of verdict.violations) log(`     · ${v}`);
  }

  return {
    id: scenario.id,
    title: scenario.title,
    passed: verdict.passed,
    turns: result.turns,
    verdict,
  };
}

// ─── Run all scenarios in a pass ────────────────────────────────────────
async function runPass(scenarios, evaluator) {
  const results = [];
  for (const sc of scenarios) {
    const r = await runSingle(sc, evaluator);
    results.push(r);
    // Short pause between scenarios to avoid clobbering the server + rate-limits
    await sleep(2000);
  }
  return results;
}

// ─── Report ─────────────────────────────────────────────────────────────
function summarize(results) {
  const passed = results.filter((r) => r.passed);
  const failed = results.filter((r) => !r.passed);
  return {
    total: results.length,
    passedCount: passed.length,
    failedCount: failed.length,
    failedIds: failed.map((r) => r.id),
    passedIds: passed.map((r) => r.id),
  };
}

function appendMejoras(block) {
  appendFileSync(MEJORAS_PATH, block + '\n', 'utf-8');
}

function renderBaselineBlock({ results, summary, mode, iteration }) {
  const lines = [];
  lines.push(`## [${now()}] ${mode === 'baseline' ? 'BASELINE' : `ITERACIÓN ${iteration}`}`);
  lines.push('');
  lines.push(`- Escenarios pasados: **${summary.passedCount}/${summary.total}**`);
  lines.push(`- Fallos: ${summary.failedCount === 0 ? '_ninguno_' : summary.failedIds.join(', ')}`);
  lines.push('');
  if (summary.failedCount > 0) {
    lines.push('### Detalle de fallos');
    for (const r of results.filter((x) => !x.passed)) {
      lines.push('');
      lines.push(`#### ${r.id} — ${r.title}`);
      lines.push('Violaciones:');
      for (const v of r.verdict.violations) lines.push(`- ${v}`);
      if (r.verdict.suggestions?.length) {
        lines.push('');
        lines.push('Sugerencias:');
        for (const s of r.verdict.suggestions) lines.push(`- ${s}`);
      }
      if (r.verdict.pending_questions?.length) {
        lines.push('');
        lines.push('Preguntas abiertas:');
        for (const q of r.verdict.pending_questions) lines.push(`- ${q}`);
      }
      lines.push('');
      lines.push('Respuestas de Alba:');
      for (const t of r.turns) {
        const asst = t.assistant.map((a) => `      ↳ ${a.content}`).join('\n');
        lines.push(`    CLIENTE: ${t.user}`);
        lines.push(asst || '      ↳ (sin respuesta)');
      }
    }
  }
  lines.push('');
  lines.push('---');
  return lines.join('\n');
}

// ─── Main ───────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs();
  log(`mode=${args.mode}`);

  // Pre-flight
  if (process.env.TEST_MODE !== 'true') {
    throw new Error('TEST_MODE debe ser "true" en .env antes de correr el loop');
  }
  await checkServerHealth();
  log('Server health OK');

  // Filtro opcional
  let scenarios = PRIORITY_1;
  if (args.only) {
    const ids = new Set(args.only.split(',').map((s) => s.trim()));
    scenarios = PRIORITY_1.filter((s) => ids.has(s.id));
    log(`Filtrado a ${scenarios.length} escenarios: ${[...ids].join(', ')}`);
  }

  const evaluator = createEvaluator();

  if (args.mode === 'baseline') {
    log(`Corriendo BASELINE (${scenarios.length} escenarios)…`);
    const results = await runPass(scenarios, evaluator);
    const summary = summarize(results);
    log(`\nBASELINE: ${summary.passedCount}/${summary.total} pasaron`);
    if (summary.failedCount > 0) log(`Fallos: ${summary.failedIds.join(', ')}`);

    appendMejoras(renderBaselineBlock({ results, summary, mode: 'baseline' }));
    log(`Resumen escrito en docs/MEJORAS.md`);
    log('\nBaseline hecho. Listo para empezar el loop. Espera autorización del owner.');
    return;
  }

  if (args.mode === 'loop') {
    throw new Error('El modo "loop" requiere autorización explícita — pasar --i-understand=yes');
    // (se implementa una vez el owner dé luz verde tras revisar el baseline)
  }

  throw new Error(`modo desconocido: ${args.mode}`);
}

main()
  .catch((err) => {
    console.error('\n[AUTO-ITERATE ERROR]', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
