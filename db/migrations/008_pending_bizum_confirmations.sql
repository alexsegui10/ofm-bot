CREATE TABLE IF NOT EXISTS pending_bizum_confirmations (
  id                    SERIAL PRIMARY KEY,
  client_id             INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  transaction_id        INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
  amount                DECIMAL(10,2) NOT NULL,
  partner_notified_at   TIMESTAMPTZ,
  partner_response      TEXT,
  partner_response_at   TIMESTAMPTZ,
  status                TEXT DEFAULT 'pending'
                          CHECK (status IN ('pending', 'confirmed', 'denied', 'auto_approved', 'refunded')),
  metadata              JSONB DEFAULT '{}',
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bizum_client_id ON pending_bizum_confirmations(client_id);
CREATE INDEX IF NOT EXISTS idx_bizum_status    ON pending_bizum_confirmations(status);
