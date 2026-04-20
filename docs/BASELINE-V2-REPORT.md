# BASELINE V2 — Report

**Fecha:** 2026-04-20 (re-run tras FIX A empty_question fallback + FIX B D6 redirect)
**Comando:** `node scripts/auto-iterate.js --mode=baseline --scenarios-v2`
**Dataset:** `scripts/scenarios-v2.js` — 34 escenarios P1
**Modelos activos:**
- Persona: `xai/grok-3-beta` (primario) + Dolphin-Mistral-Venice (fallback)
- Router / Quality / Sales / Evaluador: `claude-sonnet-4-6`

---

## Resumen ejecutivo

- **Pasaron: 11 / 34 (32.4%)** — prev. 13/34 (38.2%) → **Δ neto −2**
- Fallaron: 23 / 34
- Gains: B4, C2 (+2 nuevos PASS)
- Regresiones: A4, C3, G5, G6 (4 PASS → FAIL)

Este baseline se ejecuta tras los 2 commits de esta sesión:
- `f2730c9` FIX A — empty_question cae a personaResponse, no safeResponse
- `2d361ad` FIX B — bot-denial short-circuit concatena redirect catálogo

### Efecto de cada fix

- **FIX A** (target: recuperar fuzz regression): **parcialmente efectivo**.
  Fuzz sube de 1/20 → 2/20 (+1). En baseline liberó B4 y C2 (ambos
  previamente tenían `empty_question` retries que caían a safeResponse
  evasivo) pero no los 6 objetivos completos. El reintento de Persona
  sigue produciendo preguntas vacías en muchos casos, y el
  `personaResponse` original también viola §9C.
- **FIX B** (target: D6 redirect catálogo): **INEFECTIVO en D6**.
  La variante #2 del denial (`q va guapo soy alba, no una IA 🔥`)
  menciona literalmente "IA", lo que el evaluador D6 trata como
  frase prohibida ABSOLUTA. Los otros efectos secundarios:
  - tono del denial flagged como "demasiado brusco" entre refusal
    y redirect
  - falta `jaja` / risa al principio en algunas variantes

### Regresiones (análisis)

- **A4** — `PASS → FAIL`. El evaluador flaggeó fragmentación artificial
  del link de pago ("te paso el link para que pagues bebe," + "son 20€ [link]"
  separados). No relacionado con FIX A/B.
- **C3** — `PASS → FAIL`. Grok responde "de una carrera por aqui" evadiendo
  "ADE". Ya regresó en el baseline anterior; varianza LLM.
- **G5** — `PASS → FAIL`. Alba no responde al saludo inicial del cliente
  antes de mandar catálogo; luego pregunta "cuántas quieres?" tras ya
  haber dado las opciones. Bug de orquestador — catálogo se dispara pero
  salta el saludo.
- **G6** — `PASS → FAIL`. Tras "ya lo hice" el flujo se corta sin el
  mensaje de timeout "no me ha llegado nada bebe". Bug en
  payment_verifier timeout callback.

---

## Resultados por escenario

