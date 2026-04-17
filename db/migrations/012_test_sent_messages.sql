-- 012_test_sent_messages.sql
--
-- Tabla usada SOLO cuando TEST_MODE=true. Registra cada fragment que
-- el bot HABRÍA enviado al cliente vía Telegram. El loop de iteración
-- (scripts/auto-iterate.js + scripts/fake-client.js) lee de aquí para
-- obtener exactamente lo que vería el cliente — incluyendo fragments
-- que no se persisten en `conversations` (catálogo, category detail,
-- sales offers, media captions, stars invoice, etc.).
--
-- Fuera de TEST_MODE la tabla queda vacía. No se usa en producción.
-- Seguro de mantener en el esquema (idempotente, ligera).

CREATE TABLE IF NOT EXISTS test_sent_messages (
  id           SERIAL PRIMARY KEY,
  chat_id      BIGINT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('text', 'media', 'invoice')),
  content      TEXT NOT NULL,
  metadata     JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_test_sent_messages_chat_time
  ON test_sent_messages(chat_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_test_sent_messages_id
  ON test_sent_messages(id);
