import { describe, it, expect, beforeEach } from 'vitest';
import { writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  loadProducts,
  validateProducts,
  generateGreetingCatalog,
  getProducts,
  _resetProductsCache,
} from '../../src/config/products.js';
import { calculatePhotoPrice, PHOTO_MAX_PER_TX } from '../../src/lib/pricing.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const TMP_PATH   = resolve(__dirname, '.products.tmp.json');

function writeTmp(obj) {
  writeFileSync(TMP_PATH, JSON.stringify(obj, null, 2), 'utf8');
}

function cleanupTmp() {
  try { unlinkSync(TMP_PATH); } catch { /* ignore */ }
}

// Baseline shape used in validation tests — copy + tweak per case.
function makeBaseline() {
  return {
    videos: [{
      id: 'v_001', titulo: 't', duracion: '3:00', precio_eur: 15,
      descripcion_corta: 'x', descripcion_jugosa: 'y',
      tags: ['squirt'], destacado: false, activo: true,
    }],
    photo_packs: [{
      id: 'pk_001', titulo: 't', num_fotos: 3, precio_eur: 12,
      descripcion_corta: 'x', descripcion_jugosa: 'y',
      tags: ['tetas'], activo: true,
    }],
    photo_single: { tags_disponibles: ['culo'] },
    sexting_templates: [{
      id: 'st_5min', nombre: 'n', duracion_min: 5, precio_eur: 15,
      descripcion_corta: 'x',
      cadencia_target: { mensajes_por_media_objetivo: 2.5, mensajes_max_sin_media: 4, min_segundos_entre_medias: 30 },
      phases_order: ['warm_up', 'teasing', 'escalada', 'climax', 'cool_down'],
      phases_duration_target_seg: { warm_up: 45, teasing: 75, escalada: 120, climax: 45, cool_down: 15 },
      media_pool: [
        { media_id: 'ext_m_001', phase_hint: 'warm_up', order_hint: 1, caption_base: 'c', intensity: 'low' },
      ],
    }],
    videollamada: { precio_por_minuto: 4, minimo_minutos: 5 },
    personalizado: { precio_minimo: 45 },
  };
}

// ─── Load correcto del JSON ───────────────────────────────────────────────────

describe('loadProducts (real file)', () => {
  beforeEach(() => _resetProductsCache());

  it('loads config/products.json without throwing', () => {
    const data = loadProducts();
    expect(data).toBeTruthy();
    expect(Array.isArray(data.videos)).toBe(true);
    expect(Array.isArray(data.photo_packs)).toBe(true);
    expect(Array.isArray(data.sexting_templates)).toBe(true);
  });

  it('expected item counts', () => {
    const data = getProducts();
    expect(data.videos).toHaveLength(8);
    expect(data.photo_packs).toHaveLength(4);
    expect(data.sexting_templates).toHaveLength(3);
  });
});

// ─── IDs únicos ───────────────────────────────────────────────────────────────

