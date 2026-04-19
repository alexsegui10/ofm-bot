import { callAnthropic } from '../lib/llm-client.js';
import { getHardLimits } from '../lib/persona-config.js';
import { agentLogger } from '../lib/logger.js';

const log = agentLogger('quality-gate');

// Safe fallback responses that fit Alba's voice
const SAFE_RESPONSES = [
  'uf espera que me ha llegado algo 😅',
  'oye cambia de tema va',
  'perdona me he liado un momento',
  'jaja q cosas, cuéntame otra cosa mejor',
];

function getSafeResponse() {
  return SAFE_RESPONSES[Math.floor(Math.random() * SAFE_RESPONSES.length)];
}

const SALE_INTENTS = new Set([
  'sale_intent_photos', 'sale_intent_videos', 'sexting_request',
  'videocall_request', 'custom_video_request',
]);

// Pattern: commercial promises that only make sense in a sale context
const COMMERCIAL_PROMISE_PATTERN = /tengo\s+(esto|algo|cositas?|contenido)\s+(para\s+ti|nuevo)|te\s+(ense[ñn]o|muestro|mando|voy\s+a\s+(mostrar|ense[ñn]ar|mandar))\s+(lo|algo|un|una)|mira\s+lo\s+que\s+(sub[ií]|tengo)|de\s+momento\s+tengo\b/i;

// Pattern: real-life personal data of Alba that must NEVER leak during sexting roleplay.
// Outside sexting intent these terms may be revealed when the client asks directly
// (see C3 scenario), so the check is intent-gated.
const SEXTING_PERSONAL_LEAK_PATTERN = /\b(ade|complutense|moncloa)\b/i;

// Pattern: bio leaks the model alucinates when the client asks "dónde estudias / vives"
// (C2/C3). Persona prompt forbids these explicitly but xai/grok-3-beta keeps hallucinating
// concrete Madrid landmarks/universities. This is intent-AGNOSTIC: Alba should never name
// these specific places, in or out of sexting. The orchestrator triggers a regeneration
// (with reinforced instruction) when this fires; the safeResponse is the last-resort fallback.
// BUG #3 v2 — captures diminutives ("complu", "la complu") and the full
// forms. Persona was leaking biographical data through informal short forms
// (e.g. "estudio en la complu") that the previous regex missed.
export const FORBIDDEN_BIO_LEAK = /\b(complu(tense)?|moncloa|uam|aut[oó]noma|carlos\s*iii|rey\s*juan\s*carlos|cu[aá]tro\s*caminos|arg[uü]elles)\b/i;
export const BIO_LEAK_REASON = 'Filtra datos biográficos prohibidos (universidad/barrio Madrid)';

// HIGH-ROI FIX #2 — empty question detector
// Alba frequently ends responses with open questions that don't give the
// client any concrete options to pick from (e.g. "dime qué te mola rey 🔥").
// This is the single largest failure mode in the baseline (affects B1, B3, B4,
// D4, G1, H1). When the LAST non-empty line/fragment of the response matches
// an "empty question" pattern AND the FULL response does not contain any
// concrete option (price in €, product tag, product id, pack/video title),
// the gate rejects it so the orchestrator regenerates with a reinforced
// instruction to offer options.
export const EMPTY_QUESTION_PATTERNS = [
  /^\s*dime\s+qu[eé]\s+te\s*(mola|buscas|apetece|gusta|pone)\s*[\?]*\s*[🔥😈😘✨💋🥵]*\s*$/i,
  /^\s*qu[eé]\s+prefieres\s*[\?]*\s*[🔥😈😘✨💋🥵]*\s*$/i,
  /^\s*qu[eé]\s+te\s+(apetece|mola|gusta)(\s+(ver|hacer))?\s*[\?]*\s*[🔥😈😘✨💋🥵]*\s*$/i,
  /^\s*cu[aá]l\s+te\s+(gusta|mola|apetece)(\s+m[aá]s)?\s*[\?]*\s*[🔥😈😘✨💋🥵]*\s*$/i,
  /^\s*qu[eé]\s+quieres\s*(ver)?\s*[\?]*\s*[🔥😈😘✨💋🥵]*\s*$/i,
  /^\s*qu[eé]\s+buscas\s*[\?]*\s*[🔥😈😘✨💋🥵]*\s*$/i,
];

export const EMPTY_QUESTION_REASON = 'empty_question';

// Intents where an empty "what do you want?" question is legitimate (small
// talk / post-pay chit-chat / sexting already started — Persona drives).
const EMPTY_QUESTION_SKIP_INTENTS = new Set([
  'small_talk',
  'sexting_active',
  'payment_confirmation',
  'payment_method_selection',
]);

// Signals that indicate the response DOES offer concrete options — if any
// of these appear anywhere in the response, the empty-question check passes.
const CONCRETE_OPTION_PATTERN = /(\d+\s*€|\bv_\d+\b|\bpk_\d+\b|\bst_\d+min\b|\bculo\b|\btetas?\b|\bcoño\b|\blencer[ií]a\b|\btacones\b|\bducha\b|\bsquirt\b|bizum|crypto|stars|paypal|pack|sexting|videollamada|personaliz|videos?\b|fotos?\b)/i;

/**
 * Detect an empty question in the response (pure function).
 * @param {string} response Full Persona output (pre-fragmentation).
 * @returns {boolean} true when the final line is an open-ended question and
 *                    the overall response lacks any concrete option.
 */
