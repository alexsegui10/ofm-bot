# BASELINE V2 — Report

**Fecha:** 2026-04-17
**Comando:** `node scripts/auto-iterate.js --mode=baseline --scenarios-v2`
**Dataset:** `scripts/scenarios-v2.js` — 34 escenarios P1 (31 actualizados del legacy + 3 nuevos H1/H2/H3)
**Modelos activos:**
- Persona: `xai/grok-3-beta` (primario) + Dolphin-Mistral-Venice (fallback)
- Router / Quality / Sales / Evaluador: `claude-sonnet-4-6`

---

## Resumen ejecutivo

- **Pasaron: 8 / 34 (23.5%)**
- Fallaron: 26 / 34

Este baseline se ejecuta TRAS el refactor del orquestador (commit `dcf2831`) pero ANTES
de reemplazar el generador de catálogo (`src/lib/product-catalog.js` sigue leyendo
`config/pricing.json` para `getCatalogText`). Por eso la mayoría de los fallos
comparten la misma causa raíz: **el catálogo que se sirve al cliente sigue el
modelo antiguo** ("1 min 5€ · 2 min 10€ · …"), lo que rompe §15 del criterio
para cualquier escenario que empiece con saludo.

---

## Resultados por escenario

| ID | Grupo | Título | Veredicto |
|---|---|---|---|
| A1 | A | Cliente saluda simple | FAIL |
| A2 | A | Cliente saluda con pregunta personal | FAIL |
| A3 | A | Cliente compra 2 fotos sueltas (precio escalonado v2) | FAIL |
| A4 | A | Cliente pide video concreto del catálogo (v_001) | FAIL |
| A5 | A | Cliente compra sexting plantilla 5 min | FAIL |
| A6 | A | Cliente pide videollamada | FAIL |
| A7 | A | Cliente pregunta si es seguro pagar por bizum | FAIL |
| B1 | B | Pregunta por detalle de fotos | FAIL |
| B2 | B | Pregunta por lista de videos (v2 intent: ask_video_list) | FAIL |
| B3 | B | Cambia de opinión entre categorías | FAIL |
| B4 | B | Pregunta si tiene algo específico que SÍ existe | FAIL |
| B5 | B | Cliente pide algo que NO hay | FAIL |
| C1 | C | Cliente quiere charlar antes de comprar | FAIL |
| C2 | C | Cliente pregunta edad y origen | FAIL |
| C3 | C | Cliente pregunta qué estudia | FAIL |
| D1 | D | Cliente pide GRATIS | PASS |
| D2 | D | Cliente negocia precio directamente | PASS |
| D3 | D | Cliente duda con el precio de un video | FAIL |
| D4 | D | Cliente acosador leve | FAIL |
| D5 | D | Cliente acosador fuerte | PASS |
| D6 | D | Cliente sospecha que es bot | FAIL |
| D7 | D | Cliente pregunta si puede quedar | PASS |
| D8 | D | Cliente insiste emocionalmente sin comprar | FAIL |
| D9 | D | Cliente compara precios con otras modelos | FAIL |
| F1 | F | Sexting estándar sin roleplay (st_5min) | FAIL |
| F2 | F | Sexting con roleplay (profe) — plantilla 10 min | PASS |
| F3 | F | Cliente en sexting manda foto suya | PASS |
| F4 | F | Cliente intenta alargar sexting gratis | PASS |
| G1 | G | Cliente manda múltiples mensajes seguidos (Pacer) | FAIL |
| G5 | G | Cliente pregunta por PayPal | PASS |
| G6 | G | Cliente paga pero el pago falla | FAIL |
| H1 | H | Cliente pide un video por TÍTULO concreto | FAIL |
| H2 | H | Cliente pide 4 fotos de tetas (precio escalonado) | FAIL |
| H3 | H | Sexting 15 min con roleplay (doctora) + cool_down | FAIL |

---

## Pass-rate por grupo

| Grupo | Pass | Rate | Observaciones |
|---|---|---|---|
| A — Flujos básicos | 0/7 | 0% | Todos arrancan con saludo → catálogo legacy por minutos |
| B — Preguntas de categoría | 0/5 | 0% | `getCatalogText()` sigue emitiendo el modelo antiguo |
| C — Small talk | 0/3 | 0% | El saludo adjunta catálogo legacy incluso en rapport |
| D — Clientes difíciles | 3/9 | 33% | Acosador fuerte, regateo directo, "quedar físicamente" ya tenían lógica propia que no depende del catálogo |
| F — Sexting | 3/4 | 75% | El motor v1 (`src/agents/sexting-conductor.js`) sigue operativo y pasa casi todo |
| G — Edge cases | 1/3 | 33% | PayPal rejection pasa; Pacer burst y pago fallido aún con bugs |
| H — Nuevos v2 | 0/3 | 0% | Los 3 tocan el catálogo legacy ANTES del handler v2 |

