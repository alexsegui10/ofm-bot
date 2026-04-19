# Overnight Session Report

**Fecha:** 2026-04-19 → 2026-04-20
**Rama:** master
**Commits producidos:** 4 (ee25b9b, 2446b1c, b4994c5, b7b88df)

## Objetivo

4 fixes dirigidos a las causas raíz persistentes del baseline V2 (10/34
pre-fix), más un script de validación E2E del catálogo v2.

---

## Fixes entregados

### FIX #1 — `payment_method_selection` respeta `pending_product_id`
**Commit:** `ee25b9b`
**Archivos:** `src/agents/sales.js`, `src/orchestrator.js`, `src/agents/sales.test.js`

- Añade `lookupProductPrice(productId)` — función pura que resuelve
  precio/descripción para cualquier id de catálogo v2 (`v_XXX`, `pk_XXX`,
  `st_Nmin`, `singles:tag:count`, `videocall:N`, `custom`).
- En los intents v2 de compra (`choose_video`, `choose_pack`,
  `buy_sexting_template`, `buy_single_photos`): si el cliente **no** nombró
  un método de pago explícito (bizum/crypto/stars/usdt/etc.), NO se crea la
  invoice. En su lugar se persiste `pending_product_id` y Alba pregunta
  "cómo quieres pagar?". En el siguiente turno, el branch
  `payment_method_selection` recupera el producto pendiente con el precio
  correcto (no reinventa 7€).
- Tests: +8 unit tests sobre `lookupProductPrice` cubriendo todas las
  familias de producto.

**Target scenarios:** A3, A4, A5, F4, H3
**Resultado baseline:** A4 ✅ · F4 ✅ (2/5) — A3, A5, H3 siguen FAIL por
razones NO relacionadas con el método de pago (ver análisis más abajo).

---

### FIX #2 — Quality Gate detecta preguntas vacías
**Commit:** `2446b1c`
**Archivos:** `src/agents/quality-gate.js`, `src/agents/quality-gate.test.js`, `src/orchestrator.js`

- Nueva función `isEmptyQuestion(response)` + regex `EMPTY_QUESTION_PATTERNS`
  que detecta la última línea de la respuesta siendo una pregunta abierta
  sin opciones concretas ("dime qué te mola", "qué prefieres?", "qué te
  apetece", "cuál te gusta más?", "qué quieres ver?", "qué buscas?",
  "dime qué te pone").
- `CONCRETE_OPTION_PATTERN` evita falsos positivos cuando la respuesta
  contiene precios (`€`), ids (`v_`, `pk_`, `st_`), tags (culo/tetas/coño/
  lencería/tacones/ducha), o métodos de pago (bizum/crypto/stars/paypal).
- `EMPTY_QUESTION_SKIP_INTENTS` omite la detección para `small_talk`,
  `sexting_active` y fases de `payment_*` (donde la pregunta abierta es
  legítima).
- Integrado en `quickCheck` del Quality Gate: si dispara, devuelve
  `reason=empty_question` y Orchestrator regenera con la instrucción
  reforzada "ofrece 2-3 opciones concretas en el MISMO mensaje".
- Tests: +23 unit tests (10 prohibidos + 5 válidos + 8 integración).

**Target scenarios:** B1, B3, B4, D4, G1, H1
**Resultado baseline:** H1 ✅ (1/6) — B1, B3, B4, D4, G1 siguen FAIL.
**Diagnóstico:** el gate dispara correctamente, pero la regeneración
de Persona (xai/grok-3-beta) sigue produciendo preguntas sin opciones.
El problema ya no es el detector sino que Grok ignora la instrucción
reforzada.

---

### FIX #3 — Short-circuit determinista "eres un bot?"
**Commit:** `b4994c5`
**Archivos:** `src/orchestrator.js`, `src/orchestrator.bot-question.test.js`

- Regex intent-agnostic `BOT_QUESTION_PATTERN` + `IS_REAL_PATTERN` que
  captura: bot, ia, i.a., robot, chatbot, asistente virtual, gpt, chatgpt,
  inteligencia artificial, máquina, programa; además "eres real / humana
  / de verdad".
