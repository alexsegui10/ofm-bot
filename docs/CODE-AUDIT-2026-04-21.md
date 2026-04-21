# CODE AUDIT 2026-04-21

Baseline de salud del proyecto tras 3 días de iteración intensiva. Formato lista, sin relleno. Cada hallazgo con archivo:línea cuando aplica.

---

## 1. Dead code identificado

### 1.1 `src/orchestrator.js:841-842` (ya documentado en NOTES.md)
Segunda rama `else if (resolvedIntent === 'videocall_request')` — nunca dispara porque la rama 833 (`videocall_request || custom_video_request`) la captura antes. **Eliminable.**

### 1.2 `src/agents/human-handoff.js:7,15` — placeholders que siempre throw
```js
export async function initiateHandoff(_input) {
  throw new Error('HumanHandoff not implemented yet — FASE 6');
}
export async function resolveHandoff(_input) {
  throw new Error('HumanHandoff not implemented yet — FASE 6');
}
```
Cero imports en todo el código (verificado con grep). Queda como módulo deprecated. **Recomendación:** añadir JSDoc `@deprecated — ver src/services/chat-pause.js` al archivo tras implementar C4. No eliminar todavía: podría confundir al crear expectativa de feature.

### 1.3 `src/agents/content-curator.js:9` — placeholder
`throw new Error('ContentCurator not implemented yet — FASE 5')`. Mismo patrón. No se usa.

### 1.4 `src/lib/payments/paypal.js:19,24,29` — 3 throws
PayPal entero es placeholder. `env.PAYPAL_ENABLED=false` por defecto, así que nunca se invoca. Comentado "TODO: implement when PAYPAL_ENABLED=true". **Aceptable** mientras PayPal siga desactivado.

### 1.5 `src/handlers/business.js:91` wrapper kept-for-utility
Comentario: *"Used in FASE 2 manual tests and kept for utility use"* — hay funciones expuestas en este archivo que sólo las usan tests. Probablemente limpiable cuando se saquen las que no aportan valor runtime.

### 1.6 `assistantHasShownCatalog` en `src/orchestrator.js` (deprecated wrapper)
El comentario en la migración 015 menciona que esta función se reemplazó por el flag persistente `clients.has_seen_catalog` pero se mantuvo "exportada como wrapper deprecado". Validar si ya se puede eliminar — ningún código de producción debería llamarla.

---

## 2. TODOs y FIXMEs

### Alta prioridad
- `src/agents/human-handoff.js:7,15` — FASE 6, aborda en C4 de SPEC-HANDOFF-V1.
- `src/agents/content-curator.js:9` — FASE 5. Bloquea entrega de contenido post-pago (crítico para flujo real).
- `src/lib/payments/bizum-timer.js:88` — `// TODO FASE 5: trigger content delivery via content-curator`. Mismo bloqueo que anterior.
- `src/handlers/payments.js:62` — `// TODO FASE 5: trigger content delivery via content-curator`. Idem.

### Media prioridad
- `src/lib/payments/paypal.js:18` — `// TODO: implement when PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are set`. No urgente (PayPal desactivado).
- `src/agents/payment-verifier.js:79` — `// TODO: implement when PAYPAL_ENABLED=true`.

### Baja prioridad
- No hay FIXME, HACK o XXX explícitos en el código (búsqueda con grep exhaustiva, 0 matches).

**Patrón global:** los TODOs están bien etiquetados con FASE, lo cual es positivo — son deuda conocida, no deuda oculta.

---

## 3. Patrones problemáticos repetidos (max 10)

### 3.1 Silent catch con log.warn — "non-fatal" abundante en orchestrator
`src/orchestrator.js:437, 455, 494, 514, 724, 755` y otros:
```js
} catch (err) {
  log.warn({ err, ... }, 'setPendingProduct ... failed (non-fatal)');
}
```
Siete ocurrencias en orchestrator. El patrón "degrada silenciosamente" es intencional pero **opaca bugs reales en producción**. Recomendación: considerar un counter/metric por cada "non-fatal" y revisar cuáles disparan >0 en producción.

