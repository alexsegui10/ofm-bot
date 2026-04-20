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

// ─── Product pricing — photo singles ──────────────────────────────────────────

// Escalated table. Explicit, not a formula, so copy and code agree.
// Max 10 per transaction — por encima, Alba sugiere pack personalizado.
const PHOTO_PRICE_TABLE = Object.freeze({
  1: 7, 2: 12, 3: 15, 4: 18, 5: 22, 6: 25, 7: 28, 8: 31, 9: 34, 10: 37,
});

export const PHOTO_MAX_PER_TX = 10;

/**
 * Price in EUR for `count` individual photos.
 * Throws if count is out of the [1, 10] range — caller should steer the
 * client towards a personalised pack instead of silently clamping.
 *
 * @param {number} count
 * @returns {number}
 */
export function calculatePhotoPrice(count) {
  if (!Number.isInteger(count)) throw new Error(`calculatePhotoPrice: count must be an integer, got ${count}`);
  if (count < 1) throw new Error(`calculatePhotoPrice: count must be >= 1, got ${count}`);
  if (count > PHOTO_MAX_PER_TX) {
    throw new Error(`calculatePhotoPrice: count ${count} exceeds max ${PHOTO_MAX_PER_TX} — suggest custom pack`);
  }
  return PHOTO_PRICE_TABLE[count];
}
