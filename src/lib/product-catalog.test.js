import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveProduct,
  getVipThreshold,
  getMinTransaction,
  getCatalogText,
  getCategoryDetail,
  getPostServiceMessage,
  _resetPricingCache,
} from './product-catalog.js';
import { _resetProductsCache } from '../config/products.js';

// Minimal injectable LEGACY pricing config — only used by resolveProduct
// (which still reads pricing.json) and the threshold getters.
const MOCK_PRICING = {
  fotos: {
    '1_foto':  { precio_eur: 7,  descripcion: '1 foto' },
    '2_fotos': { precio_eur: 12, descripcion: '2 fotos' },
    '3_fotos': { precio_eur: 15, descripcion: '3 fotos' },
  },
  videos: {
    '1min': { precio_eur: 5,  duracion_min: 1, descripcion: 'Video 1 minuto' },
    '2min': { precio_eur: 10, duracion_min: 2, descripcion: 'Video 2 minutos' },
    '3min': { precio_eur: 14, duracion_min: 3, descripcion: 'Video 3 minutos' },
    '4min': { precio_eur: 17, duracion_min: 4, descripcion: 'Video 4 minutos' },
    '5min': { precio_eur: 20, duracion_min: 5, descripcion: 'Video 5 minutos' },
  },
  sexting: {
    precio_por_minuto: 3,
    minimo_minutos: 5,
    precio_minimo: 15,
    descripcion: 'Sexting 3€/min',
  },
  videollamada: {
    precio_por_minuto: 4,
    minimo_minutos: 5,
    precio_minimo: 20,
    descripcion: 'Videollamada 4€/min',
  },
  personalizado: {
    precio_base: 45,
    descripcion: 'Video personalizado desde 45€',
  },
  vip:          { umbral_total_gastado_eur: 200 },
  limites_pago: { minimo_transaccion_eur: 3 },
};

beforeEach(() => {
  _resetPricingCache();
  _resetProductsCache();
});

// ─── resolveProduct (LEGACY) ──────────────────────────────────────────────────

describe('resolveProduct (legacy)', () => {
  it('resolves sale_intent_photos → 1_foto (7€)', () => {
    const p = resolveProduct('sale_intent_photos', MOCK_PRICING);
    expect(p.amountEur).toBe(7);
    expect(p.productType).toBe('photos');
    expect(p.productId).toBe('fotos__1_foto');
    expect(p.description).toBe('1 foto');
  });

  it('resolves sale_intent_videos → 1min (5€)', () => {
    const p = resolveProduct('sale_intent_videos', MOCK_PRICING);
    expect(p.amountEur).toBe(5);
    expect(p.productType).toBe('videos');
    expect(p.productId).toBe('videos__1min');
  });

  it('resolves sexting_request → minimum price (3€/min × 5min = 15€)', () => {
    const p = resolveProduct('sexting_request', MOCK_PRICING);
    expect(p.amountEur).toBe(15);
    expect(p.productType).toBe('sexting');
    expect(p.productId).toBe('sexting__minimo');
  });

  it('resolves videocall_request → minimum price (4€/min × 5min = 20€)', () => {
    const p = resolveProduct('videocall_request', MOCK_PRICING);
    expect(p.amountEur).toBe(20);
    expect(p.productType).toBe('videocall');
    expect(p.productId).toBe('videollamada__minimo');
  });

  it('resolves custom_video_request → base price (45€)', () => {
    const p = resolveProduct('custom_video_request', MOCK_PRICING);
    expect(p.amountEur).toBe(45);
    expect(p.productType).toBe('custom');
    expect(p.productId).toBe('personalizado__base');
  });

  it('returns null for unknown intent', () => {
    expect(resolveProduct('small_talk', MOCK_PRICING)).toBeNull();
    expect(resolveProduct('price_question', MOCK_PRICING)).toBeNull();
    expect(resolveProduct('unknown', MOCK_PRICING)).toBeNull();
  });

  it('returns null if category is missing in pricing', () => {
    expect(resolveProduct('sale_intent_photos', {})).toBeNull();
  });

  it('returns null if entry is missing precio_eur', () => {
    const malformed = { fotos: { '1_foto': { descripcion: 'sin precio' } } };
    expect(resolveProduct('sale_intent_photos', malformed)).toBeNull();
  });

  it('uses real pricing.json when no config injected (smoke test)', () => {
    const p = resolveProduct('sale_intent_photos');
    expect(p).not.toBeNull();
    expect(p.amountEur).toBeGreaterThan(0);
  });
});

// ─── getVipThreshold / getMinTransaction ──────────────────────────────────────

describe('getVipThreshold', () => {
  it('returns threshold from config', () => {
    expect(getVipThreshold(MOCK_PRICING)).toBe(200);
  });
  it('defaults to 200 if missing', () => {
    expect(getVipThreshold({})).toBe(200);
  });
});