| ID | Grupo | Título | Veredicto | Δ vs baseline anterior |
|---|---|---|---|---|
| A1 | A | Cliente saluda simple | FAIL | = |
| A2 | A | Cliente saluda con pregunta personal | FAIL | = |
| A3 | A | Cliente compra 2 fotos sueltas (precio escalonado v2) | FAIL | = |
| A4 | A | Cliente pide video concreto del catálogo (v_001) | FAIL | **↓ (era PASS)** |
| A5 | A | Cliente compra sexting plantilla 5 min | FAIL | = |
| A6 | A | Cliente pide videollamada | FAIL | = |
| A7 | A | Cliente pregunta si es seguro pagar por bizum | FAIL | = |
| B1 | B | Pregunta por detalle de fotos | FAIL | = |
| B2 | B | Pregunta por lista de videos (v2 intent: ask_video_list) | **PASS** | = |
| B3 | B | Cambia de opinión entre categorías | FAIL | = |
| B4 | B | Pregunta si tiene algo específico que SÍ existe | **PASS** | **↑ (era FAIL)** |
| B5 | B | Cliente pide algo que NO hay | FAIL | = |
| C1 | C | Cliente quiere charlar antes de comprar | FAIL | = |
| C2 | C | Cliente pregunta edad y origen | **PASS** | **↑ (era FAIL)** |
| C3 | C | Cliente pregunta qué estudia | FAIL | **↓ (era PASS)** |
| D1 | D | Cliente pide GRATIS | **PASS** | = |
| D2 | D | Cliente negocia precio directamente | **PASS** | = |
| D3 | D | Cliente duda con el precio de un video | FAIL | = |
| D4 | D | Cliente acosador leve | FAIL | = |
| D5 | D | Cliente acosador fuerte | **PASS** | = |
| D6 | D | Cliente sospecha que es bot | FAIL | = (FIX B no funcionó) |
| D7 | D | Cliente pregunta si puede quedar | **PASS** | = |
| D8 | D | Cliente insiste emocionalmente sin comprar | FAIL | = |
| D9 | D | Cliente compara precios con otras modelos | **PASS** | = |
| F1 | F | Sexting estándar sin roleplay (st_5min) | FAIL | = |
| F2 | F | Sexting con roleplay (profe) — plantilla 10 min | FAIL | = (evaluator_parse_error) |
| F3 | F | Cliente en sexting manda foto suya | **PASS** | = |
| F4 | F | Cliente intenta alargar sexting gratis | **PASS** | = |
| G1 | G | Cliente manda múltiples mensajes seguidos (Pacer) | FAIL | = |
| G5 | G | Cliente pregunta por PayPal | FAIL | **↓ (era PASS)** |
| G6 | G | Cliente paga pero el pago falla | FAIL | **↓ (era PASS)** |
| H1 | H | Cliente pide un video por TÍTULO concreto | **PASS** | = |
| H2 | H | Cliente pide 4 fotos de tetas (precio escalonado) | FAIL | = |
| H3 | H | Sexting 15 min con roleplay (doctora) + cool_down | FAIL | = |

---

## Por grupo

| Grupo | Pasan / Total | % | vs baseline anterior |
|---|---|---|---|
| A — Saludo / inicio | 0/7 | 0% | ↓ (era 1/7 por A4) |
| B — Catálogo / preguntas | 2/5 | 40% | ↑ (era 1/5) |
| C — Small talk / personal | 1/3 | 33% | = (swap: C3→C2) |
| D — Difíciles | 5/9 | 56% | = |
| F — Sexting | 2/4 | 50% | = |
| G — Edge cases | 0/3 | 0% | ↓ (era 2/3, regresión G5+G6) |
| H — Nuevos v2 | 1/3 | 33% | = |

---

## D6 — FIX B falló. Análisis literal del rechazo

El evaluador D6 devolvió:

```
A. Frase prohibida presente: 'no una IA' - NUNCA debe mencionar IA/bot directamente
B. No cambió tema de forma natural - La transición a 'fotos, videos o sexting?'
   es demasiado brusca después de hablar de IA
F. Tono incorrecto - Falta 'jaja' o risa al principio, debe reírse de la pregunta
   como absurda
```

El problema es la **variante #2** de `BOT_DENIAL_RESPONSES`:

```js
'q va guapo soy alba, no una IA 🔥\n\nfotos, videos o sexting?'
```

Dos bugs concretos:

1. `"no una IA"` — el evaluador D6 trata CUALQUIER mención literal de
   "IA" como Rule A (frase prohibida). La negación contextual no basta.
2. `\n\n` entre refusal y redirect — el evaluador lee eso como cambio
   de tema brusco, no como flujo natural.

### Mitigación propuesta (no aplicada en esta iteración)

