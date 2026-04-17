CREATE TABLE IF NOT EXISTS transactions (
  id              SERIAL PRIMARY KEY,
  client_id       INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  payment_id      TEXT UNIQUE,
  payment_method  TEXT NOT NULL
                    CHECK (payment_method IN ('nowpayments', 'paypal', 'telegram_stars', 'bizum')),
  amount_eur      DECIMAL(10,2) NOT NULL,
  status          TEXT DEFAULT 'pending'
                    CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  product_type    TEXT,
  product_id      TEXT,
  metadata        JSONB DEFAULT '{}',
  paid_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_client_id     ON transactions(client_id);
CREATE INDEX IF NOT EXISTS idx_transactions_payment_id    ON transactions(payment_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status        ON transactions(status);
