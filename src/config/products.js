import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const DEFAULT_PATH = resolve(__dirname, '../../config/products.json');

/**
 * Load and validate products.json.
 *
 * Exported as a factory so tests can inject alternative paths. Caller code
 * should use the memoised `getProducts()` below.
 *
 * @param {string} [path]
 * @returns {object}
 */
export function loadProducts(path = DEFAULT_PATH) {
  const raw = readFileSync(path, 'utf8');
  const data = JSON.parse(raw);
  validateProducts(data);
  return data;
}

let _cached = null;
export function getProducts() {
  if (_cached === null) _cached = loadProducts();
  return _cached;
}

/** For tests — drop the memoised copy. */
export function _resetProductsCache() {
  _cached = null;
}

// ─── Validation ───────────────────────────────────────────────────────────────

const REQUIRED_VIDEO_FIELDS    = ['id', 'titulo', 'duracion', 'precio_eur', 'descripcion_corta', 'descripcion_jugosa', 'tags', 'destacado', 'activo'];
const REQUIRED_PACK_FIELDS     = ['id', 'titulo', 'num_fotos', 'precio_eur', 'descripcion_corta', 'descripcion_jugosa', 'tags', 'activo'];
const REQUIRED_TEMPLATE_FIELDS = ['id', 'nombre', 'duracion_min', 'precio_eur', 'descripcion_corta', 'cadencia_target', 'phases_order', 'phases_duration_target_seg', 'media_pool'];
const REQUIRED_MEDIA_POOL_FIELDS = ['media_id', 'phase_hint', 'order_hint', 'caption_base', 'intensity'];

const VALID_VIDEO_TAGS = new Set([
  'masturbándome', 'dildo', 'follando', 'squirt', 'mamada', 'ducha', 'lencería', 'tacones',
]);
const VALID_PACK_TAGS = new Set([
  'culo', 'tetas', 'coño', 'lencería', 'tacones', 'ducha', 'tanga',
]);
const VALID_PHASES     = new Set(['warm_up', 'teasing', 'escalada', 'climax', 'cool_down']);
const VALID_INTENSITIES = new Set(['low', 'medium', 'high', 'peak']);