- Responde con 1 de 3 negaciones fijas en voz de Alba antes de pasar por
  Router/Persona — elimina la inconsistencia de Grok confirmando ser IA.
- Corre DESPUÉS del short-circuit de sexting v2 activo para no interrumpir
  sesiones pagadas.
- Tests: +28 unit tests (15 prohibidos + 8 válidos + 5 meta).

**Target scenarios:** D6
**Resultado baseline:** D6 ❌ — la negación se emite correctamente pero
el evaluador exige además un cambio de tema con opciones concretas
("dime qué buscas, fotos o videos?"). La negación sin follow-up cumple
la regla de límite duro pero no el criterio completo del escenario D6.
**Próxima iteración:** extender la respuesta con un redirect suave.

---

### FIX #4 — Script de validación E2E del catálogo v2
**Commit:** `b7b88df`
**Archivo:** `scripts/validate-catalog-e2e.js`

Envía conversaciones mínimas contra el server local (`TEST_MODE=true`) y
verifica que cada familia de producto responda con el precio esperado
y al menos un keyword relevante.

**Resultado** (ver `docs/e2e-catalog-v2.log`):

| Scenario | Resultado | Producto | Precio | Nota |
|---|---|---|---|---|
| fotos-sueltas | ✅ PASS | 2 fotos de culo | 12€ | |
| video-v001 | ✅ PASS | squirt en la ducha | 20€ | |
| pack-pk001 | ✅ PASS | culo en tanga roja | 15€ | |
| sexting-10min | ✅ PASS | st_10min | 30€ | |
| videocall | ❌ FAIL | videollamada 10min | — | Alba dice "miro agenda" sin dar 40€ ni 4€/min (bug A6 conocido) |
| personalizado | ✅ PASS | custom desde 45€ | 45€ | |

**5/6 pass (83.3%).** El único fallo es el mismo issue A6 del baseline
(videollamada sin Sales Agent cerrando la operación), no una regresión
de los fixes.

---

## Baseline completo — 34 escenarios P1

**Comando:** `node scripts/auto-iterate.js --mode=baseline --scenarios-v2`
**Log completo:** `/tmp/baseline-post-fix.log`
**Resultado:** **13 / 34 (38.2%)** — prev. 10/34 (29.4%) → **Δ neto +3**

### Per-scenario delta

| ID | Verdicto | Δ vs prev. | Nota |
|---|---|---|---|
| A1 | ❌ | = | catalog+pregunta en misma ráfaga (evaluator strict) |
| A2 | ❌ | = | |
| A3 | ❌ | = | **FIX #1 no alcanzó** — fallo en otro turno |
| **A4** | ✅ | **↑ era FAIL** | **FIX #1 rescue** |
| A5 | ❌ | = | **FIX #1 no alcanzó** |
| A6 | ❌ | = | Sales no cierra videollamada |
| A7 | ❌ | = | |
| B1 | ❌ | = | **FIX #2 gate dispara pero Persona no ofrece opciones** |
| B2 | ✅ | = | |
| B3 | ❌ | = | **FIX #2 idem** |
| B4 | ❌ | = | **FIX #2 idem** |
| B5 | ❌ | = | |
| C1 | ❌ | = | |
| C2 | ❌ | **↓ era PASS** | regresión (eval variance probable) |
| **C3** | ✅ | **↑ era FAIL** | gain colateral |
| D1 | ✅ | = | |
| D2 | ✅ | = | |
| D3 | ❌ | = | |
| D4 | ❌ | = | **FIX #2 idem** |
| D5 | ✅ | = | |
| D6 | ❌ | = | **FIX #3 emite negación pero falta redirect** |
| D7 | ✅ | = | |
| D8 | ❌ | = | |
| D9 | ✅ | = | |
| F1 | ❌ | = | bizum muestra +34 prefix + warm_up duplicado |
| F2 | ❌ | **↓ era PASS** | regresión (roleplay no engancha turno 4) |
| **F3** | ✅ | **↑ era FAIL** | gain colateral |
| **F4** | ✅ | **↑ era FAIL** | **FIX #1 rescue** |
| G1 | ❌ | = | **FIX #2 idem** |
| G5 | ✅ | = | |
| G6 | ✅ | = | |
| **H1** | ✅ | **↑ era FAIL** | **FIX #2 rescue** (única pasada) |
| H2 | ❌ | = | precio inventado 19€ vs 18€ (PHOTO_PRICE_TABLE) |
| H3 | ❌ | = | **FIX #1 no alcanzó** — pago no verificado antes de sexting |