### 3.2 Business.js pipeline-error swallowed (ya enriquecido en ae5138c)
`src/handlers/business.js:208-219` — único catch del pipeline completo, ya tiene stack trace enriquecido pero sigue **swallowing** la excepción. Si el pipeline falla, el cliente ve silencio. **Decisión arquitectural** aceptada en la refutación del empty-turn-1, pero vale la pena re-evaluar cuando haya monitoring en prod.

### 3.3 fake-client polling con timeout hardcoded
`scripts/fake-client.js` — `timeoutMs = 60_000, pollMs = 500, quietMs = 4_000`. Valores mágicos que no se configuran vía env. Si la pipeline se vuelve más lenta en prod (más media en sexting, más retries), el timeout puede expirar spuriously. Tests pasan en local; podrían fallar en VPS más lento.

### 3.4 Queries raw SQL sin PreparedStatement
Todos los `query(text, params)` usan parametrización ($1, $2), correcto. No hay concatenación de strings sospechosa. **Sin hallazgo negativo aquí — nota positiva.**

### 3.5 TEST_MODE mezclado con lógica de negocio
`src/lib/telegram.js` tiene `if (env.TEST_MODE)` mezclado con cada método `sendMessage`, `sendMedia`, `sendChatAction`. La lógica TEST_MODE vive acoplada al adapter Telegram. Si mañana hay otro canal (email, WhatsApp), habría que replicar el patrón. **Recomendación:** extraer un `MessageAdapter` con backends `TelegramBackend` y `TestRecordingBackend`, inyectables. No urgente.

### 3.6 Regex de intent inference repetida
`src/orchestrator.js` tiene múltiples bloques que inspeccionan `savedText` con regex (bot-question, security-question, PayPal mention, harassment, etc.). Cada uno es una short-circuit bien aislada pero no hay un "pipeline de pre-filters" explícito. Si se añade un 4º short-circuit habrá que añadir una cláusula manual más.

### 3.7 console.log en scripts (intencional)
`scripts/*.js` usan `console.log` en vez del logger del proyecto. Aceptable para scripts one-shot, pero **scripts/auto-iterate.js** sí tiene lógica compleja — dejarlo en console.log hace que stdout sea el único log disponible y complica debug.

### 3.8 Sin rate-limiting en webhook
`src/app.js` (no listado aquí) — el endpoint `/webhook/telegram` no tiene rate-limit. Si alguien descubre la URL, puede saturar. En producción bajo dominio legítimo es bajo riesgo, pero vale la pena añadir middleware defensivo.

### 3.9 `.then(…)` en tests (no código productivo)
Los únicos 8 `.then` que encontré son en `router.test.js` con estilo inconsistente. Otros tests usan `await`. Coherencia cosmética, no bug.

### 3.10 Sin circuit breaker para LLM APIs
OpenRouter/Anthropic caen o se ponen lentos — el código depende de ellos sin backoff estructurado. Router tiene fallback a `small_talk`, Persona tiene fallback de modelo, pero no hay circuit breaker global que diga "Anthropic devuelve 5xx sostenido, deja de intentar 30s". Riesgo medio cuando haya carga real.

---

## 4. Zonas sin cobertura de tests

### Archivos sin `.test.js` correspondiente
Código de producción sin tests unitarios/integración:

- `src/agents/content-curator.js` — placeholder throw, aceptable
- `src/agents/human-handoff.js` — placeholder throw, aceptable
- `src/config/env.js` — wrapper trivial de `process.env`, aceptable
- `src/config/products.js` — **crítico**: valida products.json, errores aquí rompen arranque del server. **Sin tests.**
- `src/index.js` — entry-point, aceptable
- `src/lib/conversation.js` — **probable crítico** (maneja historial de mensajes). **Sin tests.**
- `src/lib/llm-client.js` — **crítico**: wrapper OpenRouter + Anthropic con fallback. **Sin tests.** Un bug aquí afecta todo el pipeline.
- `src/lib/logger.js` — trivial pino wrapper, aceptable
- `src/lib/payments/paypal.js` — placeholder throw
- `src/lib/persona-config.js` — lee persona.md, estático
- `src/lib/pricing.js` — **crítico** (PHOTO_PRICE_TABLE, calculatePhotoPrice), tests indirectos vía sales.test.js pero **sin test directo**.
- `src/lib/telegram.js` — **crítico** (sendMessage, sendMedia). **Sin tests.** Mockeado en otros tests pero no testeado en sí.
- `src/lib/twilio.js` — crítico para Sistema handoff. **Sin tests.** Aceptable mientras se mocke upstream (notify-owner.test.js ya lo mockea).