export function validateProducts(data) {
  if (!data || typeof data !== 'object') throw new Error('products.json: root is not an object');

  // ── Videos ──────────────────────────────────────────────────────────────
  if (!Array.isArray(data.videos)) throw new Error('products.json: videos must be an array');
  const seenIds = new Set();

  for (const v of data.videos) {
    for (const f of REQUIRED_VIDEO_FIELDS) {
      if (!(f in v)) throw new Error(`video ${v.id ?? '?'}: missing field "${f}"`);
    }
    if (seenIds.has(v.id)) throw new Error(`duplicate id: ${v.id}`);
    seenIds.add(v.id);
    if (!/^v_\d{3,}$/.test(v.id))     throw new Error(`video id "${v.id}" does not match v_XXX pattern`);
    if (typeof v.precio_eur !== 'number' || v.precio_eur <= 0) throw new Error(`video ${v.id}: invalid precio_eur`);
    if (!Array.isArray(v.tags) || v.tags.length === 0) throw new Error(`video ${v.id}: tags must be non-empty array`);
    for (const tag of v.tags) {
      if (!VALID_VIDEO_TAGS.has(tag)) throw new Error(`video ${v.id}: unknown tag "${tag}"`);
    }
    if (typeof v.destacado !== 'boolean') throw new Error(`video ${v.id}: destacado must be boolean`);
  }

  // ── Photo packs ────────────────────────────────────────────────────────
  if (!Array.isArray(data.photo_packs)) throw new Error('products.json: photo_packs must be an array');

  for (const p of data.photo_packs) {
    for (const f of REQUIRED_PACK_FIELDS) {
      if (!(f in p)) throw new Error(`pack ${p.id ?? '?'}: missing field "${f}"`);
    }
    if (seenIds.has(p.id)) throw new Error(`duplicate id: ${p.id}`);
    seenIds.add(p.id);
    if (!/^pk_\d{3,}$/.test(p.id)) throw new Error(`pack id "${p.id}" does not match pk_XXX pattern`);
    if (typeof p.num_fotos !== 'number' || p.num_fotos <= 0) throw new Error(`pack ${p.id}: invalid num_fotos`);
    if (typeof p.precio_eur !== 'number' || p.precio_eur <= 0) throw new Error(`pack ${p.id}: invalid precio_eur`);
    for (const tag of p.tags) {
      if (!VALID_PACK_TAGS.has(tag)) throw new Error(`pack ${p.id}: unknown tag "${tag}"`);
    }
  }

  // ── Photo single ────────────────────────────────────────────────────────
  if (!data.photo_single || !Array.isArray(data.photo_single.tags_disponibles)) {
    throw new Error('products.json: photo_single.tags_disponibles is required');
  }

  // ── Sexting templates ──────────────────────────────────────────────────
  if (!Array.isArray(data.sexting_templates)) throw new Error('products.json: sexting_templates must be an array');

  for (const t of data.sexting_templates) {
    for (const f of REQUIRED_TEMPLATE_FIELDS) {
      if (!(f in t)) throw new Error(`template ${t.id ?? '?'}: missing field "${f}"`);
    }
    if (seenIds.has(t.id)) throw new Error(`duplicate id: ${t.id}`);
    seenIds.add(t.id);
    if (!/^st_\d+min$/.test(t.id)) throw new Error(`template id "${t.id}" does not match st_XXmin pattern`);

    // phases_order values must be subset of valid phases
    for (const ph of t.phases_order) {
      if (!VALID_PHASES.has(ph)) throw new Error(`template ${t.id}: unknown phase "${ph}"`);
    }

    // media_pool validation
    if (!Array.isArray(t.media_pool) || t.media_pool.length === 0) {
      throw new Error(`template ${t.id}: media_pool must be non-empty array`);
    }
    const seenMediaIds = new Set();
    const seenOrders   = new Set();
    for (const m of t.media_pool) {
      for (const f of REQUIRED_MEDIA_POOL_FIELDS) {
        if (!(f in m)) throw new Error(`template ${t.id} media ${m.media_id ?? '?'}: missing "${f}"`);
      }
      if (seenMediaIds.has(m.media_id)) throw new Error(`template ${t.id}: duplicate media_id "${m.media_id}"`);
      seenMediaIds.add(m.media_id);
      if (seenOrders.has(m.order_hint)) throw new Error(`template ${t.id}: duplicate order_hint ${m.order_hint}`);
      seenOrders.add(m.order_hint);
      if (!VALID_PHASES.has(m.phase_hint)) throw new Error(`template ${t.id} media ${m.media_id}: unknown phase_hint "${m.phase_hint}"`);
      if (!VALID_INTENSITIES.has(m.intensity)) throw new Error(`template ${t.id} media ${m.media_id}: unknown intensity "${m.intensity}"`);
    }
  }

  // ── Videollamada / personalizado ─────────────────────────────────────────
  if (!data.videollamada || typeof data.videollamada.precio_por_minuto !== 'number') {
    throw new Error('products.json: videollamada.precio_por_minuto is required');
  }
  if (!data.personalizado || typeof data.personalizado.precio_minimo !== 'number') {
    throw new Error('products.json: personalizado.precio_minimo is required');
  }

  return true;
}

// ─── Greeting catalog generator ───────────────────────────────────────────────

/**
 * Build the "esto es lo que tengo..." catalog text from real prices.
 * Called on-the-fly so precios siempre reflejan products.json.
 *
 * @param {object} [products]  Defaults to getProducts()
 * @returns {string}
 */
export function generateGreetingCatalog(products = getProducts()) {
  const cheapestPack  = products.photo_packs.reduce(
    (min, p) => (p.activo && p.precio_eur < min ? p.precio_eur : min),
    Infinity,
  );
  const cheapestVideo = products.videos.reduce(
    (min, v) => (v.activo && v.precio_eur < min ? v.precio_eur : min),
    Infinity,
  );
  const sextingPrices  = products.sexting_templates.map((t) => t.precio_eur);
  const cheapestSexting = Math.min(...sextingPrices);
  const vc  = products.videollamada;
  const cus = products.personalizado;

  return (
    'esto es lo que tengo:\n\n' +
    `📸 fotos sueltas 7€/una · packs desde ${cheapestPack}€\n` +
    `🎥 videos desde ${cheapestVideo}€ (te paso la lista si quieres)\n` +
    `🔥 sexting 5/10/15 min (desde ${cheapestSexting}€)\n` +
    `📹 videollamada ${vc.precio_por_minuto}€/min (mín ${vc.minimo_minutos} min)\n` +
    `💎 personalizado desde ${cus.precio_minimo}€\n\n` +
    'dime qué te mola rey 🔥'
  );
}
