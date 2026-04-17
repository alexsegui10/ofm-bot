CREATE TABLE IF NOT EXISTS clients (
  id                        SERIAL PRIMARY KEY,
  telegram_user_id          BIGINT UNIQUE NOT NULL,
  business_connection_id    TEXT,
  username                  TEXT,
  first_name                TEXT,
  last_name                 TEXT,
  profile                   JSONB DEFAULT '{}',
  estado                    TEXT DEFAULT 'active'
                              CHECK (estado IN ('active', 'blocked', 'vip', 'time_waster')),
  total_gastado             DECIMAL(10,2) DEFAULT 0,
  num_compras               INTEGER DEFAULT 0,
  ultima_interaccion        TIMESTAMPTZ,
  handoff_pending           BOOLEAN DEFAULT FALSE,
  pending_payment           BOOLEAN DEFAULT FALSE,
  payment_id                TEXT,
  fraud_score               DECIMAL(3,2) DEFAULT 0 CHECK (fraud_score BETWEEN 0 AND 1),
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_telegram_user_id ON clients(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_clients_estado ON clients(estado);