### Foco recomendado para subir cobertura
- `src/lib/llm-client.js` — wrapper de 2 proveedores LLM con fallback. Bug silencioso aquí propaga a todo.
- `src/lib/telegram.js` — hit Telegram real en producción. Un bug de `sendMessage` no lo ve nadie hasta que un cliente no recibe el mensaje.
- `src/lib/pricing.js` — tests directos de PHOTO_PRICE_TABLE + calculatePhotoPrice + edge cases (count > 10 throw).
- `src/config/products.js` — validate() se ejecuta al arrancar, no tiene tests de casos rotos (falta campo, tag inválido).

---

## 5. Dependencias npm

### `npm outdated` (2026-04-21):
```
Package            Current   Wanted   Latest
@anthropic-ai/sdk   0.52.0   0.52.0   0.90.0  (major +)
dotenv              16.6.1   16.6.1   17.4.2  (major +)
express             4.22.1   4.22.1    5.2.1  (major — breaking changes típicos)
openai             4.104.0  4.104.0   6.34.0  (dos majors)
pino                9.14.0   9.14.0   10.3.1  (major +)
twilio              5.13.1   5.13.1    6.0.0  (major +)
vitest               3.2.4    3.2.4    4.1.5  (major +)
```
**7 paquetes con major updates pendientes.** Anthropic SDK especialmente relevante — versión 0.90 vs nuestra 0.52 puede tener fixes importantes de streaming/errores.

### `npm audit`:
**`found 0 vulnerabilities`** — limpio.

### Recomendación
No aplicar ahora (regla "no correr baseline, no tocar código productivo salvo Tarea 1"). **PENDIENTE decisión Alex:** priorizar actualización de `@anthropic-ai/sdk` y `openai` en sprint propio antes de producción real — las APIs de Anthropic cambian rápido, estar en 0.52.0 es arriesgado.

---

## 6. Queries SQL sin índices

**Sin hallazgo negativo.** Revisión de todas las migraciones (001-017):

- `clients.telegram_user_id`: ✓ indexado (mig 001)
- `conversations.client_id + created_at`: ✓ indexado (mig 002)
- `transactions.client_id, payment_id, status`: ✓ todos indexados (mig 003)
- `media.tipo, tags (GIN), intensidad`: ✓ (mig 004)
- `pending_payments.*`: ✓ todos los campos filtrados tienen índice (mig 006)
- `handoff_sessions.client_id, status`: ✓ (mig 007)
- `pending_bizum_confirmations.*`: ✓ (mig 008)
- `sexting_sessions.*`: ✓ (mig 009)
- `test_sent_messages.chat_id + id`: ✓ (mig 012)
- `chat_pause_state.client_id + status` WHERE resumed_at IS NULL: ✓ (mig 016)
- `verification_audios.rotation`: ✓ (mig 017)

Buen estado del schema.

---

## 7. Archivos grandes (>300 líneas, posible refactor)

| Líneas | Archivo | Motivo / recomendación |
|---|---|---|
| **1112** | `src/orchestrator.js` | **Crítico — ver ORCHESTRATOR-AUDIT.md** (Tarea 5). Es el "god object" del proyecto. Refactor imprescindible antes de Sistema 4 (bonus) y producción real. |
| 607 | `src/lib/sexting-conductor.js` | Lógica event-driven compleja. Aceptable por densidad del dominio, pero algunos helpers podrían moverse a `src/lib/sexting-phases.js` dedicado. |
| 405 | `src/agents/sales.js` | `createOfferFromProduct` tiene 6 ramas (videos, packs, sexting, singles, videocall, custom) en una sola función. Podría partirse en resolvers por tipo. ROI medio. |
| 379 | `src/agents/message-pacer.js` | Contiene sleep/active/sexting delay logic. Cohesivo, OK. |
| 323 | `src/agents/payment-verifier.js` | Bizum + crypto + notify + timer todo aquí. Sub-dividible si se añade otro método. |
| 287 | `src/agents/persona.js` | Con los 3 post-processors (elongations, catalog-repeats, regen) ya empieza a tener muchos flujos. Límite aceptable. |
| 280 | `src/agents/sexting-conductor.js` | Orquestador event-driven de sexting. Complejidad justificada. |
| 270 | `src/lib/content-dispatcher.js` | Selección de media del pool. OK. |
| 265 | `src/lib/product-catalog.js` | Resolver productos + renderers. OK. |
| 254 | `src/agents/router.js` | Prompt template + llm call + parser. Dentro del rango. |

