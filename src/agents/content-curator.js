// FASE 5 — Content Curator Agent
// Selects media file_ids from catalog based on client profile and purchase type

/**
 * @param {{ clientId: number, productType: string, clientProfile: object }} input
 * @returns {Promise<Array<{ fileId: string, tipo: string, caption?: string }>>}
 */
export async function curate(_input) {
  throw new Error('ContentCurator not implemented yet — FASE 5');
}
