CREATE TABLE IF NOT EXISTS pending_payments (
  id              SERIAL PRIMARY KEY,
  client_id       INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  payment_id      TEXT UNIQUE NOT NULL,
  payment_method  TEXT NOT NULL
                    CHECK (payment_method IN ('nowpayments', 'paypal', 'telegram_stars', 'bizum')),
  amount_eur      DECIMAL(10,2) NOT NULL,
  product_type    TEXT,
  product_id      TEXT,
  expires_at      TIMESTAMPTZ,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_payments_client_id  ON pending_payments(client_id);
CREATE INDEX IF NOT EXISTS idx_pending_payments_payment_id ON pending_payments(payment_id);
CREATE INDEX IF NOT EXISTS idx_pending_payments_expires_at ON pending_payments(expires_at);
