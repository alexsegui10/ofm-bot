#!/usr/bin/env node
/**
 * scripts/seed-test-content.js
 *
 * Seed de placeholders para el catálogo v2. Inserta en la tabla `media`:
 *   · 8 rows de video (uno por v_XXX del products.json)
 *   · 19 rows de foto repartidas en 4 packs (pk_XXX), con ordinal 1..num_fotos
 *   · 30 fotos sueltas (5 por cada tag de photo_single.tags_disponibles)
 *   · 24 rows reserved_for_sexting (4 + 8 + 12 segun media_pool de st_Xmin)
 *
 * Todas las rows llevan file_id con prefijo "TEST_*" — strings ficticios,
 * NO se sube nada a Telegram. Los file_id reales vivirán en producción con
 * otro prefijo y los resuelve Content Curator por (product_id, ordinal).
 *
 * Idempotente (ON CONFLICT (file_id) DO NOTHING). Flag --clean borra todos
 * los TEST_* antes de insertar.
 *
 * Uso:
 *   node scripts/seed-test-content.js             # insertar
 *   node scripts/seed-test-content.js --clean     # limpiar + insertar
 */

import 'dotenv/config';
import { query, closePool } from '../src/lib/db.js';
import { getProducts } from '../src/config/products.js';

if (process.env.NODE_ENV === 'production') {
  console.error('seed-test-content must not run in production');
  process.exit(1);
}

const CLEAN = process.argv.includes('--clean');

// ─── photo_single: tags a cubrir (5 fotos por tag × 6 tags = 30) ─────────────
// Algunas llevan un 2º tag realista para que los queries por tag compuesto
// también devuelvan resultados (ej: foto de "culo" que también tiene "lencería").
const SINGLE_EXTRA_TAG_BY_INDEX = {
  // index 0..4 dentro del mismo tag
  culo:     { 2: 'lencería', 4: 'tanga' },
  tetas:    { 2: 'lencería' },
  coño:     {},
  lencería: { 2: 'tacones', 4: 'tetas' },
  tacones:  { 3: 'lencería' },
  ducha:    { 2: 'tetas', 4: 'masturbándome' },
};

// ─── Sexting media: tipo (photo/video) por phase_hint ────────────────────────
// Regla: warm_up y cool_down = photo; teasing = photo; escalada = mix;
// climax = 50/50 photo/video. El mix se decide por order_hint % 2.
function tipoForSextingMedia(phase, order_hint) {
  if (phase === 'warm_up' || phase === 'cool_down' || phase === 'teasing') return 'photo';
  if (phase === 'escalada') return (order_hint % 3 === 0) ? 'video' : 'photo';
  if (phase === 'climax')   return (order_hint % 2 === 0) ? 'video' : 'photo';
  return 'photo';
}

// Tags temáticos por fase, con señal sobre lo que muestra el caption base.
function tagsForSextingMedia(phase, intensity) {
  if (phase === 'warm_up')  return ['lencería', 'tetas'];
  if (phase === 'teasing')  return ['tetas', 'lencería'];
  if (phase === 'escalada') return intensity === 'high' ? ['masturbándome', 'dildo', 'coño'] : ['masturbándome', 'coño'];
  if (phase === 'climax')   return ['squirt', 'masturbándome'];
  if (phase === 'cool_down') return ['tetas'];
  return [];
}

// intensity textual → intensidad numérica (legacy 1-5)
const INTENSITY_TO_NUM = { low: 2, medium: 3, high: 4, peak: 5 };

// ─── Derivar filas desde products.json ──────────────────────────────────────

