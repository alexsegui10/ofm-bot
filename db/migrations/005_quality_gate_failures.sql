CREATE TABLE IF NOT EXISTS quality_gate_failures (
  id                    SERIAL PRIMARY KEY,
  client_id             INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  original_response     TEXT NOT NULL,
  failure_reason        TEXT NOT NULL,
  regenerated_response  TEXT,
  fallback_used         BOOLEAN DEFAULT FALSE,
  metadata              JSONB DEFAULT '{}',
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qg_failures_client_id  ON quality_gate_failures(client_id);
CREATE INDEX IF NOT EXISTS idx_qg_failures_created_at ON quality_gate_failures(created_at DESC);
