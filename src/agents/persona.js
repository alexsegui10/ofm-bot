import { callOpenRouter } from '../lib/llm-client.js';
import { getPersonaContent } from '../lib/persona-config.js';
import { env } from '../config/env.js';
import { agentLogger } from '../lib/logger.js';
import { getClientTier } from './profile-manager.js';
import { getProducts } from '../config/products.js';
import { calculatePhotoPrice, PHOTO_MAX_PER_TX } from '../lib/pricing.js';

const log = agentLogger('persona');

/**
 * Deterministic catalog-row patterns that the orchestrator emits as a
 * separate fragment. If Persona repeats them in its text, the client sees
 * a DUPLICATED catalog. We strip them post-hoc when the client has already
 * been shown the catalog at least once (clients.has_seen_catalog === true).
 *
 * Exported for unit testing.
 */
export const CATALOG_REPEAT_PATTERNS = [
  /\d+\s*fotos?\s*\d+€/i,
  /\d+\s*min\s*\d+€/i,
  /1\s*foto\s*7€/i,
  /sexting\s*5[\/\s]*10[\/\s]*15\s*min/i,
  /videollamada\s*4€[\/\s]*min/i,
  /packs?\s*desde\s*\d+€/i,
];

/**
 * Strip any line containing a catalog-row pattern. Operates line-by-line
 * (split on newline) so we keep the surrounding flirty/coquettish text.
 * Lines that become empty after pattern removal are dropped entirely.
 *
 * Exported for unit testing.
 *
 * @param {string} text
 * @returns {{ sanitized: string, stripped: string[] }}
 */
export function sanitizeCatalogRepeats(text) {
  if (!text || typeof text !== 'string') return { sanitized: text || '', stripped: [] };
  const stripped = [];
  const lines = text.split(/\r?\n/);
  const kept = [];
  for (const line of lines) {
    const matched = CATALOG_REPEAT_PATTERNS.some((rx) => rx.test(line));
    if (matched) {
      stripped.push(line.trim());
      continue;
    }
    kept.push(line);
  }
  // Collapse 3+ blank lines to 2, trim outer whitespace.
  const sanitized = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { sanitized, stripped };
}

const CATALOG_REGEN_INSTRUCTION =
  'No escribas precios ni catálogo (el cliente ya lo vio antes en este chat). ' +
  'Responde SOLO coqueteo en 1-2 frases cortas, sin enumerar productos ni cifras.';

/**
 * Compact price reference derived from products.json. Injected in the system
 * prompt so that IF Persona ends up quoting a price (a misrouted turn where
 * Sales didn't fire), it uses the real catalogue value instead of inventing one.
 *
 * Exported for testing.
 */
export function buildPriceReference() {
  const products = getProducts();
  const videos = (products.videos ?? [])
    .filter((v) => v.activo !== false)
    .map((v) => `${v.id} ${v.titulo} ${v.precio_eur}€`)
    .join(', ');
  const singles = Array.from({ length: Math.min(6, PHOTO_MAX_PER_TX) }, (_, i) => {
    const n = i + 1;
    return `${n}→${calculatePhotoPrice(n)}€`;
  }).join(', ');
  const sext = (products.sexting_templates ?? [])
    .map((st) => `${st.duracion_min}min ${st.precio_eur}€`)
    .join(', ');
  const vc = products.videollamada
    ? `${products.videollamada.precio_por_minuto}€/min, mín ${products.videollamada.minimo_minutos}min`
    : '4€/min, mín 5min';
  const custom = products.personalizado?.precio_minimo ?? 45;

  return [
    'PRECIOS EXACTOS (si acabas mencionando un precio, usa SOLO estos valores, JAMÁS inventes otro):',
    `- videos: ${videos}`,
    `- fotos sueltas: ${singles}`,
    `- sexting: ${sext}`,
    `- videollamada: ${vc}`,
    `- personalizado: desde ${custom}€`,
  ].join('\n');
}

/**
 * Builds the system prompt from persona.md + client context.
 * Exported for unit testing.
 *
 * @param {object} client  Full client DB row
 * @param {string} intent
 * @returns {string}
 */
