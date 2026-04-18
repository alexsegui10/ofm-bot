# BASELINE V2 — Report

**Fecha:** 2026-04-18 (re-run tras Paso 8.5)
**Comando:** `node scripts/auto-iterate.js --mode=baseline --scenarios-v2`
**Dataset:** `scripts/scenarios-v2.js` — 34 escenarios P1
**Modelos activos:**
- Persona: `xai/grok-3-beta` (primario) + Dolphin-Mistral-Venice (fallback)
- Router / Quality / Sales / Evaluador: `claude-sonnet-4-6`

---

## Resumen ejecutivo

- **Pasaron: 4 / 34 (11.7%)** — vs **8 / 34 (23.5%) en baseline anterior (2026-04-17)**
- Fallaron: 30 / 34
- **Regresión neta: −4** (perdimos 5: D2, D7, F2, F3, F4 · ganamos 1: D4)

Este baseline se ejecuta TRAS los 4 fixes del Paso 8.5:
- **FIX 1 (T1):** `getCatalogText()` → ahora lee `products.json`
- **FIX 2 (T2):** `pending_product_id` + `pending_amount_eur` persistidos en `clients`
- **FIX 3 (T3+T5):** `sexting-bridge` engancha el conductor v2 en `payment_confirmation`
- **FIX 4:** intent-aware first-message — ya no se inyecta catálogo completo cuando el cliente nuevo entra con intent directo

Las regresiones se concentran en F (sexting v2) y D (small talk avanzado), por lo que
la causa raíz no parece estar en FIX 1/2/4 sino en el **comportamiento del conductor
v2 cuando entra inmediatamente tras pago confirmado** (FIX 3).

---

## Resultados por escenario

| ID | Grupo | Título | Veredicto | Δ vs baseline anterior |
|---|---|---|---|---|
| A1 | A | Cliente saluda simple | FAIL | = |
| A2 | A | Cliente saluda con pregunta personal | FAIL | = |
| A3 | A | Cliente compra 2 fotos sueltas (precio escalonado v2) | FAIL | = |
| A4 | A | Cliente pide video concreto del catálogo (v_001) | FAIL | = |
| A5 | A | Cliente compra sexting plantilla 5 min | FAIL | = |
| A6 | A | Cliente pide videollamada | FAIL | = |
| A7 | A | Cliente pregunta si es seguro pagar por bizum | FAIL | = |
| B1 | B | Pregunta por detalle de fotos | FAIL | = |
| B2 | B | Pregunta por lista de videos (v2 intent: ask_video_list) | FAIL | = |
| B3 | B | Cambia de opinión entre categorías | FAIL | = |
| B4 | B | Pregunta si tiene algo específico que SÍ existe | FAIL | = |
| B5 | B | Cliente pide algo que NO hay | FAIL | = |
| C1 | C | Cliente quiere charlar antes de comprar | FAIL | = |
| C2 | C | Cliente pregunta edad y origen | FAIL | = |
| C3 | C | Cliente pregunta qué estudia | FAIL | = |
| D1 | D | Cliente pide GRATIS | **PASS** | = |
| D2 | D | Cliente negocia precio directamente | FAIL | **↓ (era PASS)** |
| D3 | D | Cliente duda con el precio de un video | FAIL | = |
| D4 | D | Cliente acosador leve | **PASS** | **↑ (era FAIL)** |
| D5 | D | Cliente acosador fuerte | **PASS** | = |
| D6 | D | Cliente sospecha que es bot | FAIL | = |
| D7 | D | Cliente pregunta si puede quedar | FAIL | **↓ (era PASS)** |
| D8 | D | Cliente insiste emocionalmente sin comprar | FAIL | = |
| D9 | D | Cliente compara precios con otras modelos | FAIL | = |
| F1 | F | Sexting estándar sin roleplay (st_5min) | FAIL | = |
| F2 | F | Sexting con roleplay (profe) — plantilla 10 min | FAIL | **↓ (era PASS)** |
| F3 | F | Cliente en sexting manda foto suya | FAIL | **↓ (era PASS)** |
| F4 | F | Cliente intenta alargar sexting gratis | FAIL | **↓ (era PASS)** |
| G1 | G | Cliente manda múltiples mensajes seguidos (Pacer) | FAIL | = |
| G5 | G | Cliente pregunta por PayPal | **PASS** | = |
| G6 | G | Cliente paga pero el pago falla | FAIL | = |
| H1 | H | Cliente pide un video por TÍTULO concreto | FAIL | = |
| H2 | H | Cliente pide 4 fotos de tetas (precio escalonado) | FAIL | = |
| H3 | H | Sexting 15 min con roleplay (doctora) + cool_down | FAIL | = |

---

## Por grupo

| Grupo | Pasan / Total | % | vs anterior |
|---|---|---|---|
| A — Saludo / inicio | 0/7 | 0% | = (era 0/7) |
| B — Catálogo / preguntas | 0/5 | 0% | = (era 0/5) |
| C — Small talk / personal | 0/3 | 0% | = (era 0/3) |
| D — Difíciles | 3/9 | 33% | = (era 3/9 — D2/D7 perdidos, D4 ganado) |
| F — Sexting | 0/4 | 0% | **↓ (era 3/4)** |
| G — Edge cases | 1/3 | 33% | = (era 1/3) |
| H — Nuevos v2 | 0/3 | 0% | = (era 0/3) |