describe('unique ID validation', () => {
  beforeEach(cleanupTmp);

  it('real file has unique IDs across videos + packs + templates', () => {
    const data = loadProducts();
    const ids = [
      ...data.videos.map((v) => v.id),
      ...data.photo_packs.map((p) => p.id),
      ...data.sexting_templates.map((t) => t.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('rejects duplicate video IDs', () => {
    const bad = makeBaseline();
    bad.videos.push({ ...bad.videos[0] });
    writeTmp(bad);
    expect(() => loadProducts(TMP_PATH)).toThrow(/duplicate id/);
    cleanupTmp();
  });

  it('rejects duplicate media_id inside a template', () => {
    const bad = makeBaseline();
    bad.sexting_templates[0].media_pool.push({
      media_id: 'ext_m_001', phase_hint: 'climax', order_hint: 2, caption_base: 'x', intensity: 'peak',
    });
    writeTmp(bad);
    expect(() => loadProducts(TMP_PATH)).toThrow(/duplicate media_id/);
    cleanupTmp();
  });
});

// ─── Tags válidos ─────────────────────────────────────────────────────────────

describe('tag validation', () => {
  beforeEach(cleanupTmp);

  it('rejects unknown video tag', () => {
    const bad = makeBaseline();
    bad.videos[0].tags = ['no_existe'];
    writeTmp(bad);
    expect(() => loadProducts(TMP_PATH)).toThrow(/unknown tag/);
    cleanupTmp();
  });

  it('rejects unknown pack tag', () => {
    const bad = makeBaseline();
    bad.photo_packs[0].tags = ['inventado'];
    writeTmp(bad);
    expect(() => loadProducts(TMP_PATH)).toThrow(/unknown tag/);
    cleanupTmp();
  });

  it('rejects invalid phase_hint in media_pool', () => {
    const bad = makeBaseline();
    bad.sexting_templates[0].media_pool[0].phase_hint = 'fiesta';
    writeTmp(bad);
    expect(() => loadProducts(TMP_PATH)).toThrow(/unknown phase_hint/);
    cleanupTmp();
  });

  it('rejects invalid intensity', () => {
    const bad = makeBaseline();
    bad.sexting_templates[0].media_pool[0].intensity = 'brutal';
    writeTmp(bad);
    expect(() => loadProducts(TMP_PATH)).toThrow(/unknown intensity/);
    cleanupTmp();
  });

  it('accepts a valid baseline', () => {
    writeTmp(makeBaseline());
    expect(() => loadProducts(TMP_PATH)).not.toThrow();
    cleanupTmp();
  });
});

// ─── generateGreetingCatalog — precios reales ────────────────────────────────

describe('generateGreetingCatalog', () => {
  it('uses the real cheapest pack price', () => {
    const products = {
      ...makeBaseline(),
      photo_packs: [
        { id: 'pk_001', titulo: 'a', num_fotos: 3, precio_eur: 18, descripcion_corta: 'x', descripcion_jugosa: 'y', tags: ['tetas'], activo: true },
        { id: 'pk_002', titulo: 'b', num_fotos: 2, precio_eur: 11, descripcion_corta: 'x', descripcion_jugosa: 'y', tags: ['tetas'], activo: true },
      ],
    };
    validateProducts(products);
    const text = generateGreetingCatalog(products);
    expect(text).toContain('packs desde 11€');
    expect(text).not.toContain('packs desde 18€');
  });

  it('uses the real cheapest video price', () => {
    const products = {
      ...makeBaseline(),
      videos: [
        { id: 'v_001', titulo: 'a', duracion: '3:00', precio_eur: 20, descripcion_corta: 'x', descripcion_jugosa: 'y', tags: ['squirt'], destacado: false, activo: true },
        { id: 'v_002', titulo: 'b', duracion: '3:00', precio_eur: 9,  descripcion_corta: 'x', descripcion_jugosa: 'y', tags: ['squirt'], destacado: false, activo: true },
      ],
    };
    validateProducts(products);
    const text = generateGreetingCatalog(products);
    expect(text).toContain('videos desde 9€');
  });

  it('reflects real videollamada and personalizado prices', () => {
    const products = makeBaseline();
    products.videollamada = { precio_por_minuto: 5, minimo_minutos: 3 };
    products.personalizado = { precio_minimo: 60 };
    validateProducts(products);
    const text = generateGreetingCatalog(products);
    expect(text).toContain('videollamada 5€/min');
    expect(text).toContain('mín 3 min');
    expect(text).toContain('personalizado desde 60€');
  });

  it('text hints at ordered list and tone (not literal hardcoded expected string)', () => {
    const text = generateGreetingCatalog(loadProducts());
    expect(text).toMatch(/📸 fotos sueltas.*?€/);
    expect(text).toMatch(/🎥 videos desde.*?€/);
    expect(text).toMatch(/🔥 sexting/);
    expect(text).toMatch(/📹 videollamada/);
    expect(text).toMatch(/💎 personalizado desde/);
  });
});

// ─── calculatePhotoPrice ──────────────────────────────────────────────────────

describe('calculatePhotoPrice', () => {
  it.each([
    [1, 7], [2, 12], [3, 15], [4, 19], [5, 22],
    [6, 25], [7, 28], [8, 31], [9, 34], [10, 37],
  ])('count=%i → %i€', (count, expected) => {
    expect(calculatePhotoPrice(count)).toBe(expected);
  });

  it('throws on 0', () => {
    expect(() => calculatePhotoPrice(0)).toThrow(/>= 1/);
  });

  it(`throws when count > ${PHOTO_MAX_PER_TX}`, () => {
    expect(() => calculatePhotoPrice(11)).toThrow(/exceeds max/);
  });

  it('throws on non-integer', () => {
    expect(() => calculatePhotoPrice(2.5)).toThrow(/integer/);
  });
});
