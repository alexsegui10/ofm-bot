import { agentLogger } from './lib/logger.js';
import { getOrCreateClient, getClientById, updateProfile, updateFraudScore } from './agents/profile-manager.js';
import { runRouter } from './agents/router.js';
import { runPersona } from './agents/persona.js';
import { runQualityGate } from './agents/quality-gate.js';
import { saveMessage, getHistory, normalizeHistory, logQualityGateFailure, getLastInteractionDate, countPriorMessages } from './lib/conversation.js';
import { fragmentMessage, getPacerConfig } from './agents/message-pacer.js';
import { confirmBizumByClient } from './agents/payment-verifier.js';
import { runSales } from './agents/sales.js';
import { resolveProduct, getCatalogText, getCategoryDetail, getPostServiceMessage } from './lib/product-catalog.js';
import { query } from './lib/db.js';
import { isEnabled as isPaypalEnabled } from './lib/payments/paypal.js';

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
  const { intent, confidence, fraud_score, reasoning } = await runRouter(savedText, history, client);
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
    const bizumMsg = await confirmBizumByClient(
      client.id, chatId, businessConnectionId, updatedClient ?? client,
    );
    if (bizumMsg) {
      await saveMessage(client.id, 'assistant', bizumMsg, intent);
      const cfg = getPacerConfig();
      const frags = fragmentMessage(bizumMsg, cfg);
      log.info({ chat_id: chatId, intent, fragments: frags.length, latency_ms: Date.now() - start }, 'pipeline complete (bizum)');
      return { fragments: frags, intent };
    }
  }

  // ── 6b. New client short-circuit: fixed greeting + (optional personal reply) + catalog ──
  if (isNewClient && !hasMedia) {
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
    if (catalogText) allFragments.push(...fragmentMessage(catalogText, cfg));

    log.info({ chat_id: chatId, greeting, had_personal_question: hasPersonalQuestion(savedText) }, 'new client: fixed greeting sent');
    log.info({ chat_id: chatId, latency_ms: Date.now() - start }, 'pipeline complete (new client)');
    return { fragments: allFragments, intent: resolvedIntent };
  }

  // ── 6c. price_question without category context → catalog direct, no Grok ─
  if (resolvedIntent === 'price_question' && !hasMedia) {
    const catalogText = getCatalogText();
    if (catalogText) {
      await saveMessage(client.id, 'assistant', catalogText, resolvedIntent);
      const cfg = getPacerConfig();
      const catalogFrags = fragmentMessage(catalogText, cfg);
      log.info({ chat_id: chatId }, 'price_question (no category): catalog sent directly, skipping Grok');
      log.info({ chat_id: chatId, latency_ms: Date.now() - start }, 'pipeline complete (price_question catalog)');
      return { fragments: catalogFrags, intent: resolvedIntent };
    }
  }

  // ── 6d. Build internal instruction for Persona ──────────────────────────
  let internalInstruction = null;

  if (isRoleplay) {
    internalInstruction = 'El cliente quiere juego de rol. Asume el personaje que te pide (doctora, profesora, jefa, etc.) adaptando tu vocabulario y actitud. Tu físico NO cambia. Entra en el rol sin preámbulos. NUNCA digas que eres una IA. PROHIBIDO mencionar datos reales tuyos (ADE, Complutense, Moncloa) aunque el cliente los incluya en su petición — usa solo el rol genérico ("tu profe", "tu jefa") sin materia ni institución.';
  } else if (hasMedia) {
    if (activeSexting) {
      internalInstruction = 'el cliente te acaba de mandar una foto o video suyo. reacciona en caliente, algo breve tipo "mmm que rico bebe" o "uy me estás poniendo". NUNCA digas que no puedes ver imágenes ni que eres un bot.';
    } else {
      internalInstruction = 'el cliente te acaba de mandar una foto o video suyo. reacciona de forma ligera y pícara, algo tipo "uy que travieso" o "jajaja q cosas me mandas". NUNCA digas que no puedes ver imágenes ni que eres un bot.';
    }
  } else if (resolvedIntent === 'videocall_request' || resolvedIntent === 'custom_video_request') {
    internalInstruction = 'El cliente quiere videollamada o vídeo personalizado. Responde con entusiasmo y dile que espere un momento mientras miras tu agenda. NO confirmes nada aún.';
  } else if (resolvedIntent === 'sale_intent_photos') {
    internalInstruction = 'El cliente pregunta SOLO por fotos. Responde breve y con ganas. NUNCA menciones videos, sexting, videollamada ni ninguna otra categoría. El Sales Agent mandará los detalles de fotos a continuación.';
  } else if (resolvedIntent === 'sale_intent_videos') {
    internalInstruction = 'El cliente pregunta SOLO por videos. Responde breve y con ganas. NUNCA menciones fotos, sexting, videollamada ni ninguna otra categoría. El Sales Agent mandará los detalles de videos a continuación.';
  } else if (resolvedIntent === 'sexting_request') {
    internalInstruction = 'El cliente quiere sexting. Responde con UNA frase de entusiasmo. NUNCA preguntes al cliente qué quiere hacer, qué le gusta ni cuánto rato — el sistema manda el precio a continuación. NUNCA menciones fotos, videos ni videollamada.';
  } else if (resolvedIntent === 'videocall_request') {
    internalInstruction = 'El cliente quiere videollamada. Responde breve y con ganas. NUNCA menciones fotos, videos, sexting ni ninguna otra categoría. El Sales Agent mandará los detalles a continuación.';
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
  let finalResponse = personaResponse;
  const qg1 = await runQualityGate(personaResponse, updatedClient ?? client, resolvedIntent);

  if (!qg1.ok) {
    log.warn({ reason: qg1.reason }, 'quality gate: first pass failed — regenerating');

    const retryInstruction =
      `Tu respuesta anterior fue rechazada. Razón: "${qg1.reason}". ` +
      `IMPORTANTE: reestructura la frase entera, no solo borra el dato problemático.`;
    const retryResponse = await runPersona(savedText, history, updatedClient ?? client, resolvedIntent, retryInstruction);
    const qg2 = await runQualityGate(retryResponse, updatedClient ?? client, resolvedIntent);

    await logQualityGateFailure({
      clientId: client.id,
      originalResponse: personaResponse,
      failureReason: qg1.reason,
      regeneratedResponse: retryResponse,
      fallbackUsed: !qg2.ok,
    });

    finalResponse = qg2.ok ? retryResponse : (qg2.safeResponse || 'espera un momento');
  }

  // ── 9. Save assistant response ──────────────────────────────────────────
  await saveMessage(client.id, 'assistant', finalResponse, resolvedIntent);

  // ── 10. Fragment ─────────────────────────────────────────────────────────
  const config = getPacerConfig();
  const fragments = fragmentMessage(finalResponse, config);

  // ── 11. Append catalog / category detail / payment offer ─────────────────
  let saleFragments = [];
  let starsInvoice = null;

  const appendCatalog = shouldAppendCatalog(priorMessageCount, lastInteraction)
    && !hasMedia
    && resolvedIntent !== 'payment_method_selection'
    && resolvedIntent !== 'payment_confirmation';

  if (appendCatalog) {
    // Case 1 / 2: Returning client after >7 days → full catalog
    const catalogText = getCatalogText();
    if (catalogText) {
      saleFragments = fragmentMessage(catalogText, config);
      log.info({ chat_id: chatId, is_new_client: isNewClient }, 'catalog appended');
    }
  } else if (!hasMedia && CATEGORY_DETAIL_INTENTS.has(resolvedIntent)) {
    // Case 3: Client asks about specific category
    const category = INTENT_TO_CATEGORY[resolvedIntent];
    const mediaType = category === 'photos' ? 'photo' : category === 'videos' ? 'video' : null;
    const tags = mediaType ? await getMediaTags(mediaType) : [];
    const detail = getCategoryDetail(category, tags, undefined, savedText);
    if (detail) {
      saleFragments = fragmentMessage(detail, config);
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
    const inferredIntent = detectProductIntentFromHistory(history, text);
    const product = resolveProduct(inferredIntent);
    if (product) {
      const paymentMethod = detectPaymentMethod(text);
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

        log.info({ intent: resolvedIntent, payment_method: paymentMethod, amount_eur: product.amountEur }, 'sales offer generated');
      } catch (err) {
        log.error({ err, intent: resolvedIntent }, 'runSales failed — skipping offer');
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