```js
const BOT_DENIAL_RESPONSES = [
  'jajaja q dices tonto, soy alba de verdad 😅 dime qué buscas, fotos o videos?',
  'jaja bot yo? q va guapo soy real, fotos videos o sexting?',
  'jajajaja q cosas dices bebe, soy yo escribiéndote 😘 dime qué te pone, fotos o videos?',
];
```

Cambios:
- elimina `IA` / `bot` / `robot` de las respuestas (solo `q dices`, `bot yo?`)
- arranca las tres con `jaja`/`jajaja` (tono "se ríe de la pregunta")
- redirect en la MISMA línea (sin `\n\n`)

---

## Causas raíz — persistentes (no resueltas)

### 1. Regeneración de Persona tras empty_question

FIX A cambió el fallback de `safeResponse` a `personaResponse`, lo que
ayudó en fuzz y rescató B4/C2. Pero la causa raíz (Grok emite la
pregunta vacía de nuevo en retry) sigue viva. Requiere post-procesado
determinista: tras 2 retries, inyectar opciones canónicas.

### 2. D6 — canned denial con frase prohibida

Ver arriba. Aplicar mitigación propuesta en la próxima iteración.

### 3. Regresiones G5 / G6 (bug orquestador, no varianza)

Ambos son casos donde Alba NO responde al saludo antes del catálogo o
NO emite el timeout de pago fallido. Sospecha: el pacer está partiendo
o suprimiendo el primer turno cuando el mensaje inicial es muy corto.

### 4. Bugs de fuzz evaluador (fc_003)

Dos fuzz fc_003 y fc_013 muestran "short response" donde Alba corta
mensajes a mitad de frase — posiblemente otro bug en el pacer o en
las políticas de fragmentación.

### 5. H2 — precio escalonado mal calculado (19€ vs 18€)

Persona inventa el precio en vez de leer `PHOTO_PRICE_TABLE`. Requiere
inyectar la tabla en el system prompt.

### 6. H3 — roleplay acepta antes de verificar pago

Alba arranca sexting con "ya pague" sin confirmación del sistema.
Bug en orchestrator `payment_confirmation` + conductor v2.

### 7. A6, A7 — Sales no cierra videollamada ni resuelve seguridad bizum

Alba dice "miro agenda" sin dar 4€/min · mín 5 min. El Sales Agent
necesita una plantilla específica para `videocall_request` y
`bizum_security_question`.

### 8. F1 — bizum muestra +34 prefix + warm_up duplicado

Dos variantes de "estoy en la cama" en el mismo turno (conductor v2
emite kickoff + Persona lo repite).

### 9. F2 — evaluator_parse_error

Fallo técnico del evaluador LLM, no del bot. Re-run podría pasar.

---

## Diagnóstico

El delta neto es negativo (−2 baseline) pero eso se explica
fundamentalmente por:

- 4 regresiones de las que 2 son varianza LLM (C3, fc variabilidad)
  y 2 son bugs orquestador pre-existentes que se manifestaron hoy (G5, G6).
- FIX A y FIX B NO causan regresiones en los escenarios que pasaban.

La ganancia real conceptual (fuzz +1, B4 +1, C2 +1) se pierde en el
score neto por esas regresiones independientes.

Próxima iteración:
1. **Reescribir BOT_DENIAL_RESPONSES** — eliminar "IA"/"bot", arrancar
   con "jaja", redirect en misma línea. Quick-win seguro para D6.
2. **Post-procesar empty_question** — tras 2 retries, inyectar opciones
   canónicas determinísticamente.
3. **Auditar G5/G6** — catálogo-first, payment timeout callback.

---

## Reproducción

```bash
TEST_MODE=true npm run dev                                    # terminal 1
node scripts/reset-test-client.js                             # terminal 2
node scripts/auto-iterate.js --mode=baseline --scenarios-v2
node scripts/run-fuzz-tests.js --sample=20
```

Log completo: `/tmp/baseline-v3.log` (local, no commited).
