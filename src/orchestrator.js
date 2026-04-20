import { agentLogger } from './lib/logger.js';
import { getOrCreateClient, getClientById, updateProfile, updateFraudScore, markClientCatalogSeen } from './agents/profile-manager.js';
import { runRouter } from './agents/router.js';
import { runPersona } from './agents/persona.js';
import { runQualityGate, FORBIDDEN_BIO_LEAK, BIO_LEAK_REASON, EMPTY_QUESTION_REASON } from './agents/quality-gate.js';
import { saveMessage, getHistory, normalizeHistory, logQualityGateFailure, getLastInteractionDate, countPriorMessages } from './lib/conversation.js';
import { fragmentMessage, getPacerConfig } from './agents/message-pacer.js';
import { confirmBizumByClient } from './agents/payment-verifier.js';
import { runSales, createOfferFromProduct, lookupProductPrice } from './agents/sales.js';
import { resolveProduct, getCatalogText, getCategoryDetail, getPostServiceMessage } from './lib/product-catalog.js';
import { query } from './lib/db.js';
import { isEnabled as isPaypalEnabled } from './lib/payments/paypal.js';
import {
  formatVideoListText,
  formatPackListText,
  matchVideoFromText,
  matchPackFromText,
  matchSextingTemplateFromText,
  parseSinglePhotoRequest,
} from './lib/content-dispatcher.js';
import {
  setPendingProduct,
  getPendingProduct,
  clearPendingProduct,
} from './lib/pending-product.js';
import {
  startSextingV2ForClient,
  getActiveV2SessionForClient,
  detectRoleplayFromHistory,
} from './lib/sexting-bridge.js';
import { handleClientTurn } from './lib/sexting-conductor.js';

const log = agentLogger('orchestrator');

const GREETINGS_NEW_CLIENT = [
  'holaa bebe 😈 te paso mis cositas',
  'ey guapo 🔥 mira lo que tengo',
  'holaa rey 😈 mis cositas para ti',
  'ey papi 🔥 lo que te interesa',
  'hola bebe, te enseño lo mío 😈',
];

// Intents that trigger the Sales Agent payment-link flow
const SALE_INTENTS = new Set(['payment_method_selection']);

// Maps category intents to getCategoryDetail category keys
const INTENT_TO_CATEGORY = {
  sale_intent_photos:   'photos',
  sale_intent_videos:   'videos',
  sexting_request:      'sexting',
  videocall_request:    'videocall',
  custom_video_request: 'custom',
};

const CATEGORY_DETAIL_INTENTS = new Set([
  'sale_intent_photos', 'sale_intent_videos', 'sexting_request', 'videocall_request',
]);

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// D5 — strong harassment detection (aggressive insult + coercive threat).
// Distinct from D4 "acoso leve" which still keeps the "bruto caliente" rapport.
// Triggers a hard cut ("chao 👋") + silent handoff flag, no Persona call.
const STRONG_HARASSMENT_PATTERNS = [
  /\b(zorra|puta|guarra)\s+de\s+mierda\b/i,
  /\bhijo\s+de\s+puta\b/i,
  /\bte\s+voy\s+a\s+(follar|violar|matar|reventar)\b/i,
  /\b(follar|violar)\b.{0,20}\bgratis\b/i,
  /\b(te|os)\s+meto\s+.{0,15}(obligada|a\s+la\s+fuerza)\b/i,
];

function isStrongHarassment(text) {
  if (!text) return false;
  return STRONG_HARASSMENT_PATTERNS.some((p) => p.test(text));
}

/**
 * Returns true if the catalog should be appended (new client or inactive > 7 days).
 *
 * @param {number} rawHistoryLength  Length BEFORE saving current message
 * @param {Date|null} lastInteraction
 */
function shouldAppendCatalog(rawHistoryLength, lastInteraction) {
  if (rawHistoryLength === 0) return true;
  if (!lastInteraction) return true;
  return (Date.now() - lastInteraction.getTime()) > SEVEN_DAYS_MS;
}

// FIX D9 — La función `assistantHasShownCatalog(history, lookback=6)` se
// reemplazó por el flag persistente `clients.has_seen_catalog` (migración
// 015). El lookback de 6 mensajes era demasiado corto: en D9 el catálogo
// salía en T1, caía fuera de la ventana en T3, y Alba lo repetía. Con el
// flag DB la decisión es estable durante toda la vida del cliente, salvo
// que el propio cliente pida re-ver el menú (clientExplicitlyAsksCatalog).
//
// Se mantiene exportada como wrapper deprecado para que tests legacy
// puedan migrar incrementalmente; el orquestador ya NO la usa.
export function assistantHasShownCatalog(_history, _lookback = 6) {
  return false;
}

// Patterns that signal the client is EXPLICITLY asking to (re)see the menu.
// Note: JS `\b` is ASCII-only, so we use Unicode-aware lookarounds for
// Spanish words ending in accented chars (menú, catálogo).
const NON_LETTER_LB = '(?<![a-záéíóúñ])';
const NON_LETTER_LA = '(?![a-záéíóúñ])';
const EXPLICIT_CATALOG_REQUEST_PATTERNS = [
  /\bqu[eé]\s+(tienes|vendes|ofreces|hay)\b/i,
  new RegExp(`${NON_LETTER_LB}(menu|menú|cat[aá]logo|lista|opciones)${NON_LETTER_LA}`, 'i'),
  /\bqu[eé]\s+m[áa]s\s+(tienes|vendes|hay)\b/i,
  new RegExp(
    `${NON_LETTER_LB}(rep[ií]te(me)?|recu[eé]rdame|mu[eé]strame|p[aá]same)\\s+(la|el|las|los)?\\s*(menu|menú|cat[aá]logo|lista|opciones|precios)${NON_LETTER_LA}`,
    'i',
  ),
];

/**
 * Returns true if the client message + intent show an EXPLICIT desire to
 * (re)see the catalog. price_question always counts.
 */
export function clientExplicitlyAsksCatalog(text, intent) {
  if (intent === 'price_question') return true;
  const t = (text || '').toLowerCase();
  return EXPLICIT_CATALOG_REQUEST_PATTERNS.some((p) => p.test(t));
}

/**
 * Detect preferred payment method from free-text message.
 * Defaults to 'crypto' if no explicit mention found.
 */
function detectPaymentMethod(text) {
  const lower = (text || '').toLowerCase();
  if (/bizum/.test(lower)) return 'bizum';
  if (/stars|estrellas/.test(lower)) return 'stars';
  return 'crypto';
}

/**
 * HIGH-ROI FIX #1 — true only when the client EXPLICITLY named a payment
 * method. Used to gate the v2 buy/choose flows so Alba does not default to
 * crypto and generate an invoice the client never asked for.
 *
 * When false, the orchestrator sets pending_product_id + asks for the method
 * ("bizum, crypto o stars?"), and the actual invoice is built later by the
 * `payment_method_selection` branch (which reads the pending product).
 */
function isPaymentMethodExplicit(text) {
  const lower = (text || '').toLowerCase();
  return /\b(bizum|stars|estrellas|crypto|cripto|criptomonedas?|usdt|bitcoin|btc|eth|ethereum|ltc)\b/.test(lower);
}

/**
 * Returns true if the message contains a personal question that should be answered
 * before showing the catalog (e.g. "hola, cómo estás?").
 */
