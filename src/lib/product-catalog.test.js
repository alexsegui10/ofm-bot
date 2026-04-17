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

// Minimal injectable pricing config — mirrors the new structure
const MOCK_PRICING = {
  catalogo_mensaje: '📸 fotos — 1 foto 7€ · 2 fotos 12€ · 3 fotos 15€\ndime qué te apetece rey 😈',
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

beforeEach(() => _resetPricingCache());

// ─── resolveProduct ───────────────────────────────────────────────────────────

describe('resolveProduct', () => {
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

// ─── getCatalogText ───────────────────────────────────────────────────────────

describe('getCatalogText', () => {
  it('returns the catalogo_mensaje string', () => {
    const text = getCatalogText(MOCK_PRICING);
    expect(typeof text).toBe('string');
    expect(text).toContain('7€');
  });

  it('returns empty string when field is missing', () => {
    expect(getCatalogText({})).toBe('');
  });

  it('uses real pricing.json when no config injected', () => {
    const text = getCatalogText();
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(10);
  });
});

// ─── getCategoryDetail ────────────────────────────────────────────────────────

describe('getCategoryDetail', () => {
  it('returns a non-empty string for photos with fallback tags', () => {
    const msg = getCategoryDetail('photos', [], MOCK_PRICING);
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(10);
    expect(msg).toContain('7€');   // 1_foto price
    expect(msg).toContain('15€');  // 3_fotos price
  });

  it('uses supplied media tags when provided (photos)', () => {
    const msg = getCategoryDetail('photos', ['peliroja', 'botas'], MOCK_PRICING);
    expect(msg).toMatch(/peliroja|botas/);
  });

  it('returns a string for videos with fallback tags', () => {
    const msg = getCategoryDetail('videos', [], MOCK_PRICING);
    expect(typeof msg).toBe('string');
    expect(msg).toContain('10€'); // 2min price
    expect(msg).toContain('20€'); // 5min price
  });

  it('returns a string for sexting', () => {
    const msg = getCategoryDetail('sexting', [], MOCK_PRICING);
    expect(msg).toContain('3€');
    expect(msg).toContain('5 min');
  });

  it('returns a string for videocall', () => {
    const msg = getCategoryDetail('videocall', [], MOCK_PRICING);
    expect(msg).toContain('4€');
    expect(msg).toContain('5 min');
  });

  it('returns a string for custom', () => {
    const msg = getCategoryDetail('custom', [], MOCK_PRICING);
    expect(msg).toContain('45€');
  });

  it('returns empty string for unknown category', () => {
    expect(getCategoryDetail('unknown', [], MOCK_PRICING)).toBe('');
  });

  it('does not mention "nivel" technical terms', () => {
    for (const cat of ['photos', 'videos', 'sexting', 'videocall', 'custom']) {
      const msg = getCategoryDetail(cat, [], MOCK_PRICING);
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
