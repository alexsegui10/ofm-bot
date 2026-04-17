import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let _pricing;

export function getPricing() {
  if (!_pricing) {
    const raw = readFileSync(join(__dirname, '../../config/pricing.json'), 'utf-8');
    _pricing = JSON.parse(raw);
  }
  return _pricing;
}

/** Reset module-level cache — exported for tests only. */
export function _resetPricingCache() { _pricing = undefined; }

/** Reload pricing.json from disk and return the new data. */
export function reloadPricing() {
  _pricing = undefined;
  return getPricing();
}

// ─── Intent → default product mapping ────────────────────────────────────────

const INTENT_DEFAULTS = {
  sale_intent_photos:   { category: 'fotos',        key: '1_foto' },
  sale_intent_videos:   { category: 'videos',       key: '1min' },
  sexting_request:      { category: 'sexting',      key: null },
  custom_video_request: { category: 'personalizado', key: null },
  videocall_request:    { category: 'videollamada',  key: null },
};

const CATEGORY_TO_PRODUCT_TYPE = {
  fotos:         'photos',
  videos:        'videos',
  sexting:       'sexting',
  videollamada:  'videocall',
  personalizado: 'custom',
};

/**
 * Resolve the default product offer for a given router intent.
 *
 * @param {string} intent
 * @param {object} [pricing]
 * @returns {{ amountEur: number, productType: string, productId: string, description: string } | null}
 */
export function resolveProduct(intent, pricing = getPricing()) {
  const ref = INTENT_DEFAULTS[intent];
  if (!ref) return null;

  const cat = pricing[ref.category];
  if (!cat) return null;

  if (ref.key) {
    const entry = cat[ref.key];
    if (!entry || entry.precio_eur == null) return null;
    return {
      amountEur:   entry.precio_eur,
      productType: CATEGORY_TO_PRODUCT_TYPE[ref.category] ?? ref.category,
      productId:   `${ref.category}__${ref.key}`,
      description: entry.descripcion ?? intent,
    };
  }

  // Session-based products (sexting, videollamada, personalizado)
  if (ref.category === 'sexting') {
    const minPrice = (cat.precio_por_minuto ?? 3) * (cat.minimo_minutos ?? 5);
    return {
      amountEur:   minPrice,
      productType: 'sexting',
      productId:   'sexting__minimo',
      description: cat.descripcion ?? `Sexting ${cat.minimo_minutos} min`,
    };
  }
  if (ref.category === 'videollamada') {
    const minPrice = (cat.precio_por_minuto ?? 4) * (cat.minimo_minutos ?? 5);
    return {
      amountEur:   minPrice,
      productType: 'videocall',
      productId:   'videollamada__minimo',
      description: cat.descripcion ?? `Videollamada ${cat.minimo_minutos} min`,
    };
  }
  if (ref.category === 'personalizado') {
    const base = cat.precio_base;
    if (base == null) return null;
    return {
      amountEur:   base,
      productType: 'custom',
      productId:   'personalizado__base',
      description: cat.descripcion ?? 'Video personalizado',
    };
  }

  return null;
}

/**
 * Return the VIP threshold from pricing.json.
 * @param {object} [pricing]
 * @returns {number}
 */
export function getVipThreshold(pricing = getPricing()) {
  return pricing.vip?.umbral_total_gastado_eur ?? 200;
}

/**
 * Return the minimum transaction amount from pricing.json.
 * @param {object} [pricing]
 * @returns {number}
 */
export function getMinTransaction(pricing = getPricing()) {
  return pricing.limites_pago?.minimo_transaccion_eur ?? 3;
}

// ─── Catalog text ─────────────────────────────────────────────────────────────

/**
 * Returns the fixed catalog message from pricing.json.
 * Sent as-is to the client — does NOT pass through Persona or Quality Gate.
 *
 * @param {object} [pricing]
 * @returns {string}
 */
export function getCatalogText(pricing = getPricing()) {
  return pricing.catalogo_mensaje ?? '';
}

// ─── Category detail ──────────────────────────────────────────────────────────

const FALLBACK_TAGS = {
  photos: ['culo', 'tetas', 'coño', 'lencería', 'cuerpo entero', 'en la ducha', 'con tacones'],
  videos: ['masturbándome', 'follando', 'squirt', 'mamadas', 'tocándome', 'duchándome', 'en lencería'],
};

