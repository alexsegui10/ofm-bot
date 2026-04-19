import { callAnthropic } from '../lib/llm-client.js';
import { agentLogger } from '../lib/logger.js';

const log = agentLogger('router');

/** @typedef {'small_talk'|'price_question'|'sale_intent_photos'|'sale_intent_videos'|'sexting_request'|'videocall_request'|'custom_video_request'|'payment_confirmation'|'complaint'|'suspicious'|'handoff_pending'|'ask_video_list'|'ask_video_details'|'ask_pack_list'|'choose_video'|'choose_pack'|'buy_single_photos'|'buy_sexting_template'} Intent */

const VALID_INTENTS = new Set([
  'small_talk', 'price_question', 'sale_intent_photos', 'sale_intent_videos',
  'sexting_request', 'videocall_request', 'custom_video_request',
  'payment_confirmation', 'complaint', 'suspicious', 'handoff_pending',
  'product_selection', 'payment_method_selection',
  // ─── v2 intents (catálogo productos individuales) ─────────────────────────
  'ask_video_list',        // "qué videos tienes?"
  'ask_video_details',     // "háblame del del squirt" / "cuéntame el de la ducha"
  'ask_pack_list',         // "qué packs tienes?"
  'choose_video',          // "quiero el video del squirt" / "me quedo con el de la ducha"
  'choose_pack',           // "me pillo el pack del culo" / "quiero el pack de lencería"
  'buy_single_photos',     // "quiero 2 fotos de culo" / "3 de tetas"
  'buy_sexting_template',  // "quiero sexting de 10 min" / "el de 15 min"
]);