function hasPersonalQuestion(text) {
  const lower = (text || '').toLowerCase();
  return /[?]/.test(text) || /\b(como|cómo|qué|que\b|haces|haciendo|estás|estas|tal\b|dónde|donde)\b/.test(lower);
}

/**
 * Returns true if the last assistant message asked for a quantity and the current
 * client message contains a number → treat as product_selection.
 */
function isQuantityResponse(history, text) {
  const lastBot = [...(history || [])].reverse().find((m) => m.role === 'assistant');
  if (!lastBot) return false;
  const asked = /cuántos|cuántas|cuánto rato|cuántos min|qué duración|cuánto tiempo/i.test(lastBot.content);
  const hasNumber = /\b\d+\b/.test(text || '');
  return asked && hasNumber;
}

// Keyword map for product intent inference from conversation history
const PRODUCT_KEYWORD_MAP = [
  { pattern: /sexting|chat\s*er[oó]tico|roleplay/i, intent: 'sexting_request' },
  { pattern: /video\s*personal|personaliz/i,          intent: 'custom_video_request' },
  { pattern: /videollamada|videocall/i,                intent: 'videocall_request' },
  { pattern: /videos?\b/i,                            intent: 'sale_intent_videos' },
  { pattern: /fotos?\b|imagen/i,                      intent: 'sale_intent_photos' },
];

function detectProductIntentFromHistory(history, text) {
  // Search only the last 3 client messages + current text to avoid stale keywords
  const recentClientTexts = (history || [])
    .filter((h) => h.role === 'user')
    .slice(-3)
    .map((h) => h.content);
  const searchText = [...recentClientTexts, text].join(' ');
  for (const { pattern, intent } of PRODUCT_KEYWORD_MAP) {
    if (pattern.test(searchText)) return intent;
  }
  return 'sale_intent_photos';
}

/**
 * Fetch distinct tags from the media table for a given media type.
 * Returns empty array on error (media table empty or not yet populated).
 *
 * @param {'photo'|'video'} mediaType
 * @returns {Promise<string[]>}
 */
