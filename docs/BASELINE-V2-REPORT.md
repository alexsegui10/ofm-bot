# BASELINE V2 — Report

**Fecha:** 2026-04-19 (re-run tras FIX 1-4 + recarga créditos OpenRouter)
**Comando:** `node scripts/auto-iterate.js --mode=baseline --scenarios-v2`
**Dataset:** `scripts/scenarios-v2.js` — 34 escenarios P1
**Modelos activos:**
- Persona: `xai/grok-3-beta` (primario) + Dolphin-Mistral-Venice (fallback)
- Router / Quality / Sales / Evaluador: `claude-sonnet-4-6`

---

## Resumen ejecutivo

- **Pasaron: 10 / 34 (29.4%)** — mismo conteo que el baseline anterior (10/34) pero **set distinto**
- Fallaron: 24 / 34
- **Delta neto: 0** (ganamos 4: C2, D2, F2, G6 · perdimos 4: A1, D6, F1, F4)

Este baseline se ejecuta TRAS los 4 FIX commits (A1, D6, D9, F1) +
recarga de créditos OpenRouter. El commit que originó este re-run venía
de arreglar regresiones provocadas por la iteración BUG A/B/C.

**Resultado frente a los 4 tests objetivo del FIX:**
- **A1** — ❌ FAIL (era PASS tras BUG A/B/C). El FIX 1 no ha sostenido el
  pase. Evaluador reporta: fragmento [5] "dime qué te mola rey 🔥"
  considerado pregunta vacía porque el catálogo en [2][3][4] no
  acompaña a la pregunta en el mismo contexto inmediato según §6.
- **D6** — ❌ FAIL (igual que antes del FIX). Alba responde "claro q soy
  yo / no me crees?" en vez del cambio de tema prescrito por §H.
- **D9** — ✅ PASS (se mantiene).
- **F1** — ❌ FAIL (era PASS tras BUG A/B/C). Turno 5 duplica warm_up
  ("recostada en el sofá" vs "en la cama") y el intent=media no lleva
  media real asociada.

Además aparecen **2 regresiones nuevas** no previstas:
- **F4** — pasaba antes, ahora falla porque Alba manda link de crypto
  cuando el cliente dice "bizum, ya pague" (mismo bug de método de pago
  que afecta a A3/A4/A5/H3).

Y **4 ganancias limpias**:
- **C2** (edad/origen): short-circuit determinista arrancó bien
- **D2** (negocia precio directo): Sales Agent mantiene línea
- **F2** (sexting roleplay profe): F2 pasó por primera vez — el bridge
  post-pago ahora engancha a v2 aunque el rol se especifique tras
  payment_confirmation
- **G6** (pago falla): flujo de error nuevo bien gestionado

---

## Resultados por escenario

| ID | Grupo | Título | Veredicto | Δ vs baseline anterior |
|---|---|---|---|---|
| A1 | A | Cliente saluda simple | FAIL | **↓ (era PASS)** |
| A2 | A | Cliente saluda con pregunta personal | FAIL | = |
| A3 | A | Cliente compra 2 fotos sueltas (precio escalonado v2) | FAIL | = |
| A4 | A | Cliente pide video concreto del catálogo (v_001) | FAIL | = |
| A5 | A | Cliente compra sexting plantilla 5 min | FAIL | = |
| A6 | A | Cliente pide videollamada | FAIL | = |
| A7 | A | Cliente pregunta si es seguro pagar por bizum | FAIL | = |
| B1 | B | Pregunta por detalle de fotos | FAIL | = |
| B2 | B | Pregunta por lista de videos (v2 intent: ask_video_list) | **PASS** | = |
| B3 | B | Cambia de opinión entre categorías | FAIL | = |
| B4 | B | Pregunta si tiene algo específico que SÍ existe | FAIL | = |
| B5 | B | Cliente pide algo que NO hay | FAIL | = |
| C1 | C | Cliente quiere charlar antes de comprar | FAIL | = |
| C2 | C | Cliente pregunta edad y origen | **PASS** | **↑ (era FAIL)** |
| C3 | C | Cliente pregunta qué estudia | FAIL | = |
| D1 | D | Cliente pide GRATIS | **PASS** | = |
| D2 | D | Cliente negocia precio directamente | **PASS** | **↑ (era FAIL)** |
| D3 | D | Cliente duda con el precio de un video | FAIL | = |
| D4 | D | Cliente acosador leve | FAIL | = |
| D5 | D | Cliente acosador fuerte | **PASS** | = |
| D6 | D | Cliente sospecha que es bot | FAIL | **↓ (era PASS)** |
| D7 | D | Cliente pregunta si puede quedar | **PASS** | = |
| D8 | D | Cliente insiste emocionalmente sin comprar | FAIL | = |
| D9 | D | Cliente compara precios con otras modelos | **PASS** | = |
| F1 | F | Sexting estándar sin roleplay (st_5min) | FAIL | **↓ (era PASS)** |
| F2 | F | Sexting con roleplay (profe) — plantilla 10 min | **PASS** | **↑ (era FAIL)** |
| F3 | F | Cliente en sexting manda foto suya | FAIL | = |
| F4 | F | Cliente intenta alargar sexting gratis | FAIL | **↓ (era PASS)** |
| G1 | G | Cliente manda múltiples mensajes seguidos (Pacer) | FAIL | = |
| G5 | G | Cliente pregunta por PayPal | **PASS** | = |
| G6 | G | Cliente paga pero el pago falla | **PASS** | **↑ (era FAIL)** |
| H1 | H | Cliente pide un video por TÍTULO concreto | FAIL | = |
| H2 | H | Cliente pide 4 fotos de tetas (precio escalonado) | FAIL | = |
| H3 | H | Sexting 15 min con roleplay (doctora) + cool_down | FAIL | = |