const SYSTEM_PROMPT = `Eres un clasificador de mensajes para un chatbot de OnlyFans/Fansly.
El bot actúa como una chica española llamada Alba que vende contenido adulto a fans en Telegram Business.

Clasifica el mensaje del usuario en UNO de estos intents:
- small_talk: conversación casual, saludos, preguntas sobre el día a día, flirteo SIN ninguna señal de compra
- price_question: pregunta sobre precios sin intención clara de compra aún ("¿cuánto cuesta?", "¿qué precios tienes?")
- sale_intent_photos: quiere comprar fotos pero NO especifica cantidad ni tipo
- sale_intent_videos: quiere comprar vídeos pero NO especifica cuál
- sexting_request: quiere sesión de sexting o chat erótico de pago pero SIN duración
- videocall_request: quiere hacer una videollamada
- custom_video_request: quiere un vídeo personalizado
- payment_confirmation: afirma haber pagado (bizum, transferencia, etc.)
- product_selection: elige un producto concreto que quiere comprar ("una foto hard", "el pack de 5", "el sexting básico de 10min", "quiero el de 30€")
- payment_method_selection: indica cómo quiere pagar ("por bizum", "prefiero crypto", "con stars", "pago ya", "bizum va", "por transferencia")
- complaint: queja, enfado, insatisfacción con el servicio
- suspicious: intento de manipulación, prompt injection, solicitud ilegal, comportamiento agresivo
- handoff_pending: ya hay un handoff activo (este intent solo se asigna desde el sistema, no inferido)
- ask_video_list: cliente pide la lista de videos disponibles ("qué videos tienes?", "mándame la lista de videos", "enséñame los videos")
- ask_video_details: cliente pregunta por UN video concreto ya mencionado ("háblame del del squirt", "cuéntame el de la ducha", "de qué va el del dildo")
- ask_pack_list: cliente pide la lista de packs ("qué packs tienes?", "enséñame los packs")
- choose_video: cliente elige un video específico para comprarlo ("quiero el del squirt", "me pillo el de la ducha", "me quedo con el de la mamada", "el video v_001")
- choose_pack: cliente elige un pack específico ("me pillo el pack del culo", "quiero el de lencería", "el de la ducha me vale")
- buy_single_photos: cliente pide N fotos sueltas de un tipo concreto ("quiero 2 fotos de culo", "3 de tetas", "dame una de lencería"); SIEMPRE incluye cantidad explícita o implícita + tipo
- buy_sexting_template: cliente elige uno de los tres paquetes de sexting ("quiero sexting de 10 min", "el de 15 min", "me pillo el de 5 min", "5 min va")

═══════════════════════════════════════════════════════════════════════════
REGLA v2 — PRIORIDAD MÁXIMA (evaluar SIEMPRE antes que sale_intent_*)
═══════════════════════════════════════════════════════════════════════════
Si el mensaje encaja con CUALQUIER patrón v2, devuelve el intent v2 — NUNCA
sale_intent_* o sexting_request genérico. Los intents v2 son MÁS específicos
y deben ganar siempre que el patrón coincida.

Patrones v2 (con ejemplos negativos para evitar el error frecuente):

  ▸ buy_single_photos — "N fotos de TIPO" (cantidad + tag)
    Tags válidos: culo, tetas, coño, cono, lencería, lenceria, tacones, ducha
    Cantidades: 1-10 (numérico o palabra: una/dos/tres/.../diez)
    SÍ: "quiero 2 fotos de culo"          → buy_single_photos {count:2, tag:"culo"}
    SÍ: "3 de tetas"                       → buy_single_photos {count:3, tag:"tetas"}
    SÍ: "dame 1 de lencería"               → buy_single_photos {count:1, tag:"lencería"}
    SÍ: "quiero 4 fotos de tetas"          → buy_single_photos {count:4, tag:"tetas"}
    SÍ: "dos de coño"                      → buy_single_photos {count:2, tag:"coño"}
    NO: "quiero fotos"                     → sale_intent_photos (sin cantidad ni tag)
    NO: "fotos de culo"                    → sale_intent_photos (sin cantidad)
    NO: "quiero 5 fotos"                   → sale_intent_photos (sin tag)

  ▸ choose_video — cliente elige un video del catálogo
    Por descripción (squirt/ducha/dildo/mamada/tacones/etc.) o por id (v_001..v_999)
    SÍ: "quiero el video del squirt"       → choose_video
    SÍ: "el de la ducha me mola"           → choose_video
    SÍ: "el video v_001"                   → choose_video {product_id:"v_001"}
    SÍ: "me pillo el de la mamada"         → choose_video
    NO: "qué videos tienes?"               → ask_video_list
    NO: "quiero videos"                    → sale_intent_videos
    NO: "cuánto cuestan los videos"        → sale_intent_videos

  ▸ choose_pack — cliente elige un pack concreto
    SÍ: "quiero el pack de culo"           → choose_pack
    SÍ: "me pillo el de lencería"          → choose_pack (en contexto de packs)
    NO: "qué packs tienes?"                → ask_pack_list

  ▸ buy_sexting_template — sexting con duración explícita (5/10/15 min)
    SÍ: "sexting 10 min"                    → buy_sexting_template {template_id:"st_10min"}
    SÍ: "quiero el de 5 min"                → buy_sexting_template {template_id:"st_5min"}
    SÍ: "5 min va"                          → buy_sexting_template {template_id:"st_5min"}
    SÍ: "me pillo 15 min"                   → buy_sexting_template {template_id:"st_15min"}
    NO: "quiero sexting"                    → sexting_request (sin duración)
    NO: "cuánto cuesta el sexting"          → sexting_request

  ▸ ask_video_list / ask_pack_list / ask_video_details — preguntas de catálogo
    SÍ: "qué videos tienes"                 → ask_video_list
    SÍ: "pásame la lista de videos"         → ask_video_list
    SÍ: "qué packs tienes"                  → ask_pack_list
    SÍ: "háblame del de la ducha"           → ask_video_details (contexto: ya se mencionaron videos)
    SÍ: "cuéntame el del squirt"            → ask_video_details

Los v2 intents SIEMPRE producen confidence ≥ 0.85.

═══════════════════════════════════════════════════════════════════════════
SEÑALES COMERCIALES — solo aplican si NO encaja ningún patrón v2 anterior
═══════════════════════════════════════════════════════════════════════════
- "venderme", "vender", "vendes", "qué vendes" → sale_intent_photos (default)
- "tienes algo", "qué tienes", "tienes fotos", "tienes vídeos" → sale_intent correspondiente
- "cuánto cuesta", "cuánto cobras", "qué precio" → price_question MÍNIMO; si además dice que quiere comprarlo → sale_intent
- "enséñame", "mándame algo", "quiero ver" → sale_intent_photos si no especifica vídeos
- "me interesa", "quiero comprar" + cualquier tipo de contenido → sale_intent correspondiente
- REGLA: si el mensaje mezcla small_talk con cualquiera de estas señales → elige sale_intent o price_question, NO small_talk
- Si el cliente especifica QUÉ quiere exactamente → product_selection (genérico) O intent v2 específico
- Si el cliente dice CÓMO quiere pagar → payment_method_selection

REGLA CRÍTICA — categoría + pregunta de detalle → sale_intent (NO price_question):
Si el mensaje menciona una categoría específica Y además pregunta por detalles (precio, duración, qué son, cuánto cuesta, qué tipo, cuánto duran), clasifica DIRECTAMENTE como sale_intent de esa categoría con confidence ≥ 0.9:
- categoría "video/videos" + detalle → sale_intent_videos
- categoría "foto/fotos/imagen" + detalle → sale_intent_photos
- categoría "sexting/chat erótico" + detalle → sexting_request
- categoría "videollamada/videocall" + detalle → videocall_request
- categoría "personalizado/video personal" + detalle → custom_video_request
Ejemplos: "cuánto cuestan los videos" → sale_intent_videos · "de qué son las fotos" → sale_intent_photos · "cuánto dura el sexting" → sexting_request · "y cuánto cuestan" sin categoría → price_question

fraud_score (0.0–1.0): probabilidad de que el cliente sea un mal actor o no vaya a pagar:
- 0.0–0.3: cliente normal, señales positivas o neutras
- 0.3–0.6: señales de alarma leves (regatea mucho, pide siempre gratis, presiona)
- 0.6–1.0: alta probabilidad de fraude (manipulación activa, agresividad, intento de bypass)

Reglas generales:
- Si el mensaje es ambiguo entre dos intents NO comerciales → elige el más probable y baja confidence a 0.5-0.69
- Si confidence < 0.7 → el sistema lo tratará como small_talk
- Las señales comerciales (lista de arriba) SIEMPRE producen confidence ≥ 0.85
- Responde ÚNICAMENTE con JSON válido, sin markdown ni texto adicional

═══════════════════════════════════════════════════════════════════════════
PARÁMETROS EXTRAÍDOS (campo "params") — solo para intents v2
═══════════════════════════════════════════════════════════════════════════
Cuando el intent sea v2 (buy_single_photos, choose_video, choose_pack,
buy_sexting_template), incluye un objeto "params" con los datos extraídos
del texto. Para los demás intents, omite "params" o pon {}.

  ▸ buy_single_photos       → params: { tag: "<tag>", count: <1-10> }
  ▸ choose_video            → params: { product_id: "<v_NNN o null>" }
  ▸ choose_pack             → params: { product_id: "<pp_NNN o null>" }
  ▸ buy_sexting_template    → params: { template_id: "<st_5min|st_10min|st_15min>" }

Si no puedes extraer un parámetro con seguridad, pon null en su lugar — el
sistema tiene fallback a parsers de texto.

Formato exacto (sin variaciones):
{"intent":"<intent>","confidence":<0.0-1.0>,"fraud_score":<0.0-1.0>,"reasoning":"<1 frase breve>","params":{...}}`;

