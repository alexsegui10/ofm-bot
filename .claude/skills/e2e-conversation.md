# Skill: e2e-conversation

## Cuándo se usa
Para correr una simulación completa de un cliente desde cero, verificando
que todo el pipeline funciona end-to-end: Telegram → Router → Persona → Pago → Entrega.

## Prerequisitos
- Playwright instalado y configurado
- Bot corriendo en local con `npm run dev`
- BBDD con seed de datos de prueba (`npm run db:seed`)
- Cuenta de Telegram de prueba configurada en `.env`

## Workflow de simulación

### Paso 1 — Spawn cliente sintético via Playwright en Telegram Web
```js
// tests/e2e/synthetic-client.js
const { chromium } = require('playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('https://web.telegram.org');
// Login con cuenta de prueba...
```

### Paso 2 — Script de conversación estándar
El cliente sintético sigue este script:
1. **Saludo:** "hola" → bot debe responder en < 8 segundos
2. **Coqueteo:** mensaje de coqueteo básico → bot responde en personaje
3. **Pregunta de precio:** "cuánto cuesta ver tus fotos?" → bot presenta catálogo
4. **Compra:** cliente selecciona producto → bot genera invoice
5. **Pago simulado:** webhook de pago completado
6. **Recepción:** verificar que el cliente recibe el contenido

### Paso 3 — Verificación de timing en cada turno
Cada respuesta del bot debe llegar en **menos de 8 segundos**.
Si algún turno supera 8 segundos, registrar el timeout como fallo.

### Paso 4 — Verificación del flujo de pago end-to-end
```sql
-- Verificar que la transacción quedó registrada
SELECT * FROM transactions WHERE user_id = (SELECT id FROM users WHERE telegram_id = TEST_USER_ID);
-- Verificar entrega de contenido
SELECT * FROM content_deliveries WHERE transaction_id = LAST_TRANSACTION_ID;
```

### Paso 5 — Reporte final
El test devuelve:
```json
{
  "success": true/false,
  "turns": [
    { "userMessage": "...", "botResponse": "...", "responseTimeMs": 1234 }
  ],
  "tokensConsumed": { "input": 0, "output": 0 },
  "errors": [],
  "screenshotPath": "tests/e2e/screenshots/run-TIMESTAMP.png",
  "dbState": { "transactionStatus": "paid", "contentDelivered": true }
}
```

## Perfiles de cliente para tests
- **Nuevo:** nunca ha interactuado antes, sin perfil en BBDD
- **VIP:** cliente con historial de compras, debe recibir trato preferente
- **Regateador:** pregunta precios repetidamente, intenta rebajar
- **Time-waster:** mensajes sin intención de compra, Router debe identificarlo

Cada perfil tiene su propio script de conversación en `tests/e2e/profiles/`.
