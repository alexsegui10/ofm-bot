-- Paso 2 del rediseño v2:
--   · extender `media` con los campos que liga al nuevo products.json y al
--     motor de sexting conversacional (product_id, ordinal, destacado,
--     reserved_for_sexting, intensity)
--   · crear `sexting_sessions_state` (1-a-1 con `sexting_sessions`) para el
--     estado interno del motor de sexting (fase, media pool snapshot,
--     contadores de cadencia, etc.)
--
-- El runner (src/lib/db.js:runMigrations) sólo ejecuta la parte UP. El bloque
-- DOWN al final queda comentado como referencia si alguna vez hace falta
-- revertir manualmente.

-- ─── UP ──────────────────────────────────────────────────────────────────────

ALTER TABLE media ADD COLUMN IF NOT EXISTS product_id           TEXT;
ALTER TABLE media ADD COLUMN IF NOT EXISTS ordinal              INTEGER;
ALTER TABLE media ADD COLUMN IF NOT EXISTS destacado            BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE media ADD COLUMN IF NOT EXISTS reserved_for_sexting BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE media ADD COLUMN IF NOT EXISTS intensity            TEXT
  CHECK (intensity IS NULL OR intensity IN ('low', 'medium', 'high', 'peak'));

-- Lookups frecuentes del Sales/Curator.
CREATE INDEX IF NOT EXISTS idx_media_product_id
  ON media(product_id);
CREATE INDEX IF NOT EXISTS idx_media_reserved_for_sexting
  ON media(reserved_for_sexting)
  WHERE reserved_for_sexting = TRUE;
CREATE INDEX IF NOT EXISTS idx_media_destacado
  ON media(destacado)
  WHERE destacado = TRUE;

-- Orden estable dentro de un pack (product_id, ordinal). No UNIQUE todavía
-- porque durante el seed puede haber medias sin product_id (NULL) y porque
-- fotos sueltas por tag comparten ordinal NULL.

-- ─── sexting_sessions_state ─────────────────────────────────────────────────
-- 1-a-1 con sexting_sessions: la sesión de negocio (pago, duración pagada,
-- high-level status) vive en sexting_sessions; el estado del motor
-- conversacional vive aquí. Al iniciar un sexting se crean rows en ambas.

CREATE TABLE IF NOT EXISTS sexting_sessions_state (
  id                         SERIAL PRIMARY KEY,
  session_id                 INTEGER NOT NULL UNIQUE REFERENCES sexting_sessions(id) ON DELETE CASCADE,
  client_id                  INTEGER NOT NULL REFERENCES clients(id),

  template_id                TEXT    NOT NULL,       -- st_5min / st_10min / st_15min
  actual_duration_min        INTEGER NOT NULL,

  started_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at                   TIMESTAMPTZ,
  end_reason                 TEXT,                    -- time_up / climax / client_cold / refund / error

  current_phase              TEXT NOT NULL DEFAULT 'warm_up'
                               CHECK (current_phase IN ('warm_up', 'teasing', 'escalada', 'climax', 'cool_down')),

  media_sent_count           INTEGER NOT NULL DEFAULT 0,
  messages_since_last_media  INTEGER NOT NULL DEFAULT 0,
  last_media_sent_at         TIMESTAMPTZ,

  client_state               TEXT NOT NULL DEFAULT 'engaged'
                               CHECK (client_state IN ('engaged', 'rushed', 'cold', 'finished')),

  -- Snapshot del media_pool al iniciar + marca de qué queda disponible.
  -- JSONB para poder filtrar con operadores -> sin desnormalizar.
  media_pool_snapshot        JSONB NOT NULL,

  -- Rol que pidió el cliente ("doctora", "profesora", etc). NULL = sin rol.
  roleplay_context           TEXT,

  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sexting_state_client_id
  ON sexting_sessions_state(client_id);
CREATE INDEX IF NOT EXISTS idx_sexting_state_ended_at
  ON sexting_sessions_state(ended_at)
  WHERE ended_at IS NULL;  -- sesiones activas — usado por restore_timers() al boot

-- ─── DOWN (referencia manual, no se ejecuta) ────────────────────────────────
-- DROP INDEX IF EXISTS idx_sexting_state_ended_at;
-- DROP INDEX IF EXISTS idx_sexting_state_client_id;
-- DROP TABLE IF EXISTS sexting_sessions_state;
--
-- DROP INDEX IF EXISTS idx_media_destacado;
-- DROP INDEX IF EXISTS idx_media_reserved_for_sexting;
-- DROP INDEX IF EXISTS idx_media_product_id;
--
-- ALTER TABLE media DROP COLUMN IF EXISTS intensity;
-- ALTER TABLE media DROP COLUMN IF EXISTS reserved_for_sexting;
-- ALTER TABLE media DROP COLUMN IF EXISTS destacado;
-- ALTER TABLE media DROP COLUMN IF EXISTS ordinal;
-- ALTER TABLE media DROP COLUMN IF EXISTS product_id;