export function isEmptyQuestion(response) {
  if (!response || typeof response !== 'string') return false;
  // If the response already carries concrete options anywhere, it's not empty.
  if (CONCRETE_OPTION_PATTERN.test(response)) return false;
  const lines = response.split(/[\n\r]+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return false;
  const lastLine = lines[lines.length - 1];
  return EMPTY_QUESTION_PATTERNS.some((re) => re.test(lastLine));
}

// Quick string-based violation checks (no LLM needed, cheaper + faster)
const QUICK_VIOLATIONS = [
  {
    pattern: /\b(tengo\s+\d+\s+años?\b.*menos\s+de\s+18|soy\s+menor|tengo\s+1[0-7]\s+años?)/i,
    reason: 'Indica edad menor de 18',
  },
  {
    pattern: /\b(soy\s+(un\s+)?bot|soy\s+(una\s+)?ia|soy\s+(un\s+)?asistente|soy\s+(un\s+)?modelo\s+de\s+ia)/i,
    reason: 'Se identifica como bot o IA',
  },
  {
    pattern: /\b(nos\s+vemos|quedamos|vernos\s+en\s+persona|encuentro\s+presencial|en\s+persona)/i,
    reason: 'Acepta encuentro físico',
  },
  {
    pattern: /\b(mi\s+whatsapp|mi\s+instagram|mi\s+email|mi\s+teléfono)\b/i,
    reason: 'Comparte contacto fuera de Telegram',
  },
  {
    pattern: /\b(trabajo\s+en\s+una\s+agencia|tengo\s+un\s+manager|somos\s+un\s+equipo)\b/i,
    reason: 'Revela estructura de agencia',
  },
  {
    pattern: /\b(cocaína|heroína|éxtasis|pastillas|drogas\s+duras)\b/i,
    reason: 'Menciona drogas duras',
  },
];

/**
 * Run quick string checks before calling the LLM.
 * Returns null if no violation found, or a reason string.
 *
 * @param {string} response
 * @param {string} [intent]
 * @returns {string|null}
 */
export function quickCheck(response, intent = '') {
  for (const { pattern, reason } of QUICK_VIOLATIONS) {
    if (pattern.test(response)) return reason;
  }
  // Commercial promise outside a sale intent
  if (!SALE_INTENTS.has(intent) && COMMERCIAL_PROMISE_PATTERN.test(response)) {
    return 'Promesa comercial fuera de intent de venta';
  }
  // Personal data leak during sexting roleplay (ADE, Complutense, Moncloa)
  if (intent === 'sexting_request' && SEXTING_PERSONAL_LEAK_PATTERN.test(response)) {
    return 'Filtra datos personales reales durante sexting roleplay (ADE/Complutense/Moncloa)';
  }
  // Bio leak: Madrid universities / barrios Persona alucina cuando le preguntan
  // "dónde estudias / de dónde eres / dónde vives". Intent-agnostic.
  if (FORBIDDEN_BIO_LEAK.test(response)) {
    return BIO_LEAK_REASON;
  }
  // HIGH-ROI FIX #2 — empty question without concrete options.
  // Triggered only for intents where Alba is expected to advance the sale
  // (catalog questions, negotiations). Small-talk / sexting / payment branches
  // are skipped to avoid over-triggering.
  if (!EMPTY_QUESTION_SKIP_INTENTS.has(intent) && isEmptyQuestion(response)) {
    return EMPTY_QUESTION_REASON;
  }
  return null;
}

/**
 * Build the QualityGate LLM prompt.
 * Exported for unit testing.
 */
export function buildQualityGatePrompt(response) {
  const limits = getHardLimits();
  return `${limits}

---
Revisa si la siguiente respuesta viola ALGUNO de los límites anteriores.

RESPUESTA A EVALUAR:
"${response}"

Responde ÚNICAMENTE con JSON válido:
- Si está bien: {"ok":true}
- Si hay violación: {"ok":false,"reason":"descripción breve de la violación"}`;
}

/**
 * Validate a Persona response against hard limits.
 *
 * @param {string} response
 * @param {object} _client  Reserved for future per-client checks
 * @param {string} _intent  Reserved for future intent-specific checks
 * @returns {Promise<{ ok: boolean, reason?: string, safeResponse?: string }>}
 */
export async function runQualityGate(response, _client = {}, _intent = '') {
  const start = Date.now();

  // 1. Quick string check (no LLM cost)
  const quickViolation = quickCheck(response, _intent);
  if (quickViolation) {
    log.warn({ reason: quickViolation, response_preview: response.slice(0, 80) }, 'quality gate: quick check violation');
    return { ok: false, reason: quickViolation, safeResponse: getSafeResponse() };
  }

  // 2. LLM check for subtle violations
  let raw;
  try {
    raw = await callAnthropic({
      model: 'claude-sonnet-4-6',
      system: 'Eres un sistema de control de calidad para un chatbot. Revisa si la respuesta viola los límites indicados.',
      messages: [{ role: 'user', content: buildQualityGatePrompt(response) }],
      temperature: 0,
      maxTokens: 80,
      agent: 'quality-gate',
    });
  } catch (err) {
    log.error({ err }, 'quality gate LLM failed — passing response through');
    return { ok: true };
  }

  let result;
  try {
    const cleaned = raw.replace(/```json\s*|\s*```/g, '').trim();
    result = JSON.parse(cleaned);
  } catch {
    log.warn({ raw }, 'quality gate: non-JSON response — passing through');
    return { ok: true };
  }

  const latency = Date.now() - start;

  if (!result.ok) {
    log.warn({
      reason: result.reason,
      latency_ms: latency,
      response_preview: response.slice(0, 80),
    }, 'quality gate: LLM violation detected');
    return { ok: false, reason: result.reason, safeResponse: getSafeResponse() };
  }

  log.debug({ latency_ms: latency }, 'quality gate: passed');
  return { ok: true };
}
