/**
 * Content Dispatcher — resuelve product_id lógico + selección de fotos sueltas
 * a partir de la tabla `media`.
 *
 * El catálogo (config/products.json) define QUÉ vende Alba con IDs lógicos
 * (v_001, pk_002, ext_m_108). Este módulo traduce eso en los `file_id` reales
 * de Telegram guardados en `media.file_id`, respetando orden (packs / sexting
 * pools) y reservas (reserved_for_sexting).
 */

import { query } from './db.js';
import { agentLogger } from './logger.js';
import { getProducts } from '../config/products.js';

const log = agentLogger('content-dispatcher');

// ─── Resolución por product_id ───────────────────────────────────────────────

/**
 * Devuelve los file_id de un video individual.
 * @param {string} videoId  p.ej. "v_003"
 * @returns {Promise<string|null>}
 */
export async function resolveVideoFileId(videoId) {
  const { rows } = await query(
    `SELECT file_id FROM media
     WHERE product_id = $1 AND tipo = 'video' AND activo = TRUE
     ORDER BY id LIMIT 1`,
    [videoId],
  );
  return rows[0]?.file_id ?? null;
}

/**
 * Devuelve los file_id de un pack de fotos en orden (ordinal ASC).
 * @param {string} packId  p.ej. "pk_001"
 * @returns {Promise<string[]>}
 */
export async function resolvePackFileIds(packId) {
  const { rows } = await query(
    `SELECT file_id FROM media
     WHERE product_id = $1 AND tipo = 'photo' AND activo = TRUE
     ORDER BY ordinal ASC NULLS LAST, id ASC`,
    [packId],
  );
  return rows.map((r) => r.file_id);
}

/**
 * Devuelve el file_id de una media de sexting pool (ext_m_XXX).
 * @param {string} mediaLogicalId  p.ej. "ext_m_108"
 * @returns {Promise<{ file_id: string, tipo: string } | null>}
 */
export async function resolveSextingMedia(mediaLogicalId) {
  const { rows } = await query(
    `SELECT file_id, tipo FROM media
     WHERE product_id = $1 AND reserved_for_sexting = TRUE AND activo = TRUE
     ORDER BY id LIMIT 1`,
    [mediaLogicalId],
  );
  return rows[0] ?? null;
}

// ─── Selección de fotos sueltas ──────────────────────────────────────────────

/**
 * Elige N fotos sueltas aleatorias del pool de `media` cuyos tags incluyan
 * `tag` y que NO estén reservadas para sexting.
 *
 * Si no hay suficientes fotos del tag pedido, devuelve las que haya (el caller
 * decide si escalonar a handoff o mensaje al cliente). Nunca lanza.
 *
 * @param {string} tag  uno de photo_single.tags_disponibles (validado por el caller)
 * @param {number} count  1..10 (no se valida aquí — pricing.calculatePhotoPrice lo
 *                        fuerza en el flujo comercial)
 * @returns {Promise<{ file_ids: string[], found: number, requested: number }>}
 */
export async function pickRandomSinglePhotos(tag, count) {
  const { rows } = await query(
    `SELECT file_id FROM media
     WHERE tipo = 'photo'
       AND activo = TRUE
       AND reserved_for_sexting = FALSE
       AND $1 = ANY(tags)
     ORDER BY random()
     LIMIT $2`,
    [tag, count],
  );
  return {
    file_ids: rows.map((r) => r.file_id),
    found: rows.length,
    requested: count,
  };
}

// ─── Validación de petición del cliente ──────────────────────────────────────

const SINGLE_PHOTO_NUMBER_WORDS = {
  una: 1, uno: 1, 'un': 1,
  dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
};

/**
 * Extrae (cantidad, tag) de un texto libre tipo "quiero 2 fotos de culo" o
 * "3 de tetas" o "una de lencería".
 *
 * Devuelve null si no se puede extraer ambos valores de forma no-ambigua.
 * El tag debe estar en photo_single.tags_disponibles del catálogo.
 *
 * @param {string} text
 * @returns {{ count: number, tag: string } | null}
 */
