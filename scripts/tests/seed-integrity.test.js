/**
 * Verifica la integridad de los datos sembrados por
 * scripts/seed-test-content.js contra config/products.json.
 *
 * Requiere que el seed se haya ejecutado antes (el workflow de CI/local
 * ejecuta `node scripts/seed-test-content.js` antes de `npm test`).
 * Si postgres no está levantado (p. ej. dev sin docker), los tests se
 * skipean — no queremos bloquear la suite unitaria.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { query, closePool } from '../../src/lib/db.js';
import { getProducts } from '../../src/config/products.js';

const TEST_PREFIX = 'TEST_';

// Si la BBDD no responde (p. ej. postgres parado), marcamos skip a nivel de
// suite — no rompemos la CI unitaria por falta de infra.
let dbAvailable = true;
let seedPresent = true;

beforeAll(async () => {
  try {
    const r = await query(`SELECT COUNT(*)::int AS n FROM media WHERE file_id LIKE $1`, [`${TEST_PREFIX}%`]);
    if (r.rows[0].n === 0) seedPresent = false;
  } catch {
    dbAvailable = false;
  }
});

afterAll(async () => {
  if (dbAvailable) await closePool();
});

describe.runIf = (cond) => (cond ? describe : describe.skip);

describe('seed-integrity (TEST_* rows in media)', () => {
  it('db disponible y seed aplicado', () => {
    if (!dbAvailable) return; // skip soft — no infra
    expect(seedPresent).toBe(true);
  });

  it('total TEST_* rows = 81', async () => {
    if (!dbAvailable || !seedPresent) return;
    const r = await query(`SELECT COUNT(*)::int AS n FROM media WHERE file_id LIKE $1`, [`${TEST_PREFIX}%`]);
    expect(r.rows[0].n).toBe(81);
  });

  it('todos los videos de products.json tienen ≥1 row TEST_*', async () => {
    if (!dbAvailable || !seedPresent) return;
    const { videos } = getProducts();
    for (const v of videos) {
      const r = await query(
        `SELECT COUNT(*)::int AS n FROM media WHERE file_id LIKE $1 AND product_id = $2 AND tipo = 'video'`,
        [`${TEST_PREFIX}%`, v.id],
      );
      expect(r.rows[0].n, `video ${v.id}`).toBeGreaterThanOrEqual(1);
    }
  });

  it('cada pack tiene exactamente num_fotos rows TEST_* con ordinales 1..N', async () => {
    if (!dbAvailable || !seedPresent) return;
    const { photo_packs } = getProducts();
    for (const pk of photo_packs) {
      const r = await query(
        `SELECT ordinal FROM media WHERE file_id LIKE $1 AND product_id = $2 ORDER BY ordinal`,
        [`${TEST_PREFIX}%`, pk.id],
      );
      expect(r.rows.length, `pack ${pk.id}`).toBe(pk.num_fotos);
      const ordinals = r.rows.map((x) => x.ordinal);
      const expected = Array.from({ length: pk.num_fotos }, (_, i) => i + 1);
      expect(ordinals).toEqual(expected);
    }
  });

  it('cada media_pool de sexting tiene 1 row TEST_* por media_id', async () => {
    if (!dbAvailable || !seedPresent) return;
    const { sexting_templates } = getProducts();
    for (const tpl of sexting_templates) {
      for (const m of tpl.media_pool) {
        const r = await query(
          `SELECT reserved_for_sexting, intensity FROM media WHERE file_id LIKE $1 AND product_id = $2`,
          [`${TEST_PREFIX}%`, m.media_id],
        );
        expect(r.rows.length, `media ${m.media_id}`).toBe(1);
        expect(r.rows[0].reserved_for_sexting, `${m.media_id} reserved_for_sexting`).toBe(true);
        expect(r.rows[0].intensity, `${m.media_id} intensity`).toBe(m.intensity);
      }
    }
  });

  it('ningún row TEST_* apunta a un product_id que no existe en products.json', async () => {
    if (!dbAvailable || !seedPresent) return;
    const products = getProducts();
    const validIds = new Set([
      ...products.videos.map((v) => v.id),
      ...products.photo_packs.map((p) => p.id),
      ...products.sexting_templates.flatMap((t) => t.media_pool.map((m) => m.media_id)),
    ]);
    const r = await query(
      `SELECT DISTINCT product_id FROM media WHERE file_id LIKE $1 AND product_id IS NOT NULL`,
      [`${TEST_PREFIX}%`],
    );
    for (const row of r.rows) {
      expect(validIds.has(row.product_id), `product_id ${row.product_id} no existe en products.json`).toBe(true);
    }
  });

  it('reserved_for_sexting=TRUE solo en las 24 rows de media_pool de sexting', async () => {
    if (!dbAvailable || !seedPresent) return;
    const r = await query(
      `SELECT COUNT(*)::int AS n FROM media WHERE file_id LIKE $1 AND reserved_for_sexting = TRUE`,
      [`${TEST_PREFIX}%`],
    );
    expect(r.rows[0].n).toBe(24);
  });

  it('las 30 fotos sueltas tienen product_id = NULL', async () => {
    if (!dbAvailable || !seedPresent) return;
    const r = await query(
      `SELECT COUNT(*)::int AS n FROM media WHERE file_id LIKE $1 AND product_id IS NULL`,
      [`${TEST_PREFIX}single_%`],
    );
    expect(r.rows[0].n).toBe(30);
  });

  it('destacado=TRUE en los videos marcados así en products.json (y solo en esos)', async () => {
    if (!dbAvailable || !seedPresent) return;
    const { videos } = getProducts();
    const expectedDest = new Set(videos.filter((v) => v.destacado).map((v) => v.id));
    const r = await query(
      `SELECT product_id FROM media WHERE file_id LIKE $1 AND destacado = TRUE`,
      [`${TEST_PREFIX}%`],
    );
    const actualDest = new Set(r.rows.map((x) => x.product_id));
    expect(actualDest).toEqual(expectedDest);
  });
});
