#!/usr/bin/env node
/**
 * scripts/validate-catalog-e2e.js
 *
 * End-to-end validation of every v2 product family:
 *   1. Fotos sueltas       (singles)
 *   2. Video individual    (v_001)
 *   3. Pack de fotos       (pk_001)
 *   4. Sexting template    (st_10min)
 *   5. Videollamada        (videocall — requires handoff)
 *   6. Video personalizado (custom — requires handoff)
 *
 * For each scenario it runs a minimal conversation against the running
 * bot (localhost:4000 by default, TEST_MODE=true) and asserts:
 *   - Alba answers (no empty/pipeline failure)
 *   - The expected price or keyword appears in the reply
 *   - For handoff products: Alba mentions handoff / operador / personalizado
 *
 * Requires:
 *   - Server running (`TEST_MODE=true npm run dev`)
 *   - Postgres running with seed data
 *
 * Usage:
 *   node scripts/validate-catalog-e2e.js
 *
 * Exit code: 0 when all pass, 1 if any scenario fails.
 */

import 'dotenv/config';
import { runScenario, closePool } from './fake-client.js';

const SCENARIOS = [
  {
    id: 'fotos-sueltas',
    description: 'Fotos sueltas — 2 fotos de culo',
    chatId: 910_000_001,
    messages: [
      'hola',
      'quiero 2 fotos de culo',
      'bizum',
    ],
    expect: {
      priceHints:   [/12\s*€/],
      keywordHints: [/foto|culo/i],
    },
  },
  {
    id: 'video-v001',
    description: 'Video individual — v_001 (squirt en la ducha, 20€)',
    chatId: 910_000_002,
    messages: [
      'hola',
      'qué videos tienes',
      'dame el v_001',
      'bizum',
    ],
    expect: {
      priceHints:   [/20\s*€/],
      keywordHints: [/ducha|squirt|video/i],
    },
  },
  {
    id: 'pack-pk001',
    description: 'Pack de fotos — pk_001 (culo en tanga roja, 15€)',
    chatId: 910_000_003,
    messages: [
      'hola',
      'qué packs tienes',
      'quiero el pk_001',
      'crypto',
    ],
    expect: {
      priceHints:   [/15\s*€/],
      keywordHints: [/pack|culo|tanga/i],
    },
  },
  {
    id: 'sexting-10min',
    description: 'Sexting template — st_10min (30€)',
    chatId: 910_000_004,
    messages: [
      'hola',
      'quiero sexting de 10 minutos',
      'bizum',
    ],
    expect: {
      priceHints:   [/30\s*€/],
      keywordHints: [/sexting|10\s*min/i],
    },
  },
  {
    id: 'videocall',
    description: 'Videollamada — requires handoff (20€ mínimo 5min)',
    chatId: 910_000_005,
    messages: [
      'hola',
      'quiero una videollamada de 10 minutos',
    ],
    expect: {
      // Either mentions 40€ (10min * 4) or the 4€/min rate or handoff
      priceHints:   [/(40\s*€|4\s*€\s*\/?\s*min|videollamada)/i],
      keywordHints: [/videollamada|videocall|te\s+(aviso|escribo|paso)|operador|agenda/i],
    },
  },
  {
    id: 'personalizado',
    description: 'Video personalizado — requires handoff (desde 45€)',
    chatId: 910_000_006,
    messages: [
      'hola',
      'quiero un video personalizado',
    ],
    expect: {
      priceHints:   [/(45\s*€|personaliz)/i],
      keywordHints: [/personaliz|custom|te\s+(aviso|escribo|paso)|operador/i],
    },
  },
];

function collectAllText(turns) {
  return turns
    .flatMap((t) => t.assistant.map((a) => a.content))
    .filter(Boolean)
    .join(' \n ');
}

function runChecks(scenario, turns) {
  const full = collectAllText(turns);
  const failures = [];

  if (!full || full.trim().length === 0) {
    failures.push('no assistant reply at all');
    return failures;
  }

  // Assistant must have answered EVERY client turn.
  for (let i = 0; i < turns.length; i++) {
    if (!turns[i].assistant || turns[i].assistant.length === 0) {
      failures.push(`turn ${i + 1} ("${turns[i].user}") received no reply`);
    }
  }

  // Price hints — at least one must appear somewhere in the full reply.
  const priceOk = scenario.expect.priceHints.some((rx) => rx.test(full));
  if (!priceOk) {
    failures.push(
      `missing price hint (expected one of ${scenario.expect.priceHints.map(String).join(', ')})`,
    );
  }

  // Keyword hints — at least one must appear.
  const kwOk = scenario.expect.keywordHints.some((rx) => rx.test(full));
  if (!kwOk) {
    failures.push(
      `missing keyword hint (expected one of ${scenario.expect.keywordHints.map(String).join(', ')})`,
    );
  }

  return failures;
}

async function runOne(scenario) {
  const start = Date.now();
  try {
    const result = await runScenario({
      chatId:    scenario.chatId,
      messages:  scenario.messages,
      timeoutMs: 45_000,
      quietMs:   5_000,
    });
    const failures = runChecks(scenario, result.turns);
    return {
      id:      scenario.id,
      ok:      failures.length === 0,
      latency: Date.now() - start,
      failures,
      turns:   result.turns,
    };
  } catch (err) {
    return {
      id:      scenario.id,
      ok:      false,
      latency: Date.now() - start,
      failures: [`runScenario threw: ${err.message}`],
      turns:    [],
    };
  }
}

async function main() {
  console.log('─── Catalog E2E validation ─────────────────────────────────');
  console.log(`scenarios: ${SCENARIOS.length}`);
  console.log('');

  const results = [];
  for (const s of SCENARIOS) {
    process.stdout.write(`▶ ${s.id.padEnd(20)} — ${s.description} ... `);
    const r = await runOne(s);
    results.push(r);
    if (r.ok) {
      console.log(`OK (${r.latency}ms)`);
    } else {
      console.log(`FAIL (${r.latency}ms)`);
      for (const f of r.failures) console.log(`   · ${f}`);
      console.log('   turns:');
      for (const t of r.turns) {
        console.log(`   ← "${t.user}"`);
        for (const a of (t.assistant || [])) {
          console.log(`   → [${a.intent || '-'}] ${a.content.slice(0, 140)}`);
        }
      }
    }
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  console.log('');
  console.log('─── Summary ────────────────────────────────────────────────');
  console.log(`passed: ${passed} / ${results.length}`);
  console.log(`failed: ${failed}`);

  await closePool();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('fatal:', err);
  await closePool().catch(() => {});
  process.exit(2);
});
