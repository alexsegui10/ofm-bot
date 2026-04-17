CREATE TABLE IF NOT EXISTS conversations (
  id           SERIAL PRIMARY KEY,
  client_id    INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  role         TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content      TEXT NOT NULL,
  intent       TEXT,
  metadata     JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_client_id   ON conversations(client_id);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at  ON conversations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_client_time ON conversations(client_id, created_at DESC);