**Prioridad #1 absoluta: orchestrator.js.** Ver audit dedicado en Tarea 5.

---

## 8. Configuración / env

### Variables declaradas en `.env.example` y usadas en `src/config/env.js`
- ✓ TELEGRAM_BOT_TOKEN, TELEGRAM_BUSINESS_CONNECTION_ID
- ✓ ANTHROPIC_API_KEY, OPENROUTER_API_KEY, MODEL_PERSONA, MODEL_PERSONA_FALLBACK
- ✓ NOWPAYMENTS_API_KEY, NOWPAYMENTS_IPN_SECRET, PAYPAL_*
- ✓ TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM, OWNER_WHATSAPP_TO, PARTNER_WHATSAPP_TO
- ✓ DATABASE_URL, PORT, NODE_ENV, WEBHOOK_BASE_URL, TEST_MODE
- ✓ GITHUB_PERSONAL_ACCESS_TOKEN

### Variables usadas pero NO declaradas en `.env.example`
- **`ADMIN_TELEGRAM_USER_ID`** — leída en env.js (añadida en f8013ae para C2), pero NO está en .env.example. Riesgo: nuevo clone del repo no sabrá que existe. **Añadir a .env.example.**
- **`OWNER_TELEGRAM_USER_ID`** — idem. **Añadir a .env.example.**
- **`EVALUATOR_MODEL`** — leída en `scripts/evaluate-response.js:27`. Opcional (fallback `claude-sonnet-4-5-20250929`), pero convendría documentarla.
- **`FAKE_CLIENT_WEBHOOK_URL`** — leída en `scripts/fake-client.js:25` con fallback. Devops-only, aceptable.

### Variables declaradas en .env.example pero NO referenciadas en código
- **`GITHUB_PERSONAL_ACCESS_TOKEN`** — cero usos en src/ o scripts/. Declarada para MCP externo. Aceptable en .env.example como config de herramientas dev, pero vale la pena comentar que no es usada por el bot.

### Variables declaradas en env.js pero NO en .env.example
- Ninguna otra más allá de las 2 anteriores.

### PENDIENTE decisión Alex
- Añadir `ADMIN_TELEGRAM_USER_ID` + `OWNER_TELEGRAM_USER_ID` (con valor placeholder vacío) a `.env.example`. Trivial, no lo apliqué porque la regla de Tarea 2 es "solo documentar bugs reales, no fixearlos".

---

## Resumen ejecutivo

**Salud general: buena.** 0 vulnerabilidades, índices SQL completos, 761 tests en verde, TODOs etiquetados por fase.

**Zonas de alerta:**
1. **orchestrator.js 1112 líneas** — refactor inevitable antes de escalar.
2. **`@anthropic-ai/sdk 0.52 → 0.90`** — major update de 0.52 a 0.90. Actualizar en sprint propio con baseline de validación.
3. **Archivos críticos sin tests directos:** `llm-client.js`, `telegram.js`, `pricing.js`, `products.js`.
4. **FASE 5 Content Curator + FASE 6 Human Handoff** siguen siendo placeholders — bloquean flujo real end-to-end.
5. **`.env.example` desactualizado** en 2 vars nuevas (ADMIN/OWNER TELEGRAM_USER_ID).

No se detectaron bugs críticos que afecten producción actual. El código tiene disciplina de parametrización SQL, logging estructurado y tests unitarios abundantes.
