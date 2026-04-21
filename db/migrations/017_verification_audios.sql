-- Sistema 3 (SPEC-HANDOFF-V1 §3): pool de audios pregrabados de Alba.
--
-- Cuando el cliente pregunta en serio si Alba es una IA y el timer de 5 min
-- vence sin que Alex responda, el bot envía un audio de este pool. La tabla
-- arranca vacía — Alba grabará y Alex subirá los audios más tarde. Mientras
-- no haya audios, el caller (Sistema 3) usa un fallback de texto.
--
-- Campos de rotación (last_used_at, use_count) permiten al servicio elegir
-- el audio menos usado, evitando que siempre se envíe el mismo. Si el caller
-- quiere evitar repetir al mismo cliente, puede pasar excludedIds explícito.
CREATE TABLE IF NOT EXISTS verification_audios (
  id            SERIAL PRIMARY KEY,
  file_path     TEXT NOT NULL,
  transcript    TEXT,
  context_tag   TEXT NOT NULL DEFAULT 'verification',
  last_used_at  TIMESTAMPTZ,
  use_count     INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index optimizado para getRandomVerificationAudio:
-- ORDER BY context_tag → last_used_at NULLS FIRST → use_count ASC → id ASC.
CREATE INDEX IF NOT EXISTS idx_verification_audios_rotation
  ON verification_audios(context_tag, last_used_at NULLS FIRST, use_count, id);