---

## Causas raíz identificadas

### 1. Bug crítico: T6 — Persona no respeta el conductor v2 (F1, F2, F3, F4)

En F1/F2 la evaluadora reporta **turnos completamente vacíos** tras el pago: el
cliente dice "5 min" → pago → la primera respuesta del conductor v2 llega
demasiado tarde o no llega. Esto sugiere que `startSextingV2ForClient`
arranca la sesión pero el primer `handleClientTurn` no produce salida visible
(o la genera pero el `extraFragments` del kickoff no se concatena bien al flujo
de respuestas).

Otros síntomas relacionados con FIX 3:
- F2: el bridge inserta el kickoff "vamos allá bebe, soy tu profesora 😈" pero
  Persona luego ignora la fase warm_up dirigida y pregunta "qué asignatura
  necesitas que te enseñe hoy?" — el conductor v2 no está dirigiendo el guion.
- F3: "ya lo vi bebe" → frase prohibida (§7) cuando el cliente manda foto. El
  v2 conductor no aplica el filtro de "nunca confirmar visión de imágenes".
- F4: Persona vuelve a ofrecer 5/10/15 min cuando el cliente ya está EN sesión
  pidiendo "5 min mas" — significa que el bridge no detecta que la sesión está
  activa y deja que la rama legacy de "extender sexting" tome control.

**Implicación:** FIX 3 está parcialmente roto. El motor v2 se arranca, pero
(a) el primer turno no produce output legible, (b) Persona ignora la
instrucción del conductor v2, y (c) el cliente puede salirse del flujo v2 a
mitad sin que el bridge lo retenga.

### 2. Regresión D2/D7 — small talk + objeciones (sin relación con sexting)

- **D2** ("negocia precio"): tras el primer turno con catálogo, en el turno 4
  Alba vuelve a listar TODOS los tags y precios cuando el cliente ya había
  pedido "2 fotos de tetas". Esto puede ser efecto secundario de FIX 4 —
  la lógica de `intentSkipsCatalog` deja pasar el catálogo porque el intent
  re-detectado en turno 4 no está en `CATEGORY_DETAIL_INTENTS`.
- **D7** ("puede quedar"): turno 2 ahora hace "qué te apetece hacer por aquí?"
  sin opciones — se eliminó el catálogo automático por FIX 4 pero no se añadió
  fallback de propuesta.

### 3. Bugs preexistentes NO resueltos por Paso 8.5

- **A3, A4, H1, H2** ("inventó precio 7€"): el Router clasifica como
  `sale_intent_photos` / `sale_intent_videos` en vez de
  `buy_single_photos` / `choose_video`, por lo que FIX 2 no se dispara y
  el flujo cae a `resolveProduct` legacy que devuelve 7€ por defecto. Es un
  problema de prompt del Router, no del orquestador.
- **C2, C3** (inventa origen, menciona "complutense"): Persona aún halucina
  datos personales pese a `quality_gate` — falta endurecer las prohibiciones
  en el prompt de Persona.
- **G1** (Pacer): cliente envía 4 mensajes seguidos y Alba repite literalmente
  el catálogo en cada uno. El Pacer agrupa mensajes pero Persona no detecta
  que ya envió el mismo catálogo en el turno previo.

---

## Tipos de fallo (resumen)

| Tipo | Ocurrencias |
|---|---|
| B (no respondió) | ~22 escenarios |
| C (pregunta vacía) | ~18 escenarios |
| D (repitió info) | ~15 escenarios |
| E (inventó contenido/precio) | ~10 escenarios |
| I (flujo no avanza) | ~12 escenarios |
| F (tono/emoji prohibido) | 3 escenarios |
| A (frase prohibida) | 2 escenarios (C3, F3) |
| H (límite duro violado) | 1 escenario (C3) |

---

## Próximos pasos (pendientes de autorización del owner)

1. **Investigar regresión F1-F4 (FIX 3)** — depurar por qué el primer turno
   del conductor v2 sale vacío y por qué Persona no respeta la instrucción de
   warm_up. Es la regresión más crítica.
2. **Tunear router de intents** para que clasifique "quiero 2 fotos de culo"
   como `buy_single_photos` (no `sale_intent_photos`) — desbloquearía A3/A4/H1/H2.
3. **Ajustar FIX 4** para preservar contexto en turnos 2+: si el cliente ya
   eligió producto en turno 1, no re-inyectar catálogo en turno 4 aunque el
   intent vuelva a ser genérico.
4. Endurecer prompt Persona contra hallucinations de bio (origen, universidad).

> **NO lanzar Paso 9 (loop autónomo) hasta resolver al menos los puntos 1 y 2.**

---

## Reproducción

```bash
TEST_MODE=true npm run dev     # en otra terminal
node scripts/auto-iterate.js --mode=baseline --scenarios-v2
```

Resumen crudo se append a `docs/MEJORAS.md`.
