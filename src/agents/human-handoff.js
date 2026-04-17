// FASE 6 — Human Handoff Agent
// Escalates videocall/custom requests to the operator via WhatsApp + 5-min timer

/**
 * @param {{ clientProfile: object, intent: string, history: Array, businessConnectionId: string, chatId: number }} input
 */
export async function initiateHandoff(_input) {
  throw new Error('HumanHandoff not implemented yet — FASE 6');
}

/**
 * Called when the operator sends a message from their Telegram account.
 * @param {{ clientId: number }} input
 */
export async function resolveHandoff(_input) {
  throw new Error('HumanHandoff not implemented yet — FASE 6');
}