**Gains netos:** A4, C3, F3, F4, H1 = **+5**
**Regresiones:** C2, F2 = **−2**
**Delta:** +3 → 13/34

### Por grupo

| Grupo | Pasan / Total | % | vs prev. |
|---|---|---|---|
| A — Saludo / inicio | 1/7 | 14% | ↑ (era 0/7) |
| B — Catálogo | 1/5 | 20% | = |
| C — Small talk | 1/3 | 33% | = (C2↓, C3↑) |
| D — Difíciles | 5/9 | 56% | = |
| F — Sexting | 2/4 | 50% | ↑ (era 1/4) |
| G — Edge cases | 2/3 | 67% | = |
| H — Nuevos v2 | 1/3 | 33% | ↑ (era 0/3) |

---

## Fuzz — sample=20

**Resultado: 1/20 (5%)** — prev. 3/20 (15%) → **Δ −2 (regresión)**
Log: `/tmp/fuzz-post-fix.log` · Report: `docs/FUZZ-REPORT.md`

| arquetipo | pass | rate |
|---|---|---|
| tímido | 0/4 | 0% |
| directo | 0/4 | 0% |
| regateador | 0/4 | 0% |
| cariñoso | 1/3 | 33% |
| acosador leve | 0/4 | 0% |
| exploratorio | 0/1 | 0% |

### Causa raíz de la regresión fuzz

FIX #2 dispara `empty_question` en respuestas "pregunta sin opciones".
El Orchestrator reintenta 2 veces con instrucción reforzada, pero
cuando Grok-3-beta no converge tras el 2º retry, el código cae a
`safeResponse` — que son las frases evasivas:

```js
const SAFE_RESPONSES = [
  'uf espera que me ha llegado algo 😅',
  'oye cambia de tema va',
  'perdona me he liado un momento',
  'jaja q cosas, cuéntame otra cosa mejor',
];
```