export function parseSinglePhotoRequest(text) {
  if (!text) return null;
  const products = getProducts();
  const validTags = new Set(products.photo_single.tags_disponibles);

  const lower = text.toLowerCase();

  // 1. Cantidad: número (1-10) o palabra (una/dos/.../diez).
  let count = null;
  const numMatch = lower.match(/\b(\d{1,2})\b/);
  if (numMatch) {
    const n = Number(numMatch[1]);
    if (n >= 1 && n <= 10) count = n;
  }
  if (count === null) {
    for (const [word, n] of Object.entries(SINGLE_PHOTO_NUMBER_WORDS)) {
      const re = new RegExp(`\\b${word}\\b`);
      if (re.test(lower)) { count = n; break; }
    }
  }
  if (count === null) return null;

  // 2. Tag: el PRIMER tag válido que aparezca en el texto.
  let tag = null;
  for (const t of validTags) {
    // match exacto de palabra (unicode-friendly), acepta variantes "coño"/"cono"
    // El tag ya es minúscula por validación del catálogo.
    if (lower.includes(t)) { tag = t; break; }
  }
  // Fallback: "coño" sin la tilde → mapeamos a "coño" si está en validTags.
  if (!tag && /\bcono\b/.test(lower) && validTags.has('coño')) tag = 'coño';
  if (!tag && /\blenceria\b/.test(lower) && validTags.has('lencería')) tag = 'lencería';

  if (!tag) return null;

  return { count, tag };
}

// ─── Helpers de catálogo humanizado ──────────────────────────────────────────

/**
 * Trunca la lista de videos activos a un máximo de N (default 6) y devuelve
 * formato de una línea por item: "· título · duración · precio€".
 *
 * @param {number} [max=6]
 * @returns {string}
 */
export function formatVideoListText(max = 6) {
  const { videos } = getProducts();
  const active = videos.filter((v) => v.activo);
  const slice = active.slice(0, max);
  const lines = slice.map((v) => `· ${v.titulo} · ${v.duracion} · ${v.precio_eur}€`);
  const more = active.length > slice.length ? '\ntengo más si quieres' : '';
  return `mis videos:\n${lines.join('\n')}${more}\ncuál te mola? 😈`;
}

/**
 * Lista humanizada de packs.
 * @returns {string}
 */
export function formatPackListText() {
  const { photo_packs } = getProducts();
  const active = photo_packs.filter((p) => p.activo);
  const lines = active.map((p) => `· ${p.titulo} · ${p.num_fotos} fotos · ${p.precio_eur}€`);
  return `mis packs:\n${lines.join('\n')}\ncuál te mola? 😈`;
}

/**
 * Lista humanizada de opciones de sexting.
 * @returns {string}
 */
export function formatSextingOptionsText() {
  const { sexting_templates } = getProducts();
  const lines = sexting_templates.map((t) => `· ${t.duracion_min} min · ${t.precio_eur}€`);
  return `tengo 3 opciones:\n${lines.join('\n')}\ncuál te mola?`;
}

/**
 * Dado un texto libre del cliente, encuentra el video cuyo título o tags
 * coinciden mejor con la mención.
 *
 * Ejemplos: "del squirt" → v_001 o v_006; "el de la ducha" → v_007.
 * Si hay empate, devuelve el más destacado; si siguen empatados, el primero
 * por ID.
 *
 * @param {string} text
 * @returns {object|null}  El video completo del catálogo, o null.
 */
export function matchVideoFromText(text) {
  if (!text) return null;
  const { videos } = getProducts();
  const lower = text.toLowerCase();
  const scored = videos
    .filter((v) => v.activo)
    .map((v) => {
      let score = 0;
      // match por título completo o palabras clave del título
      const titleWords = v.titulo.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      for (const w of titleWords) {
        if (lower.includes(w)) score += 3;
      }
      // match por tags
      for (const t of v.tags) {
        if (lower.includes(t)) score += 2;
      }
      // desempate suave: destacados ganan si ya hubo algún match real
      if (score > 0 && v.destacado) score += 0.1;
      return { video: v, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.video ?? null;
}

/**
 * Igual que matchVideoFromText pero para packs.
 * @param {string} text
 * @returns {object|null}
 */
export function matchPackFromText(text) {
  if (!text) return null;
  const { photo_packs } = getProducts();
  const lower = text.toLowerCase();
  const scored = photo_packs
    .filter((p) => p.activo)
    .map((p) => {
      let score = 0;
      const titleWords = p.titulo.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      for (const w of titleWords) if (lower.includes(w)) score += 3;
      for (const t of p.tags) if (lower.includes(t)) score += 2;
      return { pack: p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.pack ?? null;
}

/**
 * Mapea texto → template_id de sexting ("5 min" → "st_5min").
 * @param {string} text
 * @returns {object|null}
 */
export function matchSextingTemplateFromText(text) {
  if (!text) return null;
  const { sexting_templates } = getProducts();
  const lower = text.toLowerCase();
  // Numero de minutos explícito
  const m = lower.match(/\b(5|10|15)\s*m?i?n?\b/);
  if (m) {
    const duracion = Number(m[1]);
    return sexting_templates.find((t) => t.duracion_min === duracion) ?? null;
  }
  return null;
}

log.debug({ mod: 'content-dispatcher' }, 'content-dispatcher loaded');