export function buildSystemPrompt(client, intent) {
  const personaContent = getPersonaContent();
  const tier = getClientTier(client);
  const profile = client?.profile || {};

  const clientCtx = [
    `CONTEXTO DEL CLIENTE ACTUAL:`,
    `- Nombre: ${profile.nombre || 'desconocido'}`,
    `- Tipo: ${tier}`,
    `- Compras previas: ${client?.num_compras ?? 0}`,
    `- Gasto total: ${client?.total_gastado ?? 0}€`,
    profile.gustos?.length ? `- Gustos detectados: ${profile.gustos.join(', ')}` : null,
    profile.tono_preferido ? `- Tono que prefiere: ${profile.tono_preferido}` : null,
    `- Intent detectado: ${intent}`,
  ].filter(Boolean).join('\n');

  const roleplayRule = `ROLEPLAY DINÁMICO: Si el cliente te pide adoptar un rol específico (ej: "sé mi doctora", "eres mi profesora", "mi jefa"), asume ese rol adaptando tu forma de hablar, vocabulario y actitud. Tu cuerpo físico NO cambia. Mantén el rol hasta que el cliente cambie. Puedes aceptar CUALQUIER rol que no rompa los LÍMITES DUROS del persona (menores de edad sigue prohibido).`;

  const SALE_INTENTS = new Set([
    'sale_intent_photos', 'sale_intent_videos', 'sexting_request',
    'videocall_request', 'custom_video_request', 'product_selection',
    'payment_method_selection',
    // v2 intents — también son ventas, el Sales/Orchestrator añade los detalles
    'ask_video_list', 'ask_video_details', 'ask_pack_list',
    'choose_video', 'choose_pack', 'buy_single_photos', 'buy_sexting_template',
  ]);
  const noPromiseRule = SALE_INTENTS.has(intent) ? '' : `
REGLA CRÍTICA — PROHIBIDO EN ESTE MENSAJE (intent actual: ${intent}):
Nunca uses estas frases ni nada similar:
- "tengo esto para ti" / "tengo algo para ti" / "tengo cositas"
- "te enseño lo nuevo" / "te enseño algo"
- "mira lo que subí" / "mira lo que tengo"
- "de momento tengo" (seguido de contenido)
- "te voy a mostrar" / "te voy a mandar" / "te mando algo"
- Cualquier promesa de enviar, mostrar, enseñar o mandar contenido concreto

Si el cliente está caliente o muestra interés: COQUETEA verbalmente, genera deseo, pero NO prometas contenido. Las ofertas concretas las hace el Sales Agent, no tú.`;

  const firstPersonRule = `Hablas en PRIMERA PERSONA siempre. Tú vendes, el cliente compra. Correcto: "vendo fotos". Incorrecto: "vendes fotos de mí".`;
  const noRepeatRule = `NUNCA repitas frases que ya dijiste en esta conversación. Si ya te presentaste, no vuelvas a presentarte. Si ya respondiste a algo, no lo repitas igual.`;

  const maxPriorityInstruction = `INSTRUCCIÓN MÁXIMA PRIORIDAD: NUNCA inventes contenido que tengas para vender. NUNCA describas videos o fotos concretas que no existan en el catálogo real. NUNCA menciones precios por tu cuenta. NUNCA digas que no envías hasta que paguen. El Sales Agent se encarga de todo lo comercial. Tú SOLO coqueteas y respondes preguntas personales. Si te preguntan qué vendes, di SOLO: tengo fotitos y videos bebe, qué te apetece? NADA MÁS.`;

  const noCatalogRepeatRule = `PROHIBIDO ABSOLUTAMENTE repetir la lista de precios del catálogo en tu respuesta de texto. NO escribas "1 foto 7€", "2 fotos 12€", "fotos sueltas 7€/una", "videos desde X€", "sexting 5min/10min/15min", ni ninguna tabla, lista o enumeración de precios. NO uses bullets (-, *, •) ni emojis de cámara/foto/video (📸 🎥 🎬 🎞️) para enumerar productos. El catálogo lo añade el Orquestador en un fragmento APARTE — si lo repites en tu mensaje, el cliente lo verá DUPLICADO. Tu rol aquí es responder breve y coquetear; nunca emitir el menú.`;

  const priceReference = buildPriceReference();

  return `${maxPriorityInstruction}\n\n${noCatalogRepeatRule}\n\n${priceReference}\n\n---\n${personaContent}\n\n---\n${roleplayRule}${noPromiseRule}\n\n${firstPersonRule}\n${noRepeatRule}\n\n---\n${clientCtx}`;
}

