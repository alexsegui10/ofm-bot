import { callOpenRouter } from '../lib/llm-client.js';
import { getPersonaContent } from '../lib/persona-config.js';
import { env } from '../config/env.js';
import { agentLogger } from '../lib/logger.js';
import { getClientTier } from './profile-manager.js';

const log = agentLogger('persona');

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

  return `${maxPriorityInstruction}\n\n---\n${personaContent}\n\n---\n${roleplayRule}${noPromiseRule}\n\n${firstPersonRule}\n${noRepeatRule}\n\n---\n${clientCtx}`;
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
  const cleaned = (response || '')
    .replace(/^(Assistant|Human|User|Alba|Cliente)\s*:\s*/i, '')
    .replace(/^#+\s+\S.*\n?/m, '') // strip stray markdown headers
    .trim();

  log.info({
    intent,
    latency_ms: Date.now() - start,
    response_length: cleaned.length,
    tier: getClientTier(client),
  }, 'persona response generated');

  return cleaned;
}