function buildRows() {
  const products = getProducts();
  const rows = [];

  // 1) Videos: 1 row por video
  for (const v of products.videos) {
    rows.push({
      file_id: `TEST_${v.id}`,
      tipo: 'video',
      tags: v.tags,
      product_id: v.id,
      ordinal: null,
      destacado: v.destacado === true,
      reserved_for_sexting: false,
      intensity: null,
      intensidad: 3,
      precio: v.precio_eur,
      descripcion: v.titulo,
    });
  }

  // 2) Photo packs: num_fotos rows por pack, ordinal 1..N
  for (const pk of products.photo_packs) {
    for (let i = 1; i <= pk.num_fotos; i++) {
      const nn = String(i).padStart(2, '0');
      rows.push({
        file_id: `TEST_${pk.id}_${nn}`,
        tipo: 'photo',
        tags: pk.tags,
        product_id: pk.id,
        ordinal: i,
        destacado: false,
        reserved_for_sexting: false,
        intensity: null,
        intensidad: 3,
        precio: null, // el precio se cobra por el pack completo, no por foto
        descripcion: `${pk.titulo} — foto ${i}/${pk.num_fotos}`,
      });
    }
  }

  // 3) Fotos sueltas: 5 por cada tag de photo_single
  for (const tag of products.photo_single.tags_disponibles) {
    const extras = SINGLE_EXTRA_TAG_BY_INDEX[tag] || {};
    for (let i = 1; i <= 5; i++) {
      const nn = String(i).padStart(2, '0');
      const tags = [tag];
      const extra = extras[i - 1];
      if (extra && extra !== tag) tags.push(extra);
      rows.push({
        file_id: `TEST_single_${tag}_${nn}`,
        tipo: 'photo',
        tags,
        product_id: null,
        ordinal: null,
        destacado: false,
        reserved_for_sexting: false,
        intensity: null,
        intensidad: 3,
        precio: null, // calculado dinámicamente con calculatePhotoPrice(n)
        descripcion: `foto suelta ${tag} ${i}`,
      });
    }
  }

  // 4) Sexting pools: 1 row por cada entrada de media_pool
  for (const tpl of products.sexting_templates) {
    for (const m of tpl.media_pool) {
      const tipo = tipoForSextingMedia(m.phase_hint, m.order_hint);
      rows.push({
        file_id: `TEST_${m.media_id}`,
        tipo,
        tags: tagsForSextingMedia(m.phase_hint, m.intensity),
        product_id: m.media_id,   // ext_m_XXX — cada media tiene su propio logical id
        ordinal: m.order_hint,
        destacado: false,
        reserved_for_sexting: true,
        intensity: m.intensity,
        intensidad: INTENSITY_TO_NUM[m.intensity] ?? 3,
        precio: null,
        descripcion: `${tpl.id} · ${m.phase_hint} · ${m.caption_base}`,
      });
    }
  }

  return rows;
}

// ─── I/O ────────────────────────────────────────────────────────────────────

async function clean() {
  const res = await query(`DELETE FROM media WHERE file_id LIKE 'TEST_%'`);
  console.log(`Cleaned ${res.rowCount} TEST_* media row(s)`);
}

async function insertAll(rows) {
  let inserted = 0;
  let skipped = 0;
  for (const r of rows) {
    const res = await query(
      `INSERT INTO media
         (file_id, tipo, tags, intensidad, precio_individual_eur, descripcion,
          activo, product_id, ordinal, destacado, reserved_for_sexting, intensity)
       VALUES ($1, $2, $3::text[], $4, $5, $6, TRUE, $7, $8, $9, $10, $11)
       ON CONFLICT (file_id) DO NOTHING
       RETURNING id`,
      [
        r.file_id, r.tipo, r.tags, r.intensidad, r.precio, r.descripcion,
        r.product_id, r.ordinal, r.destacado, r.reserved_for_sexting, r.intensity,
      ],
    );
    if (res.rowCount > 0) inserted++;
    else skipped++;
  }
  return { inserted, skipped };
}

function summarize(rows) {
  const byCat = { videos: 0, pack_photos: 0, singles: 0, sexting: 0 };
  for (const r of rows) {
    if (r.reserved_for_sexting) byCat.sexting++;
    else if (r.tipo === 'video') byCat.videos++;
    else if (r.product_id) byCat.pack_photos++;
    else byCat.singles++;
  }
  return byCat;
}

async function main() {
  const rows = buildRows();
  const cats = summarize(rows);
  console.log(`Rows a insertar: ${rows.length}`);
  console.log(`  videos:      ${cats.videos}`);
  console.log(`  pack photos: ${cats.pack_photos}`);
  console.log(`  singles:     ${cats.singles}`);
  console.log(`  sexting:     ${cats.sexting}`);

  if (CLEAN) await clean();
  const { inserted, skipped } = await insertAll(rows);
  console.log(`\nDone: ${inserted} inserted, ${skipped} skipped (ya existían).`);
}

main()
  .catch((err) => {
    console.error('seed-test-content failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