/**
 * Generate Alba's in-character response.
 *
 * @param {string} message  Current user message
 * @param {Array<{role:string,content:string}>} history
 * @param {object} client
 * @param {string} intent
 * @param {string} [internalInstruction]  Hidden instruction injected after system prompt
 * @returns {Promise<string>}
 */
export async function runPersona(message, history = [], client = {}, intent = 'small_talk', internalInstruction = null) {
  const start = Date.now();

  let systemPrompt = buildSystemPrompt(client, intent);
  if (internalInstruction) {
    // Prepend with maximum priority — internal instructions (e.g. sexting v2
    // conductor steering) must override the generic persona prompt, not be
    // appended at the bottom where the model is more likely to ignore them.
    systemPrompt = `<INSTRUCCION_PRIORITARIA>\n${internalInstruction}\n</INSTRUCCION_PRIORITARIA>\n\n${systemPrompt}`;
  }

  // Build messages array: history + current message
  const messages = [
    ...history.map((t) => ({ role: t.role, content: t.content })),
    { role: 'user', content: message },
  ];

  const response = await callOpenRouter({
    model: env.MODEL_PERSONA,
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
    temperature: 0.75,
    maxTokens: 200,
    stop: ['\n\n\n', 'Cliente:', 'Alba:', 'User:', 'Assistant:', 'Human:'],
    agent: 'persona',
  });

  // Strip leaked role markers that some models prepend (e.g. "Assistant: hola")
  let cleaned = (response || '')
    .replace(/^(Assistant|Human|User|Alba|Cliente)\s*:\s*/i, '')
    .replace(/^#+\s+\S.*\n?/m, '') // strip stray markdown headers
    .trim();

  // ─── BUG #2 v2 — deterministic post-processing ───────────────────────────
  // If the client has already been shown the catalog at least once, strip any
  // repeated catalog rows (the orchestrator emits the catalog as a separate
  // fragment; repetition causes visible duplication for the client).
  // If the sanitized output is too short to be a usable response, regenerate
  // ONCE with an explicit instruction. Otherwise log + ship sanitized.
  if (client?.has_seen_catalog === true) {
    const { sanitized, stripped } = sanitizeCatalogRepeats(cleaned);
    if (stripped.length > 0) {
      log.warn({
        intent,
        client_id: client.id,
        stripped_count: stripped.length,
        stripped_preview: stripped.slice(0, 3),
        original_length: cleaned.length,
        sanitized_length: sanitized.length,
      }, 'persona post-process: stripped catalog repeats');
    }

    // Only consider regenerating when we actually stripped something AND the
    // result is now too short to be a usable response. Short outputs that were
    // never modified are legitimate (e.g. "hola q tal") and should not trigger
    // a regeneration.
    if (stripped.length > 0 && sanitized.length < 15) {
      // Regenerate ONCE with a reinforced instruction. We do not loop — if
      // the second attempt is also too short, we ship whatever we get.
      log.warn({
        intent,
        client_id: client.id,
        sanitized_length: sanitized.length,
      }, 'persona post-process: sanitized output too short, regenerating once');

      const regenSystem =
        `<INSTRUCCION_PRIORITARIA>\n${CATALOG_REGEN_INSTRUCTION}\n</INSTRUCCION_PRIORITARIA>\n\n${systemPrompt}`;
      const regenResponse = await callOpenRouter({
        model: env.MODEL_PERSONA,
        messages: [{ role: 'system', content: regenSystem }, ...messages],
        temperature: 0.75,
        maxTokens: 200,
        stop: ['\n\n\n', 'Cliente:', 'Alba:', 'User:', 'Assistant:', 'Human:'],
        agent: 'persona',
      });
      const regenCleaned = (regenResponse || '')
        .replace(/^(Assistant|Human|User|Alba|Cliente)\s*:\s*/i, '')
        .replace(/^#+\s+\S.*\n?/m, '')
        .trim();
      const regenSanitized = sanitizeCatalogRepeats(regenCleaned).sanitized;
      cleaned = regenSanitized || regenCleaned || sanitized;
    } else if (stripped.length > 0) {
      cleaned = sanitized;
    }
    // else: nothing stripped → keep original cleaned text untouched.
  }

  log.info({
    intent,
    latency_ms: Date.now() - start,
    response_length: cleaned.length,
    tier: getClientTier(client),
  }, 'persona response generated');

  return cleaned;
}
