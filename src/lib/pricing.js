// Precios de LLMs — Verificado abril 2026. Re-verificar trimestralmente.
export const LLM_PRICING = {
  'claude-sonnet-4-6': {
    inputPerMTok: 3.00,
    outputPerMTok: 15.00,
    cacheWritePerMTok: 3.75,
    cacheReadPerMTok: 0.30,
    batchDiscount: 0.50,
  },
  'claude-opus-4-6': {
    inputPerMTok: 5.00,
    outputPerMTok: 25.00,
    cacheWritePerMTok: 6.25,
    cacheReadPerMTok: 0.50,
    batchDiscount: 0.50,
  },
};

/**
 * Estimate USD cost for an LLM call.
 * @param {string} model
 * @param {number} inputTokens
 * @param {number} outputTokens
 * @returns {number|null}
 */
export function estimateCost(model, inputTokens, outputTokens) {
  const p = LLM_PRICING[model];
  if (!p) return null;
  return (
    (inputTokens / 1_000_000) * p.inputPerMTok +
    (outputTokens / 1_000_000) * p.outputPerMTok
  );
}
