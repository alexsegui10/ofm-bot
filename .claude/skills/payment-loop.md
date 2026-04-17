# Skill: payment-loop

## Cuándo se usa
Para debuggear el flujo de pagos end-to-end, ya sea con NowPayments (crypto),
PayPal, o Telegram Stars. Seguir este workflow garantiza que cada paso del
pipeline de pago funciona antes de asumir que el problema está en otro lado.

## Workflow end-to-end

### Paso 1 — Crea una transacción de prueba en BBDD
```sql
INSERT INTO transactions (user_id, amount, currency, provider, status, created_at)
VALUES (999, 9.99, 'USD', 'nowpayments', 'pending', NOW())
RETURNING id;
```
Guarda el `transaction_id` para los siguientes pasos.

### Paso 2 — Genera invoice via API del proveedor
Para NowPayments:
```bash
curl -X POST https://api.nowpayments.io/v1/invoice \
  -H "x-api-key: $NOWPAYMENTS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"price_amount": 9.99, "price_currency": "usd", "pay_currency": "usdtbsc", "order_id": "TRANSACTION_ID"}'
```

### Paso 3 — Simula webhook con firma correcta
```bash
# NowPayments IPN
PAYLOAD='{"payment_id":"...","payment_status":"finished","order_id":"TRANSACTION_ID"}'
SIG=$(echo -n "$PAYLOAD" | openssl dgst -sha512 -hmac "$NOWPAYMENTS_IPN_SECRET" | awk '{print $2}')
curl -X POST http://localhost:4000/webhooks/nowpayments \
  -H "x-nowpayments-sig: $SIG" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD"
```

### Paso 4 — Verifica que `transactions` se marca como `paid`
```sql
SELECT status, paid_at FROM transactions WHERE id = TRANSACTION_ID;
-- Debe ser: status='paid', paid_at IS NOT NULL
```

### Paso 5 — Verifica que Content Curator se dispara
Revisa los logs del servidor:
```bash
docker compose logs bot | grep "content-curator"
```
Debe aparecer el evento de entrega para `user_id=999`.

### Paso 6 — Verifica que el cliente recibe el contenido
Revisa en BBDD que `content_deliveries` tiene el registro y que el mensaje
fue enviado via Telegram:
```sql
SELECT * FROM content_deliveries WHERE transaction_id = TRANSACTION_ID;
```

## Cuando algo falla
Si cualquier paso falla, log detallado de:
- Qué payload llegó al endpoint
- Qué esperaba el código (schema de validación)
- El error exacto con stack trace
- El estado de la BBDD en ese momento