Esto se ve textualmente en fc_014 ("que me ha llegado algo 😅
evadiendo completamente"), fc_017, fc_018, fc_019 y fc_020. Los fuzz
clients hacen preguntas explícitas de precio / servicio al turno 1-2,
y ahora reciben "uf espera" como respuesta.

Los scripted scenarios del baseline (+3 neto) son menos vulnerables
porque tienen menos variabilidad y el evaluador ya penaliza de forma
coherente; los fuzz clients (más libres) ven la degradación en crudo.

### Mitigación propuesta (no aplicada en esta sesión)

**En `src/orchestrator.js` líneas 868-877:** cuando el gate falla por
`empty_question` y los 2 retries también fallan, NO usar
`qgN.safeResponse`. La pregunta vacía es un issue de calidad, no un
límite duro (bot confession, encuentros, bio leak). Dejar pasar la
respuesta original es mejor que el evasivo "uf espera que me ha
llegado algo".

```js
} else if (qg1.reason === EMPTY_QUESTION_REASON) {
  // Pregunta vacía no justifica safeResponse evasivo. Mejor pasar
  // la respuesta original aunque sea imperfecta que romper el flujo.
  finalResponse = personaResponse;
} else {
  finalResponse = qgN.safeResponse || 'espera un momento';
}
```

Aplicar esta mitigación debería:
- Recuperar los ~2 fuzz perdidos.
- No alterar los gains de baseline (A4/F4/H1 ya pasan en el primer
  retry).
- Mantener el beneficio defensivo sobre B1/B3/B4/D4/G1 (el gate sigue
  intentando 2 retries antes de dejar pasar).

---

## Unit tests

**Total:** 642 / 642 pasando (prev. 591).
**Nuevos:** +51 (8 FIX#1 + 23 FIX#2 + 28 FIX#3 − 8 renumerados).

```bash
npm test  # 27 test files, 642 tests, 0 failures
```

---

## Análisis de por qué los FIX no rescatan más escenarios

### FIX #1 (2/5 en vez de 5/5)
- **A3, A5:** el fallo no es el método de pago sino que Persona re-emite
  el catálogo o hace pregunta vacía en turnos intermedios. El gate de
  FIX #2 debería capturarlo pero el evaluador sigue encontrando otras
  violaciones antes (B/C/D/F).
- **H3:** el cliente dice "ya pague" sin que el pago esté verificado —
  Alba acepta roleplay antes de la confirmación. Esto está fuera del
  scope de FIX #1 (es un bug en `payment-verifier` + orchestrator, no
  en `payment_method_selection`).

### FIX #2 (1/6 en vez de 6/6)
El detector funciona (se ve el reason "empty_question" en los logs
del gate) pero cuando se solicita la regeneración, `xai/grok-3-beta`
vuelve a emitir una pregunta vacía o una variante del mismo mensaje.
Dos caminos posibles:

1. **Reforzar la instrucción de retry** — en vez de un párrafo, añadir
   3-5 ejemplos concretos de cómo debe verse el mensaje reescrito.
2. **Post-procesar determinísticamente** — si tras N retries sigue sin
   opciones, inyectar "tengo fotos desde 7€, videos desde 10€, sexting
   5/10/15 min" antes de la pregunta final.

### FIX #3 (0/1)
La negación es correcta pero el evaluador del scenario D6 quiere
además redirect al catálogo. La solución es sencilla: concatenar un
segundo fragmento "dime qué buscas, fotos o videos? 😈" a la respuesta.

---

## Recomendaciones para la siguiente iteración

| Prioridad | Acción | Escenarios rescatados (estimado) |
|---|---|---|
| ALTA | Post-procesar pregunta-vacía con opciones canónicas tras 2 retries | B1, B3, B4, D4, G1 (5) |
| ALTA | D6: extender respuesta bot-denial con redirect al catálogo | D6 (1) |
| MEDIA | A3/A5: auditar turno intermedio donde Persona reinventa catálogo | A3, A5 (2) |
| MEDIA | H2: inyectar `PHOTO_PRICE_TABLE` en system prompt de Persona | H2 (1) |
| MEDIA | F1: corregir prefijo +34 en bizum + deduplicar warm_up | F1 (1) |
| BAJA | A6: Sales Agent para videollamada con precio 4€/min · mín 5 min | A6, C1 (2) |
| BAJA | F2: detectar roleplay en turno pre-pago y persistirlo | F2 (1) |

**Ceiling teórico** tras aplicar las 7 recomendaciones: ~26/34 (76.5%).

### Crítico — regresión fuzz debe corregirse antes de la siguiente
### iteración

Aplicar la mitigación descrita arriba (safe-response no evasivo para
`empty_question`) recupera el fuzz a niveles previos sin perder las
ganancias del baseline. Es el primer paso obligatorio.

---

## Estado del repositorio

```
b7b88df Add FIX #4: E2E catalog validation script
b4994c5 Fix HIGH-ROI #3: deterministic short-circuit for 'eres un bot?'
2446b1c Fix HIGH-ROI #2: quality gate detects empty questions
ee25b9b Fix HIGH-ROI #1: payment_method_selection respects pending_product_id
a9cb6fe Re-run baseline + fuzz after FIX 1-4 + credits recharged  (baseline anterior)
```

Branch `master`, working tree limpio tras los 4 commits. No hay uncommitted
changes relevantes.

---

## Reproducción

```bash
# Unit tests (rápido)
npm test

# E2E catalog
TEST_MODE=true npm run dev                    # terminal 1
node scripts/reset-test-client.js             # terminal 2
node scripts/validate-catalog-e2e.js          # ~15 min

# Baseline 34 scenarios
node scripts/auto-iterate.js --mode=baseline --scenarios-v2  # ~110 min

# Fuzz
node scripts/run-fuzz-tests.js --sample=20    # ~20-30 min
```