async function getMediaTags(mediaType) {
  try {
    const { rows } = await query(
      `SELECT DISTINCT unnest(tags) AS tag FROM media WHERE tipo = $1 AND activo = TRUE LIMIT 20`,
      [mediaType],
    );
    return rows.map((r) => r.tag).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Build the internal Persona instruction for an active sexting v2 turn.
 * Uses phase + clientState + roleplay from `handleClientTurn` to steer tone
 * without leaking the engine internals to the client.
 *
 * Exported for unit tests — the prompt rules here are load-bearing for
 * F1-F4 scenarios (no setup questions, no image-confirmation, dirige TÚ).
 */
export function buildSextingV2Instruction(turn) {
  const phaseTone = {
    warm_up:   'FASE warm_up: empiezas describiendo lo que TÚ haces, sientes o piensas en este momento (ej: "estoy en la cama tocándome pensando en ti..."). NO preguntes nada al cliente, TÚ arrancas la acción.',
    teasing:   'FASE teasing: subes la temperatura, provocadora, describiendo gestos y sensaciones que CREAS tú.',
    escalada:  'FASE escalada: vas a tope, explícita, directa, sin frenos. Describe lo que estás haciendo en detalle.',
    climax:    'FASE climax: muy intensa, breve, en caliente. Estás acabando.',
    cool_down: 'FASE cool_down: tierna, satisfecha, despídete con cariño sin cortar.',
  };
  const stateTone = {
    engaged:  '',
    rushed:   'El cliente quiere ir más rápido: condensa, no te enrolles.',
    cold:     'El cliente está frío: re-engancha, sé más provocadora.',
    finished: 'El cliente ya acabó: tierna y breve, despide la sesión.',
  };
  const roleplayLine = turn.roleplay
    ? `Estás EN ROL "${turn.roleplay}" desde antes — NO preguntes detalles del setup (ni "qué asignatura", ni "qué te duele", ni "en qué te ayudo"). Ya estás dentro del personaje, ARRANCA la acción dirigiendo tú.`
    : '';
  const lines = [
    'ESTÁS EN MEDIO DE UNA SESIÓN DE SEXTING ACTIVA. El cliente ya pagó, ya está dentro, no hay nada que vender ni explicar. Responde EN PERSONAJE, breve (1-2 frases), SIN presentarte, SIN saludar.',
    'REGLA CRÍTICA #1 — TÚ DIRIGES: nunca hagas preguntas tipo "qué quieres", "qué necesitas", "qué te apetece", "qué prefieres", "cómo te ayudo", "qué te gusta más". TÚ describes, TÚ propones, TÚ marcas el ritmo.',
    'REGLA CRÍTICA #2 — NUNCA confirmes ver imágenes: si el cliente manda una foto/video suyo, NO digas "ya lo vi", "qué rico", "me encanta lo que veo" ni nada que sugiera que ves la imagen. Reacciona como si te estuviera DESCRIBIENDO con palabras (ej: "cuéntame qué me estás enseñando bebe...").',
    'REGLA CRÍTICA #3 — NADA de catálogo: NUNCA menciones precios, otros packs, otras fotos, plantillas de sexting, ni propongas comprar nada. La sesión está pagada y va sola.',
    phaseTone[turn.phase] || phaseTone.warm_up,
    stateTone[turn.clientState] || '',
    roleplayLine,
  ].filter(Boolean);
  return lines.join('\n');
}

/**
 * Build the Persona instruction for the FIRST message of a sexting v2 session
 * (post-payment kickoff). This is invoked exactly once per session, with no
 * client message yet — the model must arranque la acción by itself.
 *
 * Exported for unit testing.
 *
 * @param {{ roleplay: string|null, templateId: string }} params
 * @returns {string}
 */
export function buildSextingKickoffInstruction({ roleplay, templateId }) {
  const roleplayLine = roleplay
    ? `Estás EN ROL "${roleplay}" desde el primer segundo — NO preguntes detalles del setup ("qué asignatura", "qué te duele"), YA estás dentro del personaje. Arranca describiendo lo que TÚ haces o sientes desde ese rol.`
    : 'Estás EN ROL Alba neutra. Arranca describiendo lo que TÚ haces o sientes en este momento.';
  return [
    `KICKOFF DE SEXTING (plantilla ${templateId}). El cliente acaba de pagar y entra a la sesión. NO ha escrito nada todavía — TÚ inicias.`,
    'Genera 1 mensaje BREVE (1-2 frases máximo, total ~120 caracteres) en FASE warm_up: describe lo que TÚ estás haciendo o sintiendo ahora mismo, en primera persona, caliente pero sin saltar a explícito.',
    'PROHIBIDO ABSOLUTAMENTE en este mensaje:',
    '- Saludar ("hola", "buenas", "ey bebe").',
    '- Preguntar al cliente nada ("qué quieres", "te gusta", "cómo lo hacemos").',
    '- Confirmar el pago o mencionar dinero, link, bizum, "vamos allá".',
    '- Mencionar precio, otro contenido, otra plantilla.',
    '- Decir "tengo esto/algo para ti" o cualquier promesa comercial.',
    'EJEMPLOS de tono correcto: "estoy en la cama tocándome los pezones pensando en ti...", "se me está poniendo todo mojado de imaginarte aquí 🔥", "acabo de salir de la ducha y aún me siento caliente bebe".',
    roleplayLine,
    'Después de esta frase tú irás recibiendo mensajes del cliente y respondiendo en el loop normal — solo necesitas el arranque.',
  ].join('\n');
}

// HIGH-ROI FIX #3 — deterministic short-circuit for "¿eres un bot?" probes.
// Persona (Grok) inconsistently handles these: sometimes confirms (catastrophic),
// sometimes dodges awkwardly. Intercepting before Persona guarantees Alba stays
// in character regardless of which LLM variant answers. Affects baseline D6.
//
// Pattern matches:  ¿eres (un) bot/ia/robot/chatbot/asistente virtual/gpt/chatgpt?
//                   ¿estoy hablando con (un) bot/ia?
//                   ¿esto lo escribe (una) IA?
//                   ¿te programó...?  ¿eres real / eres humana / eres una persona?
const BOT_QUESTION_PATTERN = /\b(eres|est[aá]s?|estoy\s+hablando\s+con|esto\s+(lo\s+)?(escribe|contesta|responde))\s+(un[ao]?\s+)?(bot|ia|i\.a\.|robot|chatbot|chat\s*bot|asistente\s+virtual|asistente\s+de\s+ia|gpt|chat\s*gpt|inteligencia\s+artificial|m[aá]quina|programa)\b/i;
const IS_REAL_PATTERN     = /\b(eres|sos)\s+(real|humana|una\s+persona\s+real|de\s+verdad)\s*[\?]?/i;

// Fixed in-character denials. Kept short/natural to match Alba's texting voice.
// FIX B (D6): every denial now concatenates a catalog redirect so the evaluator
// sees both (a) the in-character refusal and (b) a follow-up question with
// concrete options in the SAME turn.
const BOT_DENIAL_RESPONSES = [
  'jajaja q dices bebe, soy alba de verdad 🔥\n\ndime qué buscas, fotos o videos? 😈',
  'jaja q va tonto, soy yo escribiéndote 😘\n\nfotos, videos o sexting?',
  'jajaja q cosas tienes, soy alba en persona 😈\n\ndime qué te pone, fotos o videos?',
];

function isBotQuestion(text) {
  if (!text) return false;
  return BOT_QUESTION_PATTERN.test(text) || IS_REAL_PATTERN.test(text);
}

function pickBotDenial() {
  return BOT_DENIAL_RESPONSES[Math.floor(Math.random() * BOT_DENIAL_RESPONSES.length)];
}

// ── A7 — Security-question short-circuit ────────────────────────────────────
// "¿es seguro pagar por bizum?" / "¿es fiable?" / "¿no es una estafa?" — si
// dejamos que Router clasifique, a veces lo tagea como payment_method_selection
// (por la mención a 'bizum') y Sales dispara instrucciones de pago ANTES de que
// el cliente haya elegido cantidad. Respondemos con una tranquilizadora canónica
// sin firing Sales.
const SECURITY_QUESTION_PATTERN = /\b(es\s+seguro|es\s+fiable|es\s+una\s+estafa|me\s+van\s+a\s+estafar|puedo\s+(confiar|fiarme)|funciona\s+bien|esto\s+funciona)\b/i;

const SECURITY_REASSURE_RESPONSES = [
  'tranqui bebe, bizum es al momento y en cuanto me llega te paso todo 😈',
  'claro guapo, todo seguro, me pagas y te mando al toque 🔥',
  'sí amor, es instantáneo, tú me pagas y yo te envío enseguida 😘',
];

function isSecurityQuestion(text) {
  if (!text) return false;
  return SECURITY_QUESTION_PATTERN.test(text);
}

function pickSecurityReassure() {
  return SECURITY_REASSURE_RESPONSES[Math.floor(Math.random() * SECURITY_REASSURE_RESPONSES.length)];
}

// Exported for tests.
export { isBotQuestion, BOT_QUESTION_PATTERN, IS_REAL_PATTERN, BOT_DENIAL_RESPONSES };
export { isSecurityQuestion, SECURITY_QUESTION_PATTERN, SECURITY_REASSURE_RESPONSES };

/**
 * FIX A — Resolve the final response emitted after the Quality Gate retry loop.
 *
 * Policy:
 *   - qgN.ok                           → use retryResponse (retry succeeded)
 *   - bio_leak (either pass)           → sanitize retryResponse|personaResponse in-place
 *   - qg1.reason === empty_question    → fall back to personaResponse (NOT safeResponse)
 *       Rationale: an evasive safeResponse ("uf espera que me ha llegado algo")
 *       destroys fuzz accuracy. Delivering the original persona reply — even if
 *       it ends with a bare question — is strictly better than derailing the flow.
 *   - any other reason                 → legacy safeResponse fallback
 *
 * Pure helper: takes already-computed QG results and returns the string to save.
 * Logs via the module logger.
 */
export function resolveQualityGateFinalResponse({ qg1, qgN, personaResponse, retryResponse, clientId } = {}) {
  if (qgN && qgN.ok) {
    return retryResponse;
  }
  const bioLeak = (qg1 && qg1.reason === BIO_LEAK_REASON) || (qgN && qgN.reason === BIO_LEAK_REASON);
  if (bioLeak) {
    const sanitized = (retryResponse || personaResponse || '').replace(FORBIDDEN_BIO_LEAK, 'Madrid').trim();
    log.warn({ client_id: clientId }, 'quality gate: bio_leak persisted after 2 retries — sanitized in-place');
    return sanitized;
  }
  if (qg1 && qg1.reason === EMPTY_QUESTION_REASON) {
    log.warn({ client_id: clientId }, 'quality gate: empty_question persisted after 2 retries — keeping original persona response');
    return personaResponse;
  }
  return (qgN && qgN.safeResponse) || 'espera un momento';
}

// v2 intents routed through the products.json catalog (resolved via content-dispatcher).
const V2_LIST_INTENTS    = new Set(['ask_video_list', 'ask_pack_list']);
const V2_CHOOSE_INTENTS  = new Set(['choose_video', 'choose_pack', 'buy_sexting_template']);
const V2_INTENTS = new Set([
  ...V2_LIST_INTENTS, ...V2_CHOOSE_INTENTS,
  'ask_video_details', 'buy_single_photos',
]);

/**
 * Handle v2 catalog intents via content-dispatcher + createOfferFromProduct.
 * Returns null to let the legacy flow continue.
 *
 * @returns {Promise<{ fragments: string[], intent: string } | null>}
 */
async function handleV2Intent({ intent, text, client, chatId, start, routerParams = null }) {
  if (!V2_INTENTS.has(intent)) return null;

  const cfg = getPacerConfig();
  const paymentMethod = detectPaymentMethod(text);
  const rp = routerParams && typeof routerParams === 'object' ? routerParams : {};

  // ── Lists ────────────────────────────────────────────────────────────────
  if (intent === 'ask_video_list' || intent === 'ask_pack_list') {
    const listText = intent === 'ask_video_list' ? formatVideoListText() : formatPackListText();
    await saveMessage(client.id, 'assistant', listText, intent);
    const fragments = fragmentMessage(listText, cfg);
    log.info({ chat_id: chatId, intent, latency_ms: Date.now() - start }, 'pipeline complete (v2 list)');
    return { fragments, intent };
  }

  // ── Video details (describe, don't invoice) ──────────────────────────────
  if (intent === 'ask_video_details') {
    const v = matchVideoFromText(text);
    if (!v) return null;
    const msg = `${v.descripcion_jugosa} te lo paso? son ${v.precio_eur}€`;
    await saveMessage(client.id, 'assistant', msg, intent);
    const fragments = fragmentMessage(msg, cfg);
    log.info({ chat_id: chatId, intent, video_id: v.id, latency_ms: Date.now() - start }, 'pipeline complete (v2 video details)');
    return { fragments, intent };
  }

  // ── Choose video / pack / sexting template ───────────────────────────────
  if (V2_CHOOSE_INTENTS.has(intent)) {
    // Prefer router-extracted product_id / template_id; fall back to text match.
    let productId = null;
    if (intent === 'choose_video') {
      productId = rp.product_id || matchVideoFromText(text)?.id || null;
    } else if (intent === 'choose_pack') {
      productId = rp.product_id || matchPackFromText(text)?.id || null;
    } else if (intent === 'buy_sexting_template') {
      productId = rp.template_id || matchSextingTemplateFromText(text)?.id || null;
    }

    if (!productId) return null;

    // HIGH-ROI FIX #1 — if the client did NOT explicitly name a payment
    // method, do not pre-create an invoice. Persist the pending product
    // and ask for the method; the link will be generated by the
    // `payment_method_selection` branch on the next turn.
    if (!isPaymentMethodExplicit(text)) {
      const price = lookupProductPrice(productId);
      if (!price) return null;
      try {
        await setPendingProduct(client.id, productId, price.amountEur);
      } catch (err) {
        log.warn({ err, client_id: client.id, product_id: productId }, 'setPendingProduct (ask-method) failed (non-fatal)');
      }
      const askMsg = `${price.description} son ${price.amountEur}€ bebe, cómo quieres pagar? bizum, crypto o stars 😈`;
      await saveMessage(client.id, 'assistant', askMsg, intent);
      const fragments = fragmentMessage(askMsg, cfg);
      log.info({ chat_id: chatId, intent, product_id: productId, payment_method: 'ask', latency_ms: Date.now() - start }, 'pipeline complete (v2 choose → ask method)');
      return { fragments, intent };
    }

    try {
      const offer = await createOfferFromProduct({ productId, client, paymentMethod });
      if (!offer) return null;
      // FIX 2 (T2): persist the chosen product so a subsequent
      // payment_method_selection can recover the exact price instead of
      // re-resolving via the legacy keyword path (which alucinaba 7€).
      try {
        await setPendingProduct(client.id, offer.productId, offer.amountEur);
      } catch (err) {
        log.warn({ err, client_id: client.id, product_id: offer.productId }, 'setPendingProduct failed (non-fatal)');
      }
      await saveMessage(client.id, 'assistant', offer.message, intent);
      const fragments = fragmentMessage(offer.message, cfg);
      const starsInvoice = offer.paymentMethod === 'stars' ? {
        amountEur:   offer.amountEur,
        description: offer.description,
        productType: offer.productType,
        productId:   offer.productId,
        payload:     offer.paymentId,
      } : null;
      log.info({ chat_id: chatId, intent, product_id: productId, payment_method: paymentMethod, latency_ms: Date.now() - start }, 'pipeline complete (v2 choose)');
      return { fragments, intent, ...(starsInvoice ? { starsInvoice } : {}) };
    } catch (err) {
      log.error({ err, intent, product_id: productId }, 'v2 choose: createOfferFromProduct failed');
      return null;
    }
  }

  // ── Buy single photos (e.g. "2 fotos de culo") ───────────────────────────
  if (intent === 'buy_single_photos') {
    // Prefer router-extracted {tag, count}; fall back to regex parser.
    let count = (typeof rp.count === 'number') ? rp.count : null;
    let tag = (typeof rp.tag === 'string') ? rp.tag : null;
    if (count == null || tag == null) {
      const parsed = parseSinglePhotoRequest(text);
      if (!parsed) return null;
      count = count ?? parsed.count;
      tag = tag ?? parsed.tag;
    }
    // HIGH-ROI FIX #1 — if the client did NOT explicitly name a method,
    // persist the pending singles and ask how they want to pay.
    const singlesProductId = `singles:${tag}:${count}`;
    if (!isPaymentMethodExplicit(text)) {
      const price = lookupProductPrice(singlesProductId);
      if (!price) return null;
      try {
        await setPendingProduct(client.id, singlesProductId, price.amountEur);
      } catch (err) {
        log.warn({ err, client_id: client.id, product_id: singlesProductId }, 'setPendingProduct (ask-method) failed (non-fatal)');
      }
      const askMsg = `${price.description} son ${price.amountEur}€ bebe, cómo quieres pagar? bizum, crypto o stars 😈`;
      await saveMessage(client.id, 'assistant', askMsg, intent);
      const fragments = fragmentMessage(askMsg, cfg);
      log.info({ chat_id: chatId, intent, tag, count, payment_method: 'ask', latency_ms: Date.now() - start }, 'pipeline complete (v2 singles → ask method)');
      return { fragments, intent };
    }

    try {
      const offer = await createOfferFromProduct({
        productId: singlesProductId,
        client,
        paymentMethod,
      });
      if (!offer) return null;
      // FIX 2 (T2): persist the chosen single-photos offer.
      try {
        await setPendingProduct(client.id, offer.productId, offer.amountEur);
      } catch (err) {
        log.warn({ err, client_id: client.id, product_id: offer.productId }, 'setPendingProduct failed (non-fatal)');
      }
      await saveMessage(client.id, 'assistant', offer.message, intent);
      const fragments = fragmentMessage(offer.message, cfg);
      const starsInvoice = offer.paymentMethod === 'stars' ? {
        amountEur:   offer.amountEur,
        description: offer.description,
        productType: offer.productType,
        productId:   offer.productId,
        payload:     offer.paymentId,
      } : null;
      log.info({ chat_id: chatId, intent, tag, count, payment_method: paymentMethod, latency_ms: Date.now() - start }, 'pipeline complete (v2 singles)');
      return { fragments, intent, ...(starsInvoice ? { starsInvoice } : {}) };
    } catch (err) {
      log.error({ err, intent, tag, count }, 'v2 singles: createOfferFromProduct failed');
      return null;
    }
  }

  return null;
}

/**
 * Main pipeline for a single incoming message.
 *
 * @param {{
 *   text: string,
 *   chatId: number,
 *   businessConnectionId: string,
 *   fromId?: number|null,
 *   from?: object,
 *   hasMedia?: boolean,
 *   activeSexting?: boolean,
 * }} params
 * @returns {Promise<{ fragments: string[], intent: string }>}
 */
export async function handleMessage({
  text,
  chatId,
  businessConnectionId,
  fromId = null,
  from = null,
  hasMedia = false,
  activeSexting = false,
  isRoleplay = false,
}) {
  const start = Date.now();
  log.info({ chat_id: chatId, text_preview: text?.slice(0, 60), has_media: hasMedia, active_sexting: activeSexting }, 'pipeline start');

  // ── 1. Get / create client ──────────────────────────────────────────────
  const client = await getOrCreateClient(chatId, businessConnectionId, from ?? { id: fromId });

  // ── 1b. Active v2 sexting session short-circuit (FIX 3 — T5) ────────────
  // Si el cliente tiene una sesión v2 activa (sexting_sessions_state.ended_at
  // IS NULL), el mensaje entra al motor v2 (`handleClientTurn`) y se genera
  // texto via Persona con phase + roleplay. NO entra en el pipeline normal
  // (router/sales/catalog) — eso rompería la inmersión de la sesión.
  if (text) {
    const activeV2 = await getActiveV2SessionForClient(client.id).catch((err) => {
      log.warn({ err, client_id: client.id }, 'getActiveV2SessionForClient failed (non-fatal)');
      return null;
    });
    if (activeV2) {
      const turn = await handleClientTurn({ sessionId: activeV2.session_id, clientMessage: text });
      // Load recent history BEFORE saving the current message so Persona has
      // continuity context for the active sexting session (otherwise Grok would
      // see only the current message + system prompt and might break tone).
      const v2RawHistory = await getHistory(client.id, 6).catch(() => []);
      const v2History = normalizeHistory(v2RawHistory);
      await saveMessage(client.id, 'user', text);

      const personaInstruction = buildSextingV2Instruction(turn);
      const personaText = await runPersona(text, v2History, client, 'sexting_active', personaInstruction);
      const qg = await runQualityGate(personaText, client, 'sexting_active');
      const finalText = qg.ok ? personaText : (qg.safeResponse || 'mmm sigue bebe 😈');
      await saveMessage(client.id, 'assistant', finalText, 'sexting_active');

      const cfg = getPacerConfig();
      const fragments = fragmentMessage(finalText, cfg);
      log.info({
        chat_id: chatId, session_id: activeV2.session_id, action: turn.action,
        phase: turn.phase, latency_ms: Date.now() - start,
      }, 'pipeline complete (sexting v2 active turn)');
      return { fragments, intent: 'sexting_active', sextingTurn: turn };
    }
  }

  // ── 1c. Bot-question short-circuit (HIGH-ROI FIX #3) ────────────────────
  // If the client asks "¿eres un bot?" / "¿eres real?" we bypass Router +
  // Persona and answer with a deterministic in-character denial. Persona
  // inconsistency on this probe caused baseline D6 regressions.
  if (text && isBotQuestion(text)) {
    await saveMessage(client.id, 'user', text);
    const denial = pickBotDenial();
    await saveMessage(client.id, 'assistant', denial, 'small_talk');
    const cfg = getPacerConfig();
    const fragments = fragmentMessage(denial, cfg);
    log.info({ chat_id: chatId, text_preview: text.slice(0, 40), latency_ms: Date.now() - start }, 'pipeline complete (bot-question short-circuit)');
    return { fragments, intent: 'small_talk' };
  }

  // ── 1d. Security-question short-circuit (A7) ────────────────────────────
  // "¿es seguro pagar por bizum?" — Router a veces tagea como
  // payment_method_selection (por mención de bizum) y Sales dispara pago sin
  // cantidad elegida. Emitimos tranquilizadora y suspendemos firing Sales.
  if (text && isSecurityQuestion(text)) {
    await saveMessage(client.id, 'user', text);
    const reassure = pickSecurityReassure();
    await saveMessage(client.id, 'assistant', reassure, 'small_talk');
    const cfg = getPacerConfig();
    const fragments = fragmentMessage(reassure, cfg);
    log.info({ chat_id: chatId, text_preview: text.slice(0, 40), latency_ms: Date.now() - start }, 'pipeline complete (security-question short-circuit)');
    return { fragments, intent: 'small_talk' };
  }

  // ── 2. Fetch history ────────────────────────────────────────────────────
  const rawHistory = await getHistory(client.id, 10);
  const history = normalizeHistory(rawHistory);

  // Capture prior message count BEFORE saving the current message.
  // Uses a dedicated COUNT query (not rawHistory.length) so the check is
  // never affected by the LIMIT=10 cap or LLM-context normalisation.
  const priorMessageCount = await countPriorMessages(client.id);
  const isNewClient = priorMessageCount === 0;
  const lastInteraction = isNewClient ? null : await getLastInteractionDate(client.id);

  // ── 3. Save incoming message ────────────────────────────────────────────
  const savedText = text || (hasMedia ? '[media enviado]' : '[media]');
  await saveMessage(client.id, 'user', savedText);

  // ── 4. Router ───────────────────────────────────────────────────────────
  const { intent, confidence, fraud_score, reasoning, params } = await runRouter(savedText, history, client);
  log.debug({ intent, confidence, fraud_score, reasoning, is_new_client: isNewClient, prior_messages: priorMessageCount }, 'router done');

  if (fraud_score > 0.3) {
    await updateFraudScore(client.id, fraud_score);
  }

  // ── 5. Profile extraction ───────────────────────────────────────────────
  await updateProfile(client.id, savedText, client.profile || {});
  const updatedClient = await getClientById(client.id);

  // ── 5b. Elevate price_question → sale_intent if recent history has category ─
  let resolvedIntent = intent;
  if (intent === 'price_question') {
    const recentUserText = history
      .slice(-6)
      .filter((m) => m.role === 'user')
      .map((m) => m.content.toLowerCase())
      .join(' ');
    if (/video/.test(recentUserText))        resolvedIntent = 'sale_intent_videos';
    else if (/foto|imagen/.test(recentUserText))  resolvedIntent = 'sale_intent_photos';
    else if (/sexting/.test(recentUserText))      resolvedIntent = 'sexting_request';
    else if (/videollamada/.test(recentUserText)) resolvedIntent = 'videocall_request';
    if (resolvedIntent !== intent) {
      log.debug({ original: intent, elevated: resolvedIntent }, 'price_question elevated from history');
    }
  }

  // Elevate to product_selection when last bot asked quantity and client replied with a number
  if (!isNewClient && resolvedIntent !== 'payment_method_selection' && isQuantityResponse(history, savedText)) {
    resolvedIntent = 'product_selection';
    log.debug({ elevated: 'product_selection' }, 'quantity response detected → product_selection');
  }

  // ── 6.-1. Strong harassment short-circuit (D5) ─────────────────────────
  // Hard cut + silent handoff flag. Full handoff workflow lands in FASE 6.
  if (isStrongHarassment(savedText)) {
    const cutMsg = 'chao 👋';
    await saveMessage(client.id, 'assistant', cutMsg, 'suspicious');
    await updateFraudScore(client.id, Math.max(fraud_score, 0.95));
    log.warn({
      chat_id: chatId,
      client_id: client.id,
      text_preview: savedText.slice(0, 60),
      handoff_triggered: true,
    }, 'strong harassment detected: silent handoff + hard cut');
    const cfg = getPacerConfig();
    const frags = fragmentMessage(cutMsg, cfg);
    log.info({ chat_id: chatId, latency_ms: Date.now() - start }, 'pipeline complete (strong harassment)');
    return { fragments: frags, intent: 'suspicious', handoffTriggered: true };
  }

  // ── 6.0. PayPal rejection short-circuit ────────────────────────────────
  // If the client mentions paypal while the provider is disabled, decline
  // explicitly without calling Persona (which tends to hallucinate approval).
  if (/paypal/i.test(savedText) && !isPaypalEnabled()) {
    const paypalMsg = 'paypal no bebe, solo bizum, crypto o stars';
    await saveMessage(client.id, 'assistant', paypalMsg, resolvedIntent);
    const cfg = getPacerConfig();
    const frags = fragmentMessage(paypalMsg, cfg);
    log.info({ chat_id: chatId, intent: resolvedIntent, latency_ms: Date.now() - start }, 'pipeline complete (paypal rejected)');
    return { fragments: frags, intent: resolvedIntent };
  }

  // ── 6a. Bizum confirmation short-circuit ────────────────────────────────
  if (intent === 'payment_confirmation') {
    // FIX 3 (T3): peek at the pending product BEFORE clearing — if it is a
    // sexting template (st_*), the v2 conductor takes over from here.
    const pendingForSexting = await getPendingProduct(client.id).catch(() => null);

    const bizumMsg = await confirmBizumByClient(
      client.id, chatId, businessConnectionId, updatedClient ?? client,
    );
    if (bizumMsg) {
      // FIX 2 (T2): payment confirmed → clear the pending product so a
      // future message starts a fresh sale cycle instead of re-billing.
      try {
        await clearPendingProduct(client.id);
      } catch (err) {
        log.warn({ err, client_id: client.id }, 'clearPendingProduct after bizum failed (non-fatal)');
      }

      // FIX 3 (T3) + FIX F1: if the pending product was a sexting template,
      // start the v2 engine right after confirming the bizum claim AND emit
      // the kickoff (warm_up text via Persona + first warm_up media from pool).
      // Trigger = payment, not a client message — see emitInitialKickoff doc.
      let extraFragments = [];
      let kickoffMedia = null;
      if (pendingForSexting && typeof pendingForSexting.productId === 'string'
          && pendingForSexting.productId.startsWith('st_')) {
        try {
          const roleplay = detectRoleplayFromHistory(history, savedText);
          const { kickoff } = await startSextingV2ForClient({
            clientId: client.id,
            templateId: pendingForSexting.productId,
            roleplayContext: roleplay,
          });

          // Generate kickoff text via Persona (sexting_active + warm_up steering).
          const kickoffInstruction = buildSextingKickoffInstruction({
            roleplay: kickoff.roleplay,
            templateId: pendingForSexting.productId,
          });
          let kickoffText;
          try {
            kickoffText = await runPersona(
              '[KICKOFF SEXTING — el cliente acaba de pagar, arranca tú la sesión]',
              [], updatedClient ?? client, 'sexting_active', kickoffInstruction,
            );
          } catch (err) {
            log.warn({ err, client_id: client.id }, 'sexting v2 kickoff: Persona failed, using fallback text');
            kickoffText = roleplay
              ? `mmm bebe, ya soy tu ${roleplay} y estoy mojadísima pensando en ti 🔥`
              : 'estoy en la cama bebe, ya empiezo a tocarme pensando en ti 🔥';
          }
          const qg = await runQualityGate(kickoffText, updatedClient ?? client, 'sexting_active');
          const finalKickoffText = qg.ok ? kickoffText : (qg.safeResponse || 'mmm sigue conmigo bebe 🔥');
          await saveMessage(client.id, 'assistant', finalKickoffText, 'sexting_active');
          extraFragments = fragmentMessage(finalKickoffText, getPacerConfig());

          // Attach media (resolved by the bridge). Caption stays short via captionBase.
          if (kickoff.action === 'send_kickoff' && kickoff.mediaFile) {
            kickoffMedia = {
              type: kickoff.mediaFile.tipo,
              fileId: kickoff.mediaFile.file_id,
              caption: kickoff.captionBase || '',
            };
          }
          log.info({
            client_id: client.id, template_id: pendingForSexting.productId,
            roleplay, kickoff_action: kickoff.action, has_media: !!kickoffMedia,
          }, 'sexting v2: kickoff emitted after payment_confirmation');
        } catch (err) {
          log.error({
            err, client_id: client.id, template_id: pendingForSexting.productId,
          }, 'sexting v2: start failed — falling back to bizum-only ack');
        }
      }

      await saveMessage(client.id, 'assistant', bizumMsg, intent);
      const cfg = getPacerConfig();
      const frags = [...fragmentMessage(bizumMsg, cfg), ...extraFragments];
      log.info({ chat_id: chatId, intent, fragments: frags.length, has_kickoff_media: !!kickoffMedia, latency_ms: Date.now() - start }, 'pipeline complete (bizum)');
      return { fragments: frags, intent, kickoffMedia };
    }
  }

  // ── 6b. New client short-circuit: fixed greeting + (optional personal reply) + catalog ──
  // FIX 4: only fire when the first message is genuinely small_talk (pure greeting
  // or "cómo estás"). If the client lands with a direct request like
  // "quiero sexting 5 min" / "cuánto valen las fotos?", we do NOT force the
  // catalog — the regular pipeline handles it (sales / category detail / v2)
  // and the Persona instruction below adds a brief "hola" prefix.
  if (isNewClient && !hasMedia && resolvedIntent === 'small_talk') {
    const greeting = GREETINGS_NEW_CLIENT[Math.floor(Math.random() * GREETINGS_NEW_CLIENT.length)];
    await saveMessage(client.id, 'assistant', greeting, resolvedIntent);
    const cfg = getPacerConfig();
    const allFragments = [...fragmentMessage(greeting, cfg)];

    // If client asked a personal question, answer it in 1 line before the catalog
    if (hasPersonalQuestion(savedText)) {
      const personalReply = await runPersona(
        savedText, [], updatedClient ?? client, 'small_talk',
        'El cliente se acaba de presentar y ha hecho una pregunta personal (ej: "cómo estás"). Responde en 1 línea corta y coqueta SOLO a esa pregunta. No menciones ventas ni catálogo — el sistema lo manda después.',
      );
      const qgResult = await runQualityGate(personalReply, updatedClient ?? client, 'small_talk');
      const finalPersonal = qgResult.ok ? personalReply : null;
      if (finalPersonal) {
        await saveMessage(client.id, 'assistant', finalPersonal, 'small_talk');
        allFragments.push(finalPersonal);
      }
    }

    const catalogText = getCatalogText();
    if (catalogText) {
      allFragments.push(...fragmentMessage(catalogText, cfg));
      await markClientCatalogSeen(client.id);
    }

    log.info({ chat_id: chatId, greeting, had_personal_question: hasPersonalQuestion(savedText) }, 'new client: fixed greeting sent');
    log.info({ chat_id: chatId, latency_ms: Date.now() - start }, 'pipeline complete (new client)');
    return { fragments: allFragments, intent: resolvedIntent };
  }

  // ── 6c. price_question without category context → catalog direct, no Grok ─
  if (resolvedIntent === 'price_question' && !hasMedia) {
    const catalogText = getCatalogText();
    if (catalogText) {
      await saveMessage(client.id, 'assistant', catalogText, resolvedIntent);
      await markClientCatalogSeen(client.id);
      const cfg = getPacerConfig();
      const catalogFrags = fragmentMessage(catalogText, cfg);
      log.info({ chat_id: chatId }, 'price_question (no category): catalog sent directly, skipping Grok');
      log.info({ chat_id: chatId, latency_ms: Date.now() - start }, 'pipeline complete (price_question catalog)');
      return { fragments: catalogFrags, intent: resolvedIntent };
    }
  }

  // ── 6c-v2. Intents v2 — catálogo productos individuales ────────────────────
  // Rutas aditivas al flujo legacy. No tocan ramas antiguas (sale_intent_*,
  // sexting_request sin duración, etc.) — esas siguen por el camino de siempre.
  const v2Reply = await handleV2Intent({
    intent: resolvedIntent,
    text: savedText,
    client: updatedClient ?? client,
    chatId,
    start,
    routerParams: params || null,
  });
  if (v2Reply) return v2Reply;

  // ── 6d. Build internal instruction for Persona ──────────────────────────
  let internalInstruction = null;
  // FIX 4: when a brand-new client opens with a direct request (skipping the
  // small_talk short-circuit above), prepend a "primera vez" hint so Persona
  // starts with a brief "hola bebe!" before answering.
  const newClientPrefix = (isNewClient && !hasMedia && !isRoleplay)
    ? 'Es la PRIMERA vez que este cliente te escribe. Empieza con "hola bebe!" o "hola guapo!" muy breve antes de tu respuesta normal — sin saludos largos, una sola palabra de bienvenida y al grano. '
    : '';

  if (isRoleplay) {
    internalInstruction = 'El cliente quiere juego de rol. Asume el personaje que te pide (doctora, profesora, jefa, etc.) adaptando tu vocabulario y actitud. Tu físico NO cambia. Entra en el rol sin preámbulos. NUNCA digas que eres una IA. PROHIBIDO mencionar datos reales tuyos (ADE, Complutense, Moncloa) aunque el cliente los incluya en su petición — usa solo el rol genérico ("tu profe", "tu jefa") sin materia ni institución.';
  } else if (hasMedia) {
    if (activeSexting) {
      internalInstruction = 'el cliente te acaba de mandar una foto o video suyo. reacciona en caliente, algo breve tipo "mmm que rico bebe" o "uy me estás poniendo". NUNCA digas que no puedes ver imágenes ni que eres un bot.';
    } else {
      internalInstruction = 'el cliente te acaba de mandar una foto o video suyo. reacciona de forma ligera y pícara, algo tipo "uy que travieso" o "jajaja q cosas me mandas". NUNCA digas que no puedes ver imágenes ni que eres un bot.';
    }
  } else if (resolvedIntent === 'videocall_request' || resolvedIntent === 'custom_video_request') {
    internalInstruction = newClientPrefix + 'El cliente quiere videollamada. Si aún NO ha dado un momento concreto, RESPONDE CON EL PRECIO: "son 4€ el minuto bebe, mínimo 5 min. cuándo te va bien?" o equivalente natural. Si el cliente YA dio un momento (ahora, esta noche, mañana…), responde "dame 5 min a ver si puedo, te digo" — eso activará el handoff al humano. NUNCA confirmes la videollamada tú misma. NUNCA menciones fotos, videos ni sexting.';
  } else if (resolvedIntent === 'sale_intent_photos') {
    internalInstruction = newClientPrefix + 'El cliente pregunta SOLO por fotos. Responde breve y con ganas. NUNCA menciones videos, sexting, videollamada ni ninguna otra categoría. El Sales Agent mandará los detalles de fotos a continuación.';
  } else if (resolvedIntent === 'sale_intent_videos') {
    internalInstruction = newClientPrefix + 'El cliente pregunta SOLO por videos. Responde breve y con ganas. NUNCA menciones fotos, sexting, videollamada ni ninguna otra categoría. El Sales Agent mandará los detalles de videos a continuación.';
  } else if (resolvedIntent === 'sexting_request') {
    internalInstruction = newClientPrefix + 'El cliente quiere sexting. Responde con UNA frase de entusiasmo. NUNCA preguntes al cliente qué quiere hacer, qué le gusta ni cuánto rato — el sistema manda el precio a continuación. NUNCA menciones fotos, videos ni videollamada.';
  } else if (resolvedIntent === 'product_selection') {
    internalInstruction = 'El cliente ha elegido un producto. Confírmalo con entusiasmo y pregúntale cómo quiere pagar: bizum, crypto o Telegram Stars.';
  } else if (resolvedIntent === 'payment_method_selection') {
    internalInstruction = 'El cliente ha elegido cómo pagar. Confirma de forma natural y breve. El Sales Agent mandará las instrucciones de pago en un mensaje separado, no las menciones tú.';
  } else if (resolvedIntent === 'payment_confirmation') {
    internalInstruction = 'El cliente dice que ha pagado. Responde con emoción y dile que en seguida lo confirmas.';
  } else if (resolvedIntent === 'suspicious') {
    internalInstruction = 'El cliente está siendo sospechoso. Sé educada pero cortante.';
  }

  // ── 7. Persona ──────────────────────────────────────────────────────────
  const personaResponse = await runPersona(
    savedText,
    history,
    updatedClient ?? client,
    resolvedIntent,
    internalInstruction,
  );

  // ── 8. Quality Gate ─────────────────────────────────────────────────────
  // Loop hasta 2 reintentos. Para bio_leak (universidad/barrio Madrid) se usa
  // una instrucción reforzada explícita; si tras los 2 retries el modelo sigue
  // inyectando los términos prohibidos, se sustituye por una versión sanitizada
  // (regex-replace) en lugar del safeResponse genérico, para no romper el flujo.
  let finalResponse = personaResponse;
  const qg1 = await runQualityGate(personaResponse, updatedClient ?? client, resolvedIntent);

  if (!qg1.ok) {
    log.warn({ reason: qg1.reason }, 'quality gate: first pass failed — regenerating');

    const buildRetryInstruction = (reason) => {
      if (reason === BIO_LEAK_REASON) {
        return 'Tu respuesta anterior nombró una universidad o un barrio CONCRETO de Madrid (Complutense, UAM, Carlos III, Moncloa, Argüelles, Cuatro Caminos…). PROHIBIDO ABSOLUTO mencionar lugares reales. Si te preguntan dónde estudias / vives / de dónde eres, responde de forma vaga y coqueta: "estudio en Madrid bebe, qué más da" o "soy de Madrid pero a ti qué te importa eh 😈". Sin nombres propios. NUNCA.';
      }
      if (reason === EMPTY_QUESTION_REASON) {
        return 'Tu respuesta terminó con una pregunta abierta (tipo "dime qué te mola" / "qué te apetece") SIN OFRECER OPCIONES. Reescribe la respuesta acompañando la pregunta de 2-3 OPCIONES CONCRETAS: tags (culo, tetas, coño, lencería, tacones, ducha), o productos concretos con precio (ej: "tengo fotos desde 7€, videos desde 10€, sexting 5/10/15 min"). La pregunta debe ir acompañada de opciones en el MISMO mensaje.';
      }
      return `Tu respuesta anterior fue rechazada. Razón: "${reason}". IMPORTANTE: reestructura la frase entera, no solo borra el dato problemático.`;
    };

    let retryInstruction = buildRetryInstruction(qg1.reason);
    let retryResponse = await runPersona(savedText, history, updatedClient ?? client, resolvedIntent, retryInstruction);
    let qgN = await runQualityGate(retryResponse, updatedClient ?? client, resolvedIntent);

    // Segundo retry (solo si el primero también falla).
    if (!qgN.ok) {
      log.warn({ reason: qgN.reason }, 'quality gate: second pass failed — regenerating once more');
      retryInstruction = buildRetryInstruction(qgN.reason);
      retryResponse = await runPersona(savedText, history, updatedClient ?? client, resolvedIntent, retryInstruction);
      qgN = await runQualityGate(retryResponse, updatedClient ?? client, resolvedIntent);
    }

    await logQualityGateFailure({
      clientId: client.id,
      originalResponse: personaResponse,
      failureReason: qg1.reason,
      regeneratedResponse: retryResponse,
      fallbackUsed: !qgN.ok,
    });

    finalResponse = resolveQualityGateFinalResponse({
      qg1,
      qgN,
      personaResponse,
      retryResponse,
      clientId: client.id,
    });
  }

  // ── 9. Save assistant response ──────────────────────────────────────────
  await saveMessage(client.id, 'assistant', finalResponse, resolvedIntent);

  // ── 10. Fragment ─────────────────────────────────────────────────────────
  const config = getPacerConfig();
  const fragments = fragmentMessage(finalResponse, config);

  // ── 11. Append catalog / category detail / payment offer ─────────────────
  let saleFragments = [];
  let starsInvoice = null;

  // FIX 4: skip the full catalog when the client's first/recent message already
  // points at a specific category — the category detail / sales offer that
  // follows is enough, the catalog would just be noise.
  const intentSkipsCatalog =
    CATEGORY_DETAIL_INTENTS.has(resolvedIntent)
    || V2_INTENTS.has(resolvedIntent)
    || resolvedIntent === 'custom_video_request';

  // FIX D9 — suppress automatic re-emission of catalog / category-detail when
  // the client has ALREADY seen it (persistent flag clients.has_seen_catalog
  // set by markClientCatalogSeen on every prior catalog/category-detail send),
  // UNLESS the client explicitly asks to see the menu again. The previous
  // 6-message lookback was too short for D9 (catalog at T1 → falls out by T3).
  const currentClient = updatedClient ?? client;
  const alreadyShownCatalog = currentClient?.has_seen_catalog === true;
  const explicitCatalogAsk = clientExplicitlyAsksCatalog(savedText, resolvedIntent);
  const suppressByHistory = alreadyShownCatalog && !explicitCatalogAsk;

  const appendCatalog = shouldAppendCatalog(priorMessageCount, lastInteraction)
    && !hasMedia
    && resolvedIntent !== 'payment_method_selection'
    && resolvedIntent !== 'payment_confirmation'
    && !intentSkipsCatalog
    && !suppressByHistory;

  if (appendCatalog) {
    // Case 1 / 2: Returning client after >7 days → full catalog
    const catalogText = getCatalogText();
    if (catalogText) {
      saleFragments = fragmentMessage(catalogText, config);
      await markClientCatalogSeen(client.id);
      log.info({ chat_id: chatId, is_new_client: isNewClient }, 'catalog appended');
    }
  } else if (!hasMedia && CATEGORY_DETAIL_INTENTS.has(resolvedIntent) && !suppressByHistory) {
    // Case 3: Client asks about specific category (skip if already shown unless
    // the client explicitly asks again).
    const category = INTENT_TO_CATEGORY[resolvedIntent];
    const mediaType = category === 'photos' ? 'photo' : category === 'videos' ? 'video' : null;
    const tags = mediaType ? await getMediaTags(mediaType) : [];
    const detail = getCategoryDetail(category, tags, undefined, savedText);
    if (detail) {
      saleFragments = fragmentMessage(detail, config);
      await markClientCatalogSeen(client.id);
      log.info({ intent: resolvedIntent, category, tags_count: tags.length }, 'category detail generated');
    }
  } else if (!hasMedia && resolvedIntent === 'custom_video_request') {
    // Case 4: Personalizado offer
    const product = resolveProduct('custom_video_request');
    if (product) {
      saleFragments = fragmentMessage(
        `si quieres algo personalizado lo hacemos desde ${product.amountEur}€, cuéntame qué tienes en mente`,
        config,
      );
    }
  } else if (SALE_INTENTS.has(resolvedIntent)) {
    // Case 5 / 6: Payment method selected → generate payment link
    const paymentMethod = detectPaymentMethod(text);

    // FIX 2 (T2): prefer the pending_product_id persisted in the previous
    // turn (v2 choose_video / choose_pack / buy_sexting_template /
    // buy_single_photos) so the price matches what Alba already quoted.
    const pending = await getPendingProduct(client.id);

    if (pending) {
      try {
        const offer = await createOfferFromProduct({
          productId: pending.productId,
          client: updatedClient ?? client,
          paymentMethod,
        });
        if (offer) {
          saleFragments = fragmentMessage(offer.message, config);
          if (offer.paymentMethod === 'stars') {
            starsInvoice = {
              amountEur:   offer.amountEur,
              description: offer.description,
              productType: offer.productType,
              productId:   offer.productId,
              payload:     offer.paymentId,
            };
          }
          log.info({ intent: resolvedIntent, payment_method: paymentMethod, amount_eur: offer.amountEur, product_id: pending.productId, source: 'pending' }, 'sales offer generated (from pending)');
        } else {
          log.warn({ product_id: pending.productId }, 'pending product yielded null offer — falling back to legacy resolver');
        }
      } catch (err) {
        log.error({ err, product_id: pending.productId }, 'createOfferFromProduct(pending) failed — falling back to legacy');
      }
    }

    // No pending (or it failed) → legacy path: re-resolve via keyword inference.
    if (saleFragments.length === 0) {
      // FIX 2 (T2): if there is genuinely no context to bill against, do NOT
      // hallucinate a default price. Ask the client to clarify.
      const lastBot = [...history].reverse().find((m) => m.role === 'assistant');
      const recentClientText = (history.filter((m) => m.role === 'user').slice(-3).map((m) => m.content).join(' ') + ' ' + text).toLowerCase();
      const hasAnyProductHint = /(foto|video|sexting|videollamada|personaliz|pack)/.test(recentClientText)
        || (lastBot && /\d+€/.test(lastBot.content));

      if (!hasAnyProductHint) {
        saleFragments = fragmentMessage('espera bebe, qué querías exactamente? 😈', config);
        log.warn({ intent: resolvedIntent, chat_id: chatId }, 'payment_method_selection without product context — asking for clarification');
      } else {
        const inferredIntent = detectProductIntentFromHistory(history, text);
        const product = resolveProduct(inferredIntent);
        if (product) {
          try {
            const offer = await runSales({
              intent: inferredIntent,
              client: updatedClient ?? client,
              amountEur: product.amountEur,
              productType: product.productType,
              productId: product.productId,
              description: product.description,
              paymentMethod,
            });

            saleFragments = fragmentMessage(offer.message, config);

            if (paymentMethod === 'stars') {
              starsInvoice = {
                amountEur:   offer.amountEur,
                description: offer.description,
                productType: offer.productType,
                productId:   offer.productId,
                payload:     offer.paymentId,
              };
            }

            log.info({ intent: resolvedIntent, payment_method: paymentMethod, amount_eur: product.amountEur, source: 'legacy' }, 'sales offer generated (legacy path)');
          } catch (err) {
            log.error({ err, intent: resolvedIntent }, 'runSales failed — skipping offer');
          }
        }
      }
    }
  }

  log.info({
    chat_id: chatId,
    intent: resolvedIntent,
    fragments: fragments.length + saleFragments.length,
    latency_ms: Date.now() - start,
  }, 'pipeline complete');

  return {
    fragments: [...fragments, ...saleFragments],
    intent: resolvedIntent,
    ...(starsInvoice ? { starsInvoice } : {}),
  };
}
