-- Sexting playlists: defines phase sequences for timed sexting sessions.
-- Phases are stored as a JSONB array. Each phase has:
--   phase_index: 0-based ordering
--   name: display name for logging
--   start_offset_seconds: seconds from session start when this phase fires
--   prompt_hint: internal instruction injected into Persona for this phase
--   intensity: 1 (soft) to 5 (explicit) — for future filtering

CREATE TABLE IF NOT EXISTS sexting_playlists (
  id              VARCHAR(50) PRIMARY KEY,
  name            VARCHAR(100) NOT NULL,
  duration_minutes SMALLINT NOT NULL CHECK (duration_minutes > 0),
  phases          JSONB NOT NULL DEFAULT '[]',
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Playlist: Calentón Rápido (10 min) ──────────────────────────────────────
INSERT INTO sexting_playlists (id, name, duration_minutes, phases) VALUES (
  'calenton_rapido',
  'Calentón Rápido',
  10,
  '[
    {
      "phase_index": 0,
      "name": "Arranque",
      "start_offset_seconds": 0,
      "prompt_hint": "Estás en modo sexting. Arranca lento y sensual — dile que llevas pensando en él desde que te escribió. Empieza a calentar el ambiente con frases cortas y provocadoras. Nada explícito todavía, solo tensión.",
      "intensity": 1
    },
    {
      "phase_index": 1,
      "name": "Calentamiento",
      "start_offset_seconds": 150,
      "prompt_hint": "Sube la intensidad. Describe lo que llevas puesto o lo que estás haciendo. Hazle preguntas sugestivas sobre lo que le gustaría ver o sentir. Tono más atrevido.",
      "intensity": 2
    },
    {
      "phase_index": 2,
      "name": "Tensión",
      "start_offset_seconds": 330,
      "prompt_hint": "Está caliente. Sé más explícita con lo que describes. Usa lenguaje más directo. Mantén el ritmo alto y provócale con detalles sensoriales.",
      "intensity": 3
    },
    {
      "phase_index": 3,
      "name": "Clímax",
      "start_offset_seconds": 510,
      "prompt_hint": "Lleva la sesión al clímax. Sé muy explícita. Deja claro que es el momento más intenso. Si quiere más puede pedir una extensión de sesión.",
      "intensity": 5
    }
  ]'
) ON CONFLICT (id) DO NOTHING;

-- ─── Playlist: Noche Completa (20 min) ───────────────────────────────────────
INSERT INTO sexting_playlists (id, name, duration_minutes, phases) VALUES (
  'noche_completa',
  'Noche Completa',
  20,
  '[
    {
      "phase_index": 0,
      "name": "Conexión",
      "start_offset_seconds": 0,
      "prompt_hint": "Estás en modo sexting. Empieza despacio — pregúntale cómo está, qué tiene en mente esta noche. Crea conexión y anticipación. Tono íntimo pero tranquilo.",
      "intensity": 1
    },
    {
      "phase_index": 1,
      "name": "Coqueteo",
      "start_offset_seconds": 120,
      "prompt_hint": "Empieza a coquetear en serio. Dile lo que te gusta de hablar con él. Describe algo sugerente de tu situación actual. Tono juguetón y levemente insinuante.",
      "intensity": 2
    },
    {
      "phase_index": 2,
      "name": "Calentamiento",
      "start_offset_seconds": 360,
      "prompt_hint": "Sube la temperatura. Describe con detalle lo que llevas puesto o imaginás que está pasando entre vosotros. Preguntas más directas sobre sus gustos.",
      "intensity": 2
    },
    {
      "phase_index": 3,
      "name": "Tensión",
      "start_offset_seconds": 600,
      "prompt_hint": "Tensión máxima. Lenguaje más explícito. Describe acciones concretas, detalladas. Mantén el foco en las sensaciones físicas.",
      "intensity": 3
    },
    {
      "phase_index": 4,
      "name": "Clímax",
      "start_offset_seconds": 900,
      "prompt_hint": "Lleva todo al clímax. Sé muy explícita y directa. Máxima intensidad. Puedes sugerir que queda poco tiempo si quiere seguir.",
      "intensity": 5
    },
    {
      "phase_index": 5,
      "name": "Cierre",
      "start_offset_seconds": 1110,
      "prompt_hint": "La sesión termina en breve. Cierra con intensidad pero también con calor — que quede con ganas de volver. Puedes mencionar que pueden repetirlo cuando quiera.",
      "intensity": 4
    }
  ]'
) ON CONFLICT (id) DO NOTHING;
