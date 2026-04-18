import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { getProducts, generateGreetingCatalog } from '../config/products.js';
import {
  formatVideoListText,
  formatPackListText,
  formatSextingOptionsText,
} from './content-dispatcher.js';
import { calculatePhotoPrice } from './pricing.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── LEGACY pricing.json loader (kept for resolveProduct + thresholds) ───────
// Kept for: resolveProduct (legacy intents), getVipThreshold, getMinTransaction.
// Catalog text + category detail now read from products.json (v2).
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

// ─── Intent → default product mapping (LEGACY) ───────────────────────────────

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
 * LEGACY — Resolve the default product offer for a router intent from pricing.json.
 *
 * Still used by the orchestrator's `payment_method_selection` branch and the
 * legacy single-intent paths. v2 flows use `createOfferFromProduct(productId)`
 * from src/agents/sales.js which reads products.json instead.
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

// ─── Catalog text (v2 — reads products.json) ─────────────────────────────────

/**
 * Returns the catalog message generated from products.json (v2).
 * Sent as-is to the client — does NOT pass through Persona or Quality Gate.
 *
 * The optional `pricing` parameter is accepted for backwards compatibility
 * with legacy callers/tests but is ignored: the v2 catalog is always sourced
 * from products.json via `generateGreetingCatalog()`.
 *
 * @param {object} [_pricingIgnored]  Legacy parameter, ignored.
 * @returns {string}
 */
export function getCatalogText(_pricingIgnored = undefined) {
  return generateGreetingCatalog();
}

// ─── Category detail (v2) ────────────────────────────────────────────────────

const FALLBACK_PHOTO_TAGS = ['culo', 'tetas', 'coño', 'lencería', 'tacones', 'ducha'];

function formatTagList(tags) {
  if (tags.length === 0) return 'de todo';
  if (tags.length === 1) return tags[0];
  return `${tags.slice(0, -1).join(', ')} y ${tags[tags.length - 1]}`;
}

function sortTagsByRelevance(tags, userMessage) {
  const lower = (userMessage || '').toLowerCase();
  const matched = tags.filter((t) => lower.includes(t.toLowerCase()));
  const rest = tags.filter((t) => !lower.includes(t.toLowerCase())).sort(() => Math.random() - 0.5);
  return [...matched, ...rest];
}

/**
 * Generate a natural-language product detail message for a specific category.
 * V2 implementation — reads from products.json.
 *
 *  - photos    → fotos sueltas con tabla escalonada (calculatePhotoPrice) + cheapest pack
 *  - videos    → formatVideoListText() — lista de v_XXX activos
 *  - sexting   → formatSextingOptionsText() — 3 templates (5/10/15 min)
 *  - videocall → tarifa por minuto desde products.videollamada
 *  - custom    → precio mínimo desde products.personalizado
 *
 * `mediaTags` se usa para personalizar el inicio del bloque de fotos cuando
 * existen tags reales del catálogo (`media` table). Si vacío, se usan los
 * tags_disponibles de products.photo_single.
 *
 * @param {'photos'|'videos'|'sexting'|'videocall'|'custom'} category
 * @param {string[]} [mediaTags]
 * @param {object} [_unused]  Legacy parameter, ignored.
 * @param {string} [userMessage]  Para priorizar tags mencionados.
 * @returns {string}
 */
export function getCategoryDetail(category, mediaTags = [], _unused = undefined, userMessage = '') {
  const products = getProducts();

  if (category === 'photos') {
    const tagSource = mediaTags.length > 0
      ? mediaTags
      : (products.photo_single?.tags_disponibles ?? FALLBACK_PHOTO_TAGS);
    const sample = userMessage
      ? sortTagsByRelevance(tagSource, userMessage)
      : [...tagSource].sort(() => Math.random() - 0.5);
    const tagStr = formatTagList(sample);
    const topTag = sample[0] || 'todo tipo';
    const single1 = calculatePhotoPrice(1);
    const single2 = calculatePhotoPrice(2);
    const single3 = calculatePhotoPrice(3);
    const cheapestPack = products.photo_packs
      .filter((p) => p.activo)
      .reduce((min, p) => (p.precio_eur < min ? p.precio_eur : min), Infinity);
    const packsLine = Number.isFinite(cheapestPack)
      ? `\no tengo packs desde ${cheapestPack}€`
      : '';
    return (
      `tengo de ${tagStr} 🔥\n` +
      `1 foto de ${topTag} ${single1}€, 2 fotos ${single2}€, 3 fotos ${single3}€${packsLine}\n` +
      `cuántas quieres?`
    );
  }

  if (category === 'videos') {
    return formatVideoListText();
  }

  if (category === 'sexting') {
    return formatSextingOptionsText();
  }

  if (category === 'videocall') {
    const vc = products.videollamada;
    const minTotal = vc.precio_por_minuto * vc.minimo_minutos;
    return (
      `son ${vc.precio_por_minuto}€/min bebe, mínimo ${vc.minimo_minutos} min (${minTotal}€)\n` +
      `cuándo te va y cómo quieres pagar? 😈`
    );
  }

  if (category === 'custom') {
    const base = products.personalizado.precio_minimo;
    return `personalizados desde ${base}€ bebe, dime qué quieres y te cuento`;
  }

  return '';
}

// Re-export the v2 helper so other modules can grab the formatted pack list
// without pulling in content-dispatcher directly.
export { formatPackListText };

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
