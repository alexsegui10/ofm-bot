-- Paso 8.5 — FIX 2 (T2): persistir el producto pendiente del cliente
--
-- Cuando el cliente elige un video/pack/sexting concreto (router intents
-- choose_video / choose_pack / buy_sexting_template), guardamos el
-- product_id + amount_eur en la fila del cliente para que la siguiente
-- vuelta — típicamente payment_method_selection — pueda recuperarlos
-- y crear la oferta con el precio REAL en lugar de re-resolver el intent
-- por el camino legacy (que en BASELINE-V2 alucinaba 7€ en A3/A4/H2).
--
-- TTL: si han pasado más de 30 minutos desde pending_set_at sin haber
-- pagado, el orquestador debe considerar el pending caducado y poner
-- estos campos a NULL (no se hace en BBDD: la responsabilidad es del
-- orquestador, así sólo gestionamos el dato aquí).

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS pending_product_id TEXT,
  ADD COLUMN IF NOT EXISTS pending_amount_eur NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS pending_set_at     TIMESTAMPTZ;
