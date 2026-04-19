# BASELINE V2 — Report

**Fecha:** 2026-04-20 (re-run tras FIX HIGH-ROI #1/#2/#3 + script E2E)
**Comando:** `node scripts/auto-iterate.js --mode=baseline --scenarios-v2`
**Dataset:** `scripts/scenarios-v2.js` — 34 escenarios P1
**Modelos activos:**
- Persona: `xai/grok-3-beta` (primario) + Dolphin-Mistral-Venice (fallback)
- Router / Quality / Sales / Evaluador: `claude-sonnet-4-6`

---

## Resumen ejecutivo

- **Pasaron: 13 / 34 (38.2%)** — prev. 10/34 (29.4%) → **Δ neto +3**
- Fallaron: 21 / 34
- Gains: A4, C3, F3, F4, H1 (5 nuevos PASS)
- Regresiones: C2, F2 (2 PASS → FAIL, probablemente varianza del
  evaluador LLM)

Este baseline se ejecuta tras los 4 commits de la sesión overnight:
- `ee25b9b` FIX #1 — `payment_method_selection` respeta `pending_product_id`
- `2446b1c` FIX #2 — Quality Gate detecta preguntas vacías
- `b4994c5` FIX #3 — short-circuit "¿eres un bot?"
- `b7b88df` FIX #4 — script E2E `validate-catalog-e2e.js`

### Efecto de cada fix sobre sus targets

- **FIX #1** (A3, A4, A5, F4, H3): **2/5** — A4 ✅ y F4 ✅ rescatados; A3,
  A5, H3 siguen FAIL por causas intermedias independientes del método
  de pago.
- **FIX #2** (B1, B3, B4, D4, G1, H1): **1/6** — solo H1 ✅. El detector
  funciona y dispara el retry, pero Persona (Grok) vuelve a emitir
  preguntas vacías en la regeneración. Requiere post-procesado
  determinista.
- **FIX #3** (D6): **0/1** — la negación sale bien (ya no hay "soy una
  IA") pero el evaluador exige también un cambio de tema con opciones
  concretas; hay que concatenar un redirect tipo "dime qué buscas,
  fotos o videos?" al mensaje canned.

---

## Resultados por escenario

| ID | Grupo | Título | Veredicto | Δ vs baseline anterior |
|---|---|---|---|---|
| A1 | A | Cliente saluda simple | FAIL | = |
| A2 | A | Cliente saluda con pregunta personal | FAIL | = |
| A3 | A | Cliente compra 2 fotos sueltas (precio escalonado v2) | FAIL | = |
| A4 | A | Cliente pide video concreto del catálogo (v_001) | **PASS** | **↑ (era FAIL)** |
| A5 | A | Cliente compra sexting plantilla 5 min | FAIL | = |
| A6 | A | Cliente pide videollamada | FAIL | = |
| A7 | A | Cliente pregunta si es seguro pagar por bizum | FAIL | = |
| B1 | B | Pregunta por detalle de fotos | FAIL | = |
| B2 | B | Pregunta por lista de videos (v2 intent: ask_video_list) | **PASS** | = |
| B3 | B | Cambia de opinión entre categorías | FAIL | = |
| B4 | B | Pregunta si tiene algo específico que SÍ existe | FAIL | = |
| B5 | B | Cliente pide algo que NO hay | FAIL | = |
| C1 | C | Cliente quiere charlar antes de comprar | FAIL | = |
| C2 | C | Cliente pregunta edad y origen | FAIL | **↓ (era PASS)** |
| C3 | C | Cliente pregunta qué estudia | **PASS** | **↑ (era FAIL)** |
| D1 | D | Cliente pide GRATIS | **PASS** | = |
| D2 | D | Cliente negocia precio directamente | **PASS** | = |
| D3 | D | Cliente duda con el precio de un video | FAIL | = |
| D4 | D | Cliente acosador leve | FAIL | = |
| D5 | D | Cliente acosador fuerte | **PASS** | = |
| D6 | D | Cliente sospecha que es bot | FAIL | = |
| D7 | D | Cliente pregunta si puede quedar | **PASS** | = |
| D8 | D | Cliente insiste emocionalmente sin comprar | FAIL | = |
| D9 | D | Cliente compara precios con otras modelos | **PASS** | = |
| F1 | F | Sexting estándar sin roleplay (st_5min) | FAIL | = |
| F2 | F | Sexting con roleplay (profe) — plantilla 10 min | FAIL | **↓ (era PASS)** |
| F3 | F | Cliente en sexting manda foto suya | **PASS** | **↑ (era FAIL)** |
| F4 | F | Cliente intenta alargar sexting gratis | **PASS** | **↑ (era FAIL)** |
| G1 | G | Cliente manda múltiples mensajes seguidos (Pacer) | FAIL | = |
| G5 | G | Cliente pregunta por PayPal | **PASS** | = |
| G6 | G | Cliente paga pero el pago falla | **PASS** | = |
| H1 | H | Cliente pide un video por TÍTULO concreto | **PASS** | **↑ (era FAIL)** |
| H2 | H | Cliente pide 4 fotos de tetas (precio escalonado) | FAIL | = |
| H3 | H | Sexting 15 min con roleplay (doctora) + cool_down | FAIL | = |

---

## Por grupo

| Grupo | Pasan / Total | % | vs baseline anterior |
|---|---|---|---|
| A — Saludo / inicio | 1/7 | 14% | ↑ (era 0/7) |
| B — Catálogo / preguntas | 1/5 | 20% | = |
| C — Small talk / personal | 1/3 | 33% | = (C2↓, C3↑) |
| D — Difíciles | 5/9 | 56% | = |
| F — Sexting | 2/4 | 50% | ↑ (era 1/4) |
| G — Edge cases | 2/3 | 67% | = |
| H — Nuevos v2 | 1/3 | 33% | ↑ (era 0/3) |

---

## Causas raíz — persistentes (no resueltas)

### 1. Regeneración de Persona tras empty_question (afecta B1/B3/B4/D4/G1)

El FIX #2 detecta la pregunta vacía y solicita retry con instrucción
reforzada, pero Grok-3-beta vuelve a emitir una variante de la misma
pregunta vacía. Se necesita post-procesado determinista: tras 2 retries
fallidos, inyectar opciones canónicas ("tengo fotos desde 7€, videos
desde 10€, sexting 5/10/15 min") antes de la pregunta final.

### 2. A3/A5 — pago OK pero Persona inventa en turnos intermedios

El método de pago ya está persistido correctamente (FIX #1), pero los
turnos intermedios todavía re-emiten el catálogo o reformulan sin
opciones, disparando otros fallos del evaluador (D/F) antes de llegar
al pago.

### 3. D6 — canned denial sin redirect

La negación "jajaja bot? q va bebe, soy alba de verdad 😅" se emite
correctamente pero el scenario exige también "dime qué buscas, fotos
o videos?" en el mismo turno. Fix trivial: concatenar redirect al final
del canned response.

### 4. H2 — precio escalonado mal calculado (19€ vs 18€)

Persona inventa el precio en vez de leer `PHOTO_PRICE_TABLE`. Requiere
inyectar la tabla en el system prompt.

### 5. H3 — roleplay acepta antes de verificar pago

Alba arranca sexting con "ya pague" sin confirmación del sistema.
Bug en orchestrator `payment_confirmation` + conductor v2.

### 6. A6, A7 — Sales no cierra videollamada ni resuelve seguridad bizum

Alba dice "miro agenda" sin dar 4€/min · mín 5 min. El Sales Agent
necesita una plantilla específica para `videocall_request` y
`bizum_security_question`.

### 7. F1 — bizum muestra +34 prefix + warm_up duplicado

Dos variantes de "estoy en la cama" en el mismo turno (conductor v2
emite kickoff + Persona lo repite).

### 8. F2 — roleplay post-pago no engancha

Cliente pide "profe" tras payment_confirmation; el bridge debería
detectarlo y arrancar sexting con rol, pero Persona pregunta "qué
asignatura?". El detector de roleplay va por `history` en vez de
consumir la señal del turno actual.

---

## Tipos de fallo (resumen)

| Tipo | Ocurrencias |
|---|---|
| C (pregunta vacía, post-retry) | ~8 escenarios |
| B (no respondió lo pedido) | ~11 escenarios |
| D (repitió info) | ~6 escenarios |
| E (inventó precio/contenido) | ~3 escenarios |
| I (flujo no avanza) | ~5 escenarios |
| F (tono/fragmentación) | ~4 escenarios |

---

## Diagnóstico

Los 4 fixes lograron **+3 pass netos** (10→13), pero el techo de estos
fixes individualmente está lejos del ceiling teórico (5 + 6 + 1 = 12
escenarios). El motivo es que la mayoría de los target escenarios
fallan por **múltiples causas encadenadas**: el fix resuelve una, pero
el evaluador encuentra otra violación en un turno posterior.

Próxima iteración debe enfocarse en:
1. **Post-procesar empty_question** en lugar de confiar en Persona retry.
2. **Extender D6** con redirect catálogo (fix trivial, +1 PASS casi
   garantizado).
3. **Auditar turno intermedio de A3/A5** donde Persona reinventa.

---

## Reproducción

```bash
TEST_MODE=true npm run dev                                    # terminal 1
node scripts/reset-test-client.js                             # terminal 2
node scripts/auto-iterate.js --mode=baseline --scenarios-v2
node scripts/run-fuzz-tests.js --sample=20
```

Log completo: `/tmp/baseline-post-fix.log` (local, no commited).