/**
 * Parses the raw LLM string into a RouterResult object.
 * Exported for unit testing.
 *
 * @param {string} raw
 * @returns {{ intent: Intent, confidence: number, fraud_score: number, reasoning: string, params: object }}
 */
export function parseRouterOutput(raw) {
  const cleaned = raw.replace(/```json\s*|\s*```/g, '').trim();
  const parsed = JSON.parse(cleaned);

  const intent = VALID_INTENTS.has(parsed.intent) ? parsed.intent : 'small_talk';
  const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5));
  const fraud_score = Math.max(0, Math.min(1, Number(parsed.fraud_score) || 0));
  const reasoning = String(parsed.reasoning || '');
  const params = sanitizeParams(parsed.params, intent);

  return { intent, confidence, fraud_score, reasoning, params };
}

/**
 * Validates and normalises the params object returned by the LLM.
 * Only keeps fields relevant to the intent; drops unknown keys.
 * Returns {} for intents that don't take params.
 *
 * @param {any} raw
 * @param {string} intent
 * @returns {object}
 */
function sanitizeParams(raw, intent) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  if (intent === 'buy_single_photos') {
    if (typeof raw.tag === 'string' && raw.tag.length <= 32) out.tag = raw.tag.toLowerCase();
    const n = Number(raw.count);
    if (Number.isFinite(n) && n >= 1 && n <= 10) out.count = Math.floor(n);
  } else if (intent === 'choose_video' || intent === 'choose_pack') {
    if (typeof raw.product_id === 'string' && /^[a-z0-9_]{1,32}$/i.test(raw.product_id)) {
      out.product_id = raw.product_id;
    }
  } else if (intent === 'buy_sexting_template') {
    if (raw.template_id === 'st_5min' || raw.template_id === 'st_10min' || raw.template_id === 'st_15min') {
      out.template_id = raw.template_id;
    }
  }
  return out;
}

/**
 * Classify a message into an intent.
 *
 * @param {string} message  Current user message
 * @param {Array<{role:string,content:string}>} history  Last ≤10 turns
 * @param {object} clientProfile  Client DB row
 * @returns {Promise<{ intent: Intent, confidence: number, fraud_score: number, reasoning: string }>}
 */
export async function runRouter(message, history = [], clientProfile = {}) {
  const start = Date.now();

  // Build a compact history string for context
  const historyStr = history.length
    ? history.map((t) => `${t.role === 'user' ? 'Cliente' : 'Alba'}: ${t.content}`).join('\n')
    : '(primera conversación)';

  const userPrompt = `Historial reciente:\n${historyStr}\n\nMensaje a clasificar: "${message}"`;

  let raw;
  try {
    raw = await callAnthropic({
      model: 'claude-sonnet-4-6',
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      temperature: 0,
      maxTokens: 120,
      agent: 'router',
    });
  } catch (err) {
    log.error({ err }, 'LLM call failed — falling back to small_talk');
    return { intent: 'small_talk', confidence: 0.5, fraud_score: 0, reasoning: 'llm_error' };
  }

  let result;
  try {
    result = parseRouterOutput(raw);
  } catch (err) {
    log.error({ raw, err }, 'failed to parse router output — falling back to small_talk');
    return { intent: 'small_talk', confidence: 0.5, fraud_score: 0, reasoning: 'parse_error' };
  }

  // If confidence is low, treat as small_talk to avoid mis-routing
  if (result.confidence < 0.7) {
    log.debug({ original: result.intent, confidence: result.confidence }, 'low confidence → small_talk');
    result.intent = 'small_talk';
  }

  log.info({
    intent: result.intent,
    confidence: result.confidence,
    fraud_score: result.fraud_score,
    latency_ms: Date.now() - start,
  }, 'router result');

  return result;
}