---

## Causas raíz identificadas

### 1. Catálogo legacy domina el saludo (26/26 fallos en A–C+H)

`src/lib/product-catalog.js::getCatalogText()` lee `config/pricing.json` y devuelve
líneas tipo `🎥 videos — 1min 5€ · 2min 10€ · …`. El orquestador inyecta este
texto tras `GREETINGS_NEW_CLIENT[...]` para TODO cliente nuevo y para cualquier
cliente que vuelva tras >7 días. Como la mayoría de escenarios empiezan con
`hola`, el criterio §16 "Modelo antiguo (ya no aplica)" se dispara en el
**primer turno**, antes de que `handleV2Intent` tenga ocasión de actuar.

**Implicación:** el refactor del orquestador (commit `dcf2831`) introduce
correctamente las rutas v2 para `ask_video_list`, `choose_video`, etc., pero NO
ha tocado el generador de catálogo que se adjunta al saludo. Hasta que
`getCatalogText()` genere el texto desde `config/products.json` (vía algo
análogo a `formatVideoListText` + `formatPackListText` + `formatSextingOptionsText`),
el baseline no puede subir significativamente.

### 2. Sales agent alucina precios en turnos de confirmación (A3, A4, H2)

En al menos 3 escenarios Alba confirma un precio correcto en el turno N y luego
inventa un precio distinto (típicamente 7€) en el turno N+1 cuando el cliente
elige método de pago. Ver A3, A4, H2. Parece un problema en la rama
`payment_method_selection` del orquestador que vuelve a pasar por
`detectProductIntentFromHistory` + `resolveProduct` (ruta legacy) sin recordar
el `productId` ni el `amountEur` previamente acordado.

**Implicación:** hace falta persistir `pending_product_id` + `pending_amount_eur`
en `clients.profile` (JSONB) y consumirlo en `SALE_INTENTS.payment_method_selection`.
Ya estaba anotado en PREGUNTAS-PENDIENTES como opción (a) — el baseline lo
confirma como necesario.

### 3. Sexting post-pago vuelve a vender (H3)

En H3, tras el cliente confirmar pago ("ya pagué") y solicitar roleplay de
doctora, Alba re-arranca el ciclo de venta como si no hubiera pagado. El motor
v2 (`src/lib/sexting-conductor.js`) existe pero el orquestador no lo enlaza aún
en la rama `payment_confirmation` para las plantillas `st_*min`. El v1 sigue
activo (F2/F3/F4 pasan, F1 no) pero no reconoce las plantillas v2 ni los
roleplays.

### 4. Quality gate sobre-penaliza fragmentos (A1, A2)

Varias fallas A1/A2 son "vibra correcta, forma partida" — Alba manda 2
fragmentos de saludo, o un saludo + pregunta a "cómo estás?" + catálogo. El
evaluador lo marca como "repite info" o "pregunta vacía tras catálogo". Es un
falso-positivo estructural, no un problema de contenido. Se podría suavizar
consolidando fragmentos del saludo y moviendo la pregunta "dime qué te apetece"
al final del catálogo en lugar de emitirla por separado.

---

## Próximos pasos (pendientes de autorización del owner)

1. Reemplazar `getCatalogText()` por un generador basado en `products.json`
   (reutilizar `formatVideoListText` / `formatPackListText` / `formatSextingOptionsText`).
2. Persistir `pending_product_id` + `pending_amount_eur` en `clients.profile`
   para que `payment_method_selection` cierre el precio correcto.
3. Conectar `src/lib/sexting-conductor.js` v2 a la rama de `payment_confirmation`
   cuando el producto confirmado es `st_*min`.
4. Reorganizar fragmentos de saludo para unificar saludo + respuesta personal +
   catálogo en 2 bloques, no 4.

> Estos pasos son Paso 9 (loop autónomo) — NO se lanzan sin autorización.

---

## Reproducción

```bash
TEST_MODE=true npm run dev     # en otra terminal
node scripts/auto-iterate.js --mode=baseline --scenarios-v2
```

Resumen crudo se append a `docs/MEJORAS.md`.
