#!/usr/bin/env node
/**
 * scripts/evaluate-response.js
 *
 * Evalúa la respuesta de Alba para un escenario dado usando Claude Sonnet 4.6.
 *
 * Optimización: `criterio.md` se carga una sola vez en el system prompt y se
 * marca con `cache_control: { type: 'ephemeral' }`. Anthropic cacheará el
 * prefijo; las llamadas subsecuentes sólo pagan el delta (escenario + turnos).
 *
 * Uso programático:
 *   import { createEvaluator } from './scripts/evaluate-response.js';
 *   const evaluator = createEvaluator();
 *   const verdict = await evaluator.evaluate({ scenario, turns });
 *   // verdict: { passed, violations: string[], suggestions: string[], raw }
 */

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const EVALUATOR_MODEL = process.env.EVALUATOR_MODEL || 'claude-sonnet-4-5-20250929';

function loadCriterio() {
  return readFileSync(path.join(REPO_ROOT, 'docs', 'criterio.md'), 'utf-8');
}

function loadSecrets() {
  try {
    return JSON.parse(readFileSync(path.join(REPO_ROOT, 'config', 'secrets.json'), 'utf-8'));
  } catch {
    return {};
  }
}

function substituteSecrets(text, secrets) {
  return text.replace(/\{([A-Z_]+)\}/g, (match, key) => secrets[key] ?? match);
}

const SYSTEM_INSTRUCTION = `Eres un evaluador estricto de calidad de respuestas del bot "Alba" (personaje OFM).
Tu tarea: dado un escenario de test y las respuestas reales del bot, juzgar si ha pasado el test
según el CRITERIO que se incluye a continuación.

REGLAS DE EVALUACIÓN (criterio.md sección 9):
A. Frase prohibida presente → FALLO
B. No respondió a lo que preguntó el cliente → FALLO
C. Pregunta vacía sin propuesta → FALLO
D. Repitió información ya dada → FALLO
E. Inventó contenido o precio no existente → FALLO
F. Tono incorrecto (exageraciones, emojis prohibidos, markdown, mayúsculas) → FALLO
G. Gramática: no primera persona → FALLO
H. Violó límite duro (encuentros, datos personales exactos, confirmar ser bot) → FALLO
I. Flujo no avanza (small talk sin fin) → FALLO

Para evaluaciones subjetivas, sé ESTRICTO: si dudas, marca FALLO y escribe la duda en "pending_questions".

FORMATO DE SALIDA: un único bloque JSON (sin texto extra), con la forma exacta:
{
  "passed": true|false,
  "violations": ["letra y descripción corta", ...],
  "suggestions": ["qué habría que cambiar en el código para arreglarlo", ...],
  "pending_questions": ["pregunta al owner si aplica, si no []", ...]
}

No añadas texto fuera del JSON. No uses markdown fences.

── CRITERIO COMPLETO ──`;

/**
 * Build the user message sent per scenario evaluation.
 */
function buildUserMessage({ scenario, turns, secrets }) {
  const expected = substituteSecrets(scenario.expected, secrets);
  const failureSignals = scenario.failureSignals.map((s) => `- ${substituteSecrets(s, secrets)}`).join('\n');

  const convo = turns.map((t, i) => {
    const assistantTexts = t.assistant.map((a, j) => `  [${j + 1}] ${a.content} (intent=${a.intent ?? 'null'})`).join('\n');
    return `Turno ${i + 1}\nCLIENTE: ${t.user}\nALBA:\n${assistantTexts || '  (sin respuesta)'}\n`;
  }).join('\n');

  return `ESCENARIO: ${scenario.id} — ${scenario.title}
PRIORIDAD: ${scenario.priority}

COMPORTAMIENTO ESPERADO:
${expected}

SEÑALES DE FALLO:
${failureSignals}

CONVERSACIÓN REAL:
${convo}

Evalúa según el CRITERIO. Devuelve SÓLO el JSON.`;
}

function parseVerdict(rawText) {
  // Extract the first {...} block (allow leading/trailing text just in case)
  const start = rawText.indexOf('{');
  const end = rawText.lastIndexOf('}');
  if (start < 0 || end < 0) {
    return { passed: false, violations: ['evaluator_parse_error'], suggestions: [], pending_questions: [], raw: rawText };
  }
  const jsonStr = rawText.slice(start, end + 1);
  try {
    const parsed = JSON.parse(jsonStr);
    return {
      passed: Boolean(parsed.passed),
      violations: Array.isArray(parsed.violations) ? parsed.violations : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      pending_questions: Array.isArray(parsed.pending_questions) ? parsed.pending_questions : [],
      raw: rawText,
    };
  } catch (err) {
    return { passed: false, violations: [`evaluator_parse_error: ${err.message}`], suggestions: [], pending_questions: [], raw: rawText };
  }
}

/**
 * Create a stateful evaluator. Reuses the same SDK client + criterio text,
 * and lets Anthropic cache the criterio prefix via cache_control.
 */
export function createEvaluator() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set — cannot evaluate');

  const client = new Anthropic({ apiKey });
  const criterio = loadCriterio();
  const secrets = loadSecrets();

  const systemBlocks = [
    { type: 'text', text: SYSTEM_INSTRUCTION },
    // The criterio block is the bulk of the tokens — cache it aggressively.
    { type: 'text', text: substituteSecrets(criterio, secrets), cache_control: { type: 'ephemeral' } },
  ];

  return {
    async evaluate({ scenario, turns }) {
      const userMessage = buildUserMessage({ scenario, turns, secrets });
      const resp = await client.messages.create({
        model: EVALUATOR_MODEL,
        max_tokens: 1024,
        system: systemBlocks,
        messages: [{ role: 'user', content: userMessage }],
      });
      const text = resp.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('\n');
      return parseVerdict(text);
    },
  };
}

// ── CLI entrypoint (for quick manual checks) ─────────────────────────────────
const isMain = import.meta.url.endsWith(
  (process.argv[1] || '').replace(/\\/g, '/').split('/').pop() || '__never__',
);

if (isMain) {
  // Minimal smoke test
  (async () => {
    const { SCENARIOS } = await import('./scenarios.js');
    const evaluator = createEvaluator();
    const scenario = SCENARIOS[0];
    const verdict = await evaluator.evaluate({
      scenario,
      turns: [{ user: 'hola', assistant: [{ content: 'holaa bebe 😈 te paso mis cositas', intent: null }] }],
    });
    console.log(JSON.stringify(verdict, null, 2));
  })();
}