/**
 * Format a tag list as "a, b, c y d" (Oxford-style with "y" before last).
 * @param {string[]} tags
 * @returns {string}
 */
function formatTagList(tags) {
  if (tags.length === 0) return 'de todo';
  if (tags.length === 1) return tags[0];
  return `${tags.slice(0, -1).join(', ')} y ${tags[tags.length - 1]}`;
}

/**
 * Sort tags so those matching words in userMessage come first.
 * Tags not mentioned are shuffled randomly after the matched ones.
 *
 * @param {string[]} tags
 * @param {string} userMessage
 * @returns {string[]}
 */
function sortTagsByRelevance(tags, userMessage) {
  const lower = (userMessage || '').toLowerCase();
  const matched = tags.filter((t) => lower.includes(t.toLowerCase()));
  const rest = tags.filter((t) => !lower.includes(t.toLowerCase())).sort(() => Math.random() - 0.5);
  return [...matched, ...rest];
}

/**
 * Generate a natural-language product detail message for a specific category.
 * Uses real media tags when provided; falls back to hardcoded generic list.
 * If userMessage is provided, tags mentioned in it are listed first.
 *
 * @param {'photos'|'videos'|'sexting'|'videocall'|'custom'} category
 * @param {string[]} mediaTags  Real tags from media table (empty → use fallback)
 * @param {object} [pricing]
 * @param {string} [userMessage]  Raw client message for tag prioritisation
 * @returns {string}
 */
export function getCategoryDetail(category, mediaTags = [], pricing = getPricing(), userMessage = '') {
  const tags = mediaTags.length > 0 ? mediaTags : (FALLBACK_TAGS[category] ?? []);
  const sample = userMessage
    ? sortTagsByRelevance(tags, userMessage)
    : [...tags].sort(() => Math.random() - 0.5);
  const tagStr = formatTagList(sample);

  if (category === 'photos') {
    const f = pricing.fotos;
    const topTag = sample[0] || 'todo tipo';
    return (
      `tengo de ${tagStr} 🔥\n` +
      `1 foto de ${topTag} ${f['1_foto'].precio_eur}€, 2 fotos ${f['2_fotos'].precio_eur}€ o pack de 3 por ${f['3_fotos'].precio_eur}€\n` +
      `cuántas quieres?`
    );
  }
  if (category === 'videos') {
    const v = pricing.videos;
    const t0 = sample[0] || 'contenido rico';
    const t1 = sample[1] || t0;
    const t2 = sample[2] || t0;
    return (
      `tengo uno de 2min de ${t0} por ${v['2min'].precio_eur}€, uno de 3min ${t1} por ${v['3min'].precio_eur}€, o uno largo de 5min con ${t2} por ${v['5min'].precio_eur}€\n` +
      `cuál te va bebe? 😈`
    );
  }
  if (category === 'sexting') {
    const s = pricing.sexting;
    const minTotal = s.precio_por_minuto * s.minimo_minutos;
    return (
      `son ${s.precio_por_minuto}€/min, mínimo ${s.minimo_minutos} min (${minTotal}€)\n` +
      `cuántos minutos quieres? y cómo pagas: bizum, crypto o stars 😈`
    );
  }
  if (category === 'videocall') {
    const vc = pricing.videollamada;
    const minTotal = vc.precio_por_minuto * vc.minimo_minutos;
    return (
      `son ${vc.precio_por_minuto}€/min bebe, mínimo ${vc.minimo_minutos} min (${minTotal}€)\n` +
      `cuándo te va y cómo quieres pagar? 😈`
    );
  }
  if (category === 'custom') {
    return `personalizados desde ${pricing.personalizado.precio_base}€ bebe, dime qué quieres y te cuento`;
  }
  return '';
}

// ─── Post-service message ─────────────────────────────────────────────────────

/**
 * Returns a warm closing message after delivering a service.
 *
 * @param {'photos'|'videos'|'sexting'|'videocall'} serviceType
 * @returns {string}
 */
export function getPostServiceMessage(serviceType) {
  if (serviceType === 'photos' || serviceType === 'videos') {
    return 'te gustó bebe? 😈 avísame cuando quieras más';
  }
  if (serviceType === 'sexting') {
    return 'ha sido increíble bebe 🔥 avísame cuando quieras repetir 😈';
  }
  if (serviceType === 'videocall') {
    return 'me ha encantado bebe 🔥 avísame cuando quieras otra';
  }
  return 'espero que te haya gustado bebe, aquí estoy cuando quieras';
}