---

## Por grupo

| Grupo | Pasan / Total | % | vs baseline anterior |
|---|---|---|---|
| A — Saludo / inicio | 0/7 | 0% | ↓ (era 1/7) |
| B — Catálogo / preguntas | 1/5 | 20% | = |
| C — Small talk / personal | 1/3 | 33% | ↑ (era 0/3) |
| D — Difíciles | 5/9 | 56% | = |
| F — Sexting | 1/4 | 25% | ↓ (era 2/4) |
| G — Edge cases | 2/3 | 67% | ↑ (era 1/3) |
| H — Nuevos v2 | 0/3 | 0% | = |

---

## Causas raíz — regresiones nuevas

### 1. A1 — pregunta vacía tras catálogo en la misma ráfaga

El evaluador aplica §6 estrictamente: si el último fragmento de la ráfaga
es una pregunta abierta ("dime qué te mola rey 🔥"), aunque los
fragmentos previos [2][3][4] incluyan el catálogo, cuenta como vacía
porque las opciones no acompañan a la pregunta en el mismo contexto
inmediato. El FIX 1 no cubrió este edge case.

### 2. F1 — warm_up duplicado + media sin payload

Turno 5 genera dos fragmentos ("recostada en el sofá" / "en la cama")
que son variantes del mismo mensaje, y uno lleva `intent=media` sin
adjunto real. El sexting conductor v2 está emitiendo kickoff pero el
Persona lo está doblando por algún branch previo al conductor.

### 3. F4 — bizum → crypto mismatch (mismo bug familia A3/A4/A5/H3)

Cliente dice "ya pague" (bizum) y Alba genera nuevo link de crypto
porque `pending_product_id` no incluye método de pago elegido, o lo
pierde. Este bug es la CAUSA RAÍZ más repetida del baseline:
afecta a A3, A4, A5, F4, H3 (5/34 = 14.7% de los escenarios).

---

## Causas raíz — persistentes (no resueltas)

### 1. Método de pago por defecto = crypto (afecta A3/A4/A5/F4/H3)

Todavía no implementado el fix de `payment_method_selection` que lea
`pending_product_id` sin re-resolver por keyword. Máxima prioridad: un
solo fix podría sacar 5 escenarios del FAIL a PASS.

### 2. Pregunta vacía sin opciones (afecta B1/B3/B4/D4/G1/H1)

Quality Gate no detecta cuando Alba pregunta sin acompañar opciones.
Persona sigue emitiendo "qué te apetece ver?" sin tags en la misma
ráfaga.

### 3. D6 — defensa ante "eres un bot"

Alba responde "claro q soy yo / no me crees?" cuando la regla §H exige
cambio de tema inmediato ("jajaja q dices bebe, demasiado caliente
para ser bot 😏"). Requiere short-circuit determinista o refuerzo en
el prompt de Persona.

### 4. A6/A7 — flujos videollamada y seguridad bizum

Sin Sales Agent cerrando la operación. Alba dice "miro agenda" sin dar
precio ni condiciones (4€/min, mínimo 5 min).

### 5. H2 — precio escalonado mal calculado

Cobra 19€ por 4 fotos cuando `PHOTO_PRICE_TABLE` indica 18€.
Persona inventa el precio en vez de leer la tabla.

### 6. C3 — evasión sobre estudios

Alba dice "de una carrera por aquí" cuando el escenario espera "sí bebe,
ADE". Short-circuit determinista para C2 funcionó; C3 aún requiere fix.

---

## Tipos de fallo (resumen)

| Tipo | Ocurrencias |
|---|---|
| B (no respondió) | ~18 escenarios |
| C (pregunta vacía) | ~11 escenarios |
| D (repitió info) | ~11 escenarios |
| E (inventó precio/contenido) | ~8 escenarios |
| I (flujo no avanza) | ~8 escenarios |
| F (tono/fragmentación) | ~5 escenarios |

---

## Diagnóstico

**Este baseline revela que los 4 FIX commits (A1/D6/D9/F1) no son
estables:**
- Solo D9 se mantiene en verde.
- A1 y F1 volvieron a FAIL pese a tener commits dedicados.
- D6 nunca llegó a pasar.
- Y F4 regresionó sin estar cubierto por el FIX.

La hipótesis más probable es que los FIX 1/3/4 sean **frágiles frente a
la inestabilidad del evaluador** (juez LLM no determinista) y/o que el
commit haya introducido side-effects en Persona (inconsistencia en
emisión de catálogo + pregunta).

---

## Próximos pasos (pendientes de autorización del owner)

1. **PAGO:** fix `payment_method_selection` — resuelve A3/A4/A5/F4/H3.
2. **QUALITY GATE:** detector de "pregunta vacía sin opciones" como
   hard-fail del Gate — resuelve B1/B3/B4/D4/G1/H1.
3. **D6:** short-circuit determinista para "eres un bot" en el Router.
4. **H2:** leer `PHOTO_PRICE_TABLE` desde Persona context (no inventar).
5. **F1:** auditar la cadena Sexting Conductor v2 → Persona para evitar
   warm_up duplicado y media sin payload.
6. **A1/A2:** reglas de emisión de catálogo + pregunta en la MISMA
   ráfaga (evaluador lo exige).

> Fuzz: 3/20 sin cambios (ver FUZZ-REPORT.md). Baseline: 10/34 sin
> cambios netos.

---

## Reproducción

```bash
TEST_MODE=true npm run dev     # en otra terminal
node scripts/auto-iterate.js --mode=baseline --scenarios-v2
node scripts/run-fuzz-tests.js --sample=20
```

Resumen crudo se append a `docs/MEJORAS.md`.