describe('getMinTransaction', () => {
  it('returns min from config', () => {
    expect(getMinTransaction(MOCK_PRICING)).toBe(3);
  });
  it('defaults to 3 if missing', () => {
    expect(getMinTransaction({})).toBe(3);
  });
});

// ─── getCatalogText (v2 — products.json) ──────────────────────────────────────

describe('getCatalogText (v2)', () => {
  it('returns the v2 greeting catalog string', () => {
    const text = getCatalogText();
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(20);
  });

  it('mentions all five top-level categories (fotos, videos, sexting, videollamada, personalizado)', () => {
    const text = getCatalogText();
    expect(text).toMatch(/fotos/i);
    expect(text).toMatch(/videos/i);
    expect(text).toMatch(/sexting/i);
    expect(text).toMatch(/videollamada/i);
    expect(text).toMatch(/personalizado/i);
  });

  it('does NOT use the legacy "X min Y€" video pricing format (§16)', () => {
    const text = getCatalogText();
    // Legacy strings: "1min 5€", "2min 10€", etc.
    expect(text).not.toMatch(/\d\s*min\s*\d+€/i);
  });

  it('mentions sexting with the 5/10/15 fixed templates (§15)', () => {
    const text = getCatalogText();
    // generateGreetingCatalog formats as "sexting 5/10/15 min"
    expect(text).toMatch(/5\/10\/15\s*min/i);
  });

  it('ignores any legacy `pricing` argument (backwards compat)', () => {
    const text1 = getCatalogText();
    const text2 = getCatalogText(MOCK_PRICING);
    expect(text1).toBe(text2);
  });
});

// ─── getCategoryDetail (v2) ───────────────────────────────────────────────────

describe('getCategoryDetail (v2)', () => {
  it('returns a non-empty string for photos using calculatePhotoPrice scale', () => {
    const msg = getCategoryDetail('photos', []);
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(10);
    expect(msg).toContain('7€');   // calculatePhotoPrice(1)
    expect(msg).toContain('15€');  // calculatePhotoPrice(3)
  });

  it('uses supplied media tags when provided (photos)', () => {
    const msg = getCategoryDetail('photos', ['peliroja', 'botas']);
    expect(msg).toMatch(/peliroja|botas/);
  });

  it('returns the v2 video list for videos (no min/€ legacy format)', () => {
    const msg = getCategoryDetail('videos', []);
    expect(typeof msg).toBe('string');
    expect(msg).toMatch(/mis videos/i);
    expect(msg).not.toMatch(/\d\s*min\s*\d+€/i);
  });

  it('returns the v2 sexting options (5/10/15 min)', () => {
    const msg = getCategoryDetail('sexting', []);
    expect(msg).toMatch(/5\s*min/);
    expect(msg).toMatch(/10\s*min/);
    expect(msg).toMatch(/15\s*min/);
    expect(msg).not.toMatch(/3\s*€\s*\/\s*min/);
  });

  it('returns a string for videocall mentioning per-minute and minimum', () => {
    const msg = getCategoryDetail('videocall', []);
    expect(msg).toMatch(/€\s*\/\s*min/);
    expect(msg).toMatch(/min/);
  });

  it('returns a string for custom from products.personalizado.precio_minimo', () => {
    const msg = getCategoryDetail('custom', []);
    expect(msg).toMatch(/desde\s*\d+€/);
  });

  it('returns empty string for unknown category', () => {
    expect(getCategoryDetail('unknown', [])).toBe('');
  });

  it('does not mention "nivel" technical terms', () => {
    for (const cat of ['photos', 'videos', 'sexting', 'videocall', 'custom']) {
      const msg = getCategoryDetail(cat, []);
      expect(msg).not.toMatch(/nivel[_\s][135]/i);
    }
  });
});

// ─── getPostServiceMessage ────────────────────────────────────────────────────

describe('getPostServiceMessage', () => {
  it('returns a string for photos', () => {
    const msg = getPostServiceMessage('photos');
    expect(typeof msg).toBe('string');
    expect(msg).toContain('gustó');
  });

  it('returns a string for videos', () => {
    const msg = getPostServiceMessage('videos');
    expect(typeof msg).toBe('string');
    expect(msg).toContain('gustó');
  });

  it('returns a string for sexting', () => {
    const msg = getPostServiceMessage('sexting');
    expect(typeof msg).toBe('string');
    expect(msg).toContain('increíble');
  });

  it('returns a string for videocall', () => {
    const msg = getPostServiceMessage('videocall');
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(5);
  });

  it('returns a fallback string for unknown service type', () => {
    const msg = getPostServiceMessage('unknown');
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(5);
  });
});
