import { callAnthropic } from '../lib/llm-client.js';
import { query } from '../lib/db.js';
import { agentLogger } from '../lib/logger.js';

const log = agentLogger('profile-manager');

const EXTRACT_SYSTEM = `Eres un extractor de información de conversaciones para actualizar perfiles de clientes.
Analiza el mensaje del cliente. Extrae SOLO lo que el cliente menciona EXPLÍCITAMENTE.
NO inventes datos. NO hagas suposiciones.

Campos a extraer (solo si aparecen en el mensaje):
- nombre: nombre propio que menciona el cliente
- gustos: array de intereses o preferencias específicas mencionadas
- tono_preferido: "directo" | "romántico" | "bruto" | "cariñoso" (solo si es muy evidente)
- novedades: objeto con cualquier otro dato personal nuevo {clave: valor}

Responde ÚNICAMENTE con JSON válido. Si no hay nada nuevo, responde exactamente: {}

Ejemplos:
Mensaje "soy Pedro, me gustan las fotos en lencería" → {"nombre":"Pedro","gustos":["fotos lencería"]}
Mensaje "hola qué tal" → {}
Mensaje "me encantan tus vídeos de gym" → {"gustos":["vídeos gym"]}`;

/** @returns {string} Client tier based on spend */
export function getClientTier(client) {
  if (!client) return 'new';
  if (client.total_gastado >= 200) return 'vip';
  if (client.num_compras >= 1) return 'recurrente';
  return 'new';
}

/**
 * Deep-merge profile updates. Arrays are deduplicated unions; scalars overwrite.
 * Exported for unit testing.
 */
export function mergeProfiles(existing = {}, updates = {}) {
  const merged = { ...existing };
  for (const [key, val] of Object.entries(updates)) {
    if (val === null || val === undefined || val === '') continue;
    if (Array.isArray(val) && Array.isArray(merged[key])) {
      merged[key] = [...new Set([...merged[key], ...val])];
    } else if (typeof val === 'object' && !Array.isArray(val) && typeof merged[key] === 'object' && !Array.isArray(merged[key])) {
      merged[key] = { ...(merged[key] || {}), ...val };
    } else {
      merged[key] = val;
    }
  }
  return merged;
}

/**
 * Get or create a client record. Updates business_connection_id on every message.
 *
 * @param {number|string} telegramUserId
 * @param {string} businessConnectionId
 * @param {{ id: number, username?: string, first_name?: string, last_name?: string }|null} from
 * @returns {Promise<object>}
 */
export async function getOrCreateClient(telegramUserId, businessConnectionId, from = null) {
  const userId = BigInt(telegramUserId);

  // Try to find existing
  const { rows } = await query(
    'SELECT * FROM clients WHERE telegram_user_id = $1',
    [userId],
  );

  if (rows.length) {
    // Update connection id and interaction time
    await query(
      `UPDATE clients SET
         business_connection_id = $1,
         ultima_interaccion = NOW(),
         updated_at = NOW()
       WHERE id = $2`,
      [businessConnectionId, rows[0].id],
    );
    log.debug({ client_id: rows[0].id, tier: getClientTier(rows[0]) }, 'client found');
    return { ...rows[0], business_connection_id: businessConnectionId };
  }

  // Create new
  const { rows: created } = await query(
    `INSERT INTO clients
       (telegram_user_id, business_connection_id, username, first_name, last_name, ultima_interaccion)
     VALUES ($1, $2, $3, $4, $5, NOW())
     RETURNING *`,
    [userId, businessConnectionId, from?.username ?? null, from?.first_name ?? null, from?.last_name ?? null],
  );
  log.info({ client_id: created[0].id }, 'new client created');
  return created[0];
}

/**
 * Re-fetch a client record by ID.
 */
export async function getClientById(clientId) {
  const { rows } = await query('SELECT * FROM clients WHERE id = $1', [clientId]);
  return rows[0] ?? null;
}

/**
 * Persist that the catalog (or any category-detail equivalent) has already
 * been shown to this client. Idempotent — flips the flag to TRUE; never resets
 * it. Used by the orchestrator to avoid re-emitting the catalog in turns 2+
 * unless the client EXPLICITLY asks for it (D9 fix).
 *
 * @param {number} clientId
 * @returns {Promise<void>}
 */
export async function markClientCatalogSeen(clientId) {
  if (!clientId) return;
  try {
    await query(
      `UPDATE clients SET has_seen_catalog = TRUE
       WHERE id = $1 AND has_seen_catalog = FALSE`,
      [clientId],
    );
  } catch (err) {
    log.warn({ client_id: clientId, err }, 'markClientCatalogSeen failed (non-fatal)');
  }
}

/**
 * Extract profile updates from the latest message via LLM and persist them.
 * No-ops if the message yields no new info.
 *
 * @param {number} clientId
 * @param {string} message
 * @param {object} existingProfile  Current client.profile JSONB
 */
export async function updateProfile(clientId, message, existingProfile = {}) {
  if (!message?.trim()) return;

  let raw;
  try {
    raw = await callAnthropic({
      model: 'claude-sonnet-4-6',
      system: EXTRACT_SYSTEM,
      messages: [{ role: 'user', content: `Mensaje del cliente: "${message}"` }],
      temperature: 0.2,
      maxTokens: 150,
      agent: 'profile-manager',
    });
  } catch (err) {
    log.error({ clientId, err }, 'profile extraction LLM failed');
    return;
  }

  let updates;
  try {
    const cleaned = raw.replace(/```json\s*|\s*```/g, '').trim();
    updates = JSON.parse(cleaned);
  } catch {
    log.warn({ clientId, raw }, 'profile extraction: non-JSON response, skipping');
    return;
  }

  if (!updates || !Object.keys(updates).length) return;

  const merged = mergeProfiles(existingProfile, updates);

  await query(
    `UPDATE clients SET profile = $1::jsonb, updated_at = NOW() WHERE id = $2`,
    [JSON.stringify(merged), clientId],
  );

  log.debug({ clientId, updates }, 'profile updated');
}

/**
 * Update the client's fraud_score if it exceeds the current value.
 */
export async function updateFraudScore(clientId, fraudScore) {
  await query(
    `UPDATE clients SET fraud_score = GREATEST(fraud_score, $1), updated_at = NOW() WHERE id = $2`,
    [fraudScore, clientId],
  );
}
