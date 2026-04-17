// Seed script for development data — never run in production
import { query, closePool } from '../src/lib/db.js';
import { logger } from '../src/lib/logger.js';

if (process.env.NODE_ENV === 'production') {
  logger.error('seed must not run in production');
  process.exit(1);
}

logger.info('seeding dev data...');

// ─── Test client ──────────────────────────────────────────────────────────────

await query(`
  INSERT INTO clients (telegram_user_id, username, first_name, estado)
  VALUES (999999999, 'test_user', 'TestUser', 'active')
  ON CONFLICT (telegram_user_id) DO NOTHING
`);

// ─── Playlist: Calentón Rápido (10 min, 6 phases) ────────────────────────────

await query(
  `INSERT INTO sexting_playlists (id, name, duration_minutes, phases)
   VALUES ('calenton_rapido', 'Calentón Rápido', 10, $1::jsonb)
   ON CONFLICT (id) DO UPDATE SET phases = EXCLUDED.phases`,
  [JSON.stringify([
    {
      phase_index: 0,
      name: 'Arranque',
      start_offset_seconds: 0,
      intensity: 1,
      prompt_hint: 'Estás en modo sexting. Arranca lento y sensual.',
      mensaje_base: 'llevas un rato en mi cabeza bebe',
    },
    {
      phase_index: 1,
      name: 'Calentamiento',
      start_offset_seconds: 120,
      intensity: 2,
      prompt_hint: 'Sube la intensidad. Describe lo que llevas puesto.',
      mensaje_base: 'te gusta como me queda esta lencería bebe?',
    },
    {
      phase_index: 2,
      name: 'Tensión',
      start_offset_seconds: 270,
      intensity: 3,
      prompt_hint: 'Más explícita, lenguaje más directo.',
      mensaje_base: 'mira mi culito, está durísimo del gym',
    },
    {
      phase_index: 3,
      name: 'Subida',
      start_offset_seconds: 390,
      intensity: 4,
      prompt_hint: 'Intensidad creciente. Muy directo.',
      mensaje_base: 'me estoy quitando el sujetador para ti',
    },
    {
      phase_index: 4,
      name: 'Clímax',
      start_offset_seconds: 480,
      intensity: 5,
      prompt_hint: 'Lleva la sesión al clímax. Muy explícita.',
      mensaje_base: 'no puedo más bebe, esto se está poniendo muy intenso',
    },
    {
      phase_index: 5,
      name: 'Bajada',
      start_offset_seconds: 540,
      intensity: 3,
      prompt_hint: 'Empieza a bajar el ritmo suavemente.',
      mensaje_base: 'ha sido increíble esto, dime que tú también lo has disfrutado',
    },
  ])],
);

// ─── Playlist: Noche Completa (20 min, 9 phases) ─────────────────────────────

await query(
  `INSERT INTO sexting_playlists (id, name, duration_minutes, phases)
   VALUES ('noche_completa', 'Noche Completa', 20, $1::jsonb)
   ON CONFLICT (id) DO UPDATE SET phases = EXCLUDED.phases`,
  [JSON.stringify([
    {
      phase_index: 0,
      name: 'Conexión',
      start_offset_seconds: 0,
      intensity: 1,
      prompt_hint: 'Empieza despacio, crea conexión y anticipación.',
      mensaje_base: 'buenas noches bebe, qué tienes en mente esta noche',
    },
    {
      phase_index: 1,
      name: 'Coqueteo',
      start_offset_seconds: 120,
      intensity: 2,
      prompt_hint: 'Empieza a coquetear en serio.',
      mensaje_base: 'me alegra que hayas escrito, llevaba pensando en ti',
    },
    {
      phase_index: 2,
      name: 'Calentamiento',
      start_offset_seconds: 360,
      intensity: 2,
      prompt_hint: 'Sube la temperatura. Describe lo que llevas puesto.',
      mensaje_base: 'sabes que tengo puesto ahora mismo algo que te va a gustar',
    },
    {
      phase_index: 3,
      name: 'Tensión',
      start_offset_seconds: 600,
      intensity: 3,
      prompt_hint: 'Tensión máxima. Lenguaje más explícito.',
      mensaje_base: 'me estás volviendo loca bebe, sigue así',
    },
    {
      phase_index: 4,
      name: 'Subida',
      start_offset_seconds: 720,
      intensity: 4,
      prompt_hint: 'Intensidad creciente. Muy directo.',
      mensaje_base: 'no puedo parar de pensar en lo que me estás haciendo',
    },
    {
      phase_index: 5,
      name: 'Clímax',
      start_offset_seconds: 900,
      intensity: 5,
      prompt_hint: 'Lleva todo al clímax. Muy explícita.',
      mensaje_base: 'dios bebe esto es demasiado, me estás matando',
    },
    {
      phase_index: 6,
      name: 'Pausa',
      start_offset_seconds: 960,
      intensity: 3,
      prompt_hint: 'Momento de respiro, íntimo.',
      mensaje_base: 'para para que necesito respirar jajaja',
    },
    {
      phase_index: 7,
      name: 'Segunda ronda',
      start_offset_seconds: 1020,
      intensity: 4,
      prompt_hint: 'Segunda oleada de intensidad.',
      mensaje_base: 'bueno igual no he terminado contigo todavía',
    },
    {
      phase_index: 8,
      name: 'Cierre',
      start_offset_seconds: 1110,
      intensity: 4,
      prompt_hint: 'Cierra con calor, que quede con ganas de volver.',
      mensaje_base: 'ha sido una noche increíble bebe, ya sabes donde encontrarme',
    },
  ])],
);

logger.info('seed complete');
await closePool();
