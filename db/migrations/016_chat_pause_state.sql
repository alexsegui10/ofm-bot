-- Sistema 2 (SPEC-HANDOFF-V1 §2): pausa/reactivación manual de chats.
--
-- Tabla de HISTORIAL (no solo estado actual). Cada vez que se pausa un chat
-- se inserta una fila. resumed_at IS NULL → pausa activa para ese cliente.
-- Cuando se reactiva, se marca resumed_at = NOW() en la fila existente.
--
-- Estado 'active' NO es un row_state — se deriva como "ausencia de fila con
-- resumed_at NULL para este client_id". Por eso el CHECK excluye 'active':
-- evita que alguien inserte una fila 'active' que sería semánticamente vacía.
CREATE TABLE IF NOT EXISTS chat_pause_state (
  id                  SERIAL PRIMARY KEY,
  client_id           INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  status              TEXT NOT NULL DEFAULT 'paused_manual'
                        CHECK (status IN (
                          'paused_awaiting_videocall',
                          'paused_manual',
                          'paused_awaiting_human'
                        )),
  reason              TEXT,
  paused_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resumed_at          TIMESTAMPTZ,
  expected_resume_by  TIMESTAMPTZ,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Partial index optimizado para getChatStatus() y getPausedChats():
-- sólo indexamos filas activas (resumed_at NULL).
CREATE INDEX IF NOT EXISTS idx_chat_pause_state_active_by_client
  ON chat_pause_state(client_id) WHERE resumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_chat_pause_state_active_by_status
  ON chat_pause_state(status) WHERE resumed_at IS NULL;
