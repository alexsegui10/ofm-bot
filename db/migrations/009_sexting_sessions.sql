-- Sexting sessions: tracks an active timed sexting session per client.
-- current_roleplay: the role the client requested (e.g. "doctora", "profesora").
--   NULL = no specific role, Alba improvises freely.
--   Set by Sales Agent when role is requested before payment.
--   Updated by Persona Agent when client changes role mid-session.

CREATE TABLE IF NOT EXISTS sexting_sessions (
  id                     SERIAL PRIMARY KEY,
  client_id              INTEGER NOT NULL REFERENCES clients(id),
  transaction_id         INTEGER REFERENCES transactions(id),

  -- Session lifecycle
  status                 VARCHAR(20) NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'paused', 'completed', 'expired')),
  started_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at             TIMESTAMPTZ NOT NULL,
  completed_at           TIMESTAMPTZ,

  -- Conductor state: current phase index into the playlist
  current_phase          SMALLINT NOT NULL DEFAULT 0,
  playlist_id            VARCHAR(50),

  -- Dynamic roleplay: updated whenever client requests a new role
  current_roleplay       VARCHAR(100) NULL,

  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sexting_sessions_client_id ON sexting_sessions(client_id);
CREATE INDEX IF NOT EXISTS idx_sexting_sessions_status    ON sexting_sessions(status);
