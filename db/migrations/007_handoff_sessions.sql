CREATE TABLE IF NOT EXISTS handoff_sessions (
  id              SERIAL PRIMARY KEY,
  client_id       INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN ('videocall', 'custom_video')),
  status          TEXT DEFAULT 'pending'
                    CHECK (status IN ('pending', 'active', 'resolved', 'expired')),
  client_summary  TEXT,
  custom_details  JSONB DEFAULT '{}',
  notified_at     TIMESTAMPTZ,
  resolved_at     TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_handoff_sessions_client_id ON handoff_sessions(client_id);
CREATE INDEX IF NOT EXISTS idx_handoff_sessions_status    ON handoff_sessions(status);
