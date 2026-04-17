#!/usr/bin/env node
/**
 * scripts/check-openrouter-models.js
 *
 * Queries OpenRouter's public model list and surfaces the best candidates
 * for NSFW roleplay / uncensored chat (persona bot use case).
 *
 * Usage:
 *   node scripts/check-openrouter-models.js
 *
 * Requires OPENROUTER_API_KEY in .env or environment.
 */

import 'dotenv/config';

const API_KEY = process.env.OPENROUTER_API_KEY;
if (!API_KEY) {
  console.error('ERROR: OPENROUTER_API_KEY not set in .env');
  process.exit(1);
}

// ─── Scoring heuristics ───────────────────────────────────────────────────────

/**
 * Keywords that strongly signal a model is suitable for uncensored / roleplay use.
 * Checked against model id + description (lowercased).
 */
const POSITIVE_SIGNALS = [
  'uncensored', 'nsfw', 'roleplay', 'lumimaid', 'euryale', 'noromaid',
  'dolphin', 'venice', 'celeste', 'stheno', 'lewdplay', 'rose',
  'mythomist', 'gemma-3', 'mistral-nemo', 'hermes',
];

/**
 * Keywords that disqualify a model for this use case.
 */
const NEGATIVE_SIGNALS = [
  'vision', 'embed', 'instruct-lite', 'coding', 'math', 'moderated',
  'safe', 'guard', 'censor',
];

/**
 * Score a model for our use case (0–100).
 */
function scoreModel(model) {
  const haystack = `${model.id} ${model.name ?? ''} ${model.description ?? ''}`.toLowerCase();
  let score = 0;

  for (const kw of POSITIVE_SIGNALS) {
    if (haystack.includes(kw)) score += 15;
  }
  for (const kw of NEGATIVE_SIGNALS) {
    if (haystack.includes(kw)) score -= 20;
  }

  // Prefer models with context >= 8k (can hold a meaningful conversation)
  const ctx = model.context_length ?? 0;
  if (ctx >= 32000) score += 10;
  else if (ctx >= 8000) score += 5;

  // Penalise very expensive models (input cost > $5/1M tokens)
  const inputCost = parseFloat(model.pricing?.prompt ?? '0') * 1_000_000;
  if (inputCost > 5) score -= 15;
  else if (inputCost === 0) score += 5; // free tier bonus

  // Prefer 7B-70B range (good balance for roleplay)
  if (/\b(7b|8b|13b|20b|24b|34b|70b)\b/.test(haystack)) score += 5;

  return Math.max(0, score);
}

function formatPrice(perToken) {
  if (!perToken || perToken === '0') return 'FREE';
  const per1M = (parseFloat(perToken) * 1_000_000).toFixed(2);
  return `$${per1M}/1M`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const res = await fetch('https://openrouter.ai/api/v1/models', {
  headers: { Authorization: `Bearer ${API_KEY}` },
});

if (!res.ok) {
  console.error(`OpenRouter API error ${res.status}: ${await res.text()}`);
  process.exit(1);
}

const { data: models } = await res.json();
console.log(`\nFetched ${models.length} models from OpenRouter\n`);

// ─── Check specific candidates mentioned by user ──────────────────────────────

const CANDIDATES_TO_CHECK = [
  'cognitivecomputations/dolphin-mistral-24b-venice-edition:free',
  'cognitivecomputations/dolphin-mistral-24b-venice-edition',
  'sao10k/l3.1-euryale-70b',
  'neversleep/noromaid-mixtral-8x7b-instruct',
  'x-ai/grok-3-beta',
  // Also check current (deprecated) models
  'neversleep/llama-3-lumimaid-70b',
  'nothingiisreal/mn-celeste-12b',
];

console.log('═══════════════════════════════════════════════════════════');
console.log('SPECIFIC CANDIDATES STATUS');
console.log('═══════════════════════════════════════════════════════════');

for (const id of CANDIDATES_TO_CHECK) {
  const found = models.find((m) => m.id === id);
  if (found) {
    const inputCost = formatPrice(found.pricing?.prompt);
    const outputCost = formatPrice(found.pricing?.completion);
    console.log(`✓ ACTIVE   ${id}`);
    console.log(`           ctx: ${(found.context_length / 1000).toFixed(0)}k | in: ${inputCost} | out: ${outputCost}`);
  } else {
    console.log(`✗ NOT FOUND / DEPRECATED: ${id}`);
  }
}

// ─── Top candidates by score ──────────────────────────────────────────────────

const scored = models
  .map((m) => ({ ...m, _score: scoreModel(m) }))
  .filter((m) => m._score > 0)
  .sort((a, b) => b._score - a._score)
  .slice(0, 20);

console.log('\n═══════════════════════════════════════════════════════════');
console.log('TOP 20 CANDIDATES BY SCORE (NSFW roleplay use case)');
console.log('═══════════════════════════════════════════════════════════');

for (const m of scored) {
  const inputCost = formatPrice(m.pricing?.prompt);
  const outputCost = formatPrice(m.pricing?.completion);
  const ctx = m.context_length ? `${(m.context_length / 1000).toFixed(0)}k` : '?k';
  console.log(`[${String(m._score).padStart(3)}] ${m.id}`);
  console.log(`      ctx: ${ctx} | in: ${inputCost} | out: ${outputCost}`);
}

// ─── Free models only ─────────────────────────────────────────────────────────

const free = scored.filter((m) =>
  (!m.pricing?.prompt || m.pricing.prompt === '0') &&
  (!m.pricing?.completion || m.pricing.completion === '0'),
);

console.log('\n═══════════════════════════════════════════════════════════');
console.log('FREE MODELS IN TOP CANDIDATES');
console.log('═══════════════════════════════════════════════════════════');
if (free.length === 0) {
  console.log('  (none found in top 20)');
} else {
  for (const m of free) {
    console.log(`[${String(m._score).padStart(3)}] ${m.id}  ctx: ${(m.context_length / 1000).toFixed(0)}k`);
  }
}

console.log('\nDone.\n');
