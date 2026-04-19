# BASELINE V2 — Report

**Fecha:** 2026-04-19 (re-run tras BUG A/B/C)
**Comando:** `node scripts/auto-iterate.js --mode=baseline --scenarios-v2`
**Dataset:** `scripts/scenarios-v2.js` — 34 escenarios P1
**Modelos activos:**
- Persona: `xai/grok-3-beta` (primario) + Dolphin-Mistral-Venice (fallback)
- Router / Quality / Sales / Evaluador: `claude-sonnet-4-6`

---

## Resumen ejecutivo

- **Pasaron: 10 / 34 (29.4%)** — vs **4 / 34 (11.7%) en baseline anterior (2026-04-18)**
- Fallaron: 24 / 34
- **Ganancia neta: +6** (ganamos 7: A1, B2, D6, D7, D9, F1, F4 · perdimos 1: D4)

Este baseline se ejecuta TRAS los 3 fixes de la ronda BUG A/B/C:
- **BUG A:** Router prompt restructurado con PRIORIDAD MÁXIMA para v2 intents + extracción de params (tag/count/product_id/template_id)
- **BUG B:** `buildSextingV2Instruction` reforzado con reglas explícitas (no preguntar, no confirmar imágenes, dirigir el guion). Instrucción inyectada como PREFIJO `<INSTRUCCION_PRIORITARIA>` en system prompt de Persona. Historia reciente pasada a runPersona durante v2 active turn
- **BUG C:** Helpers `assistantHasShownCatalog()` + `clientExplicitlyAsksCatalog()` para suprimir re-emisión automática de catálogo y category-detail en turnos 2+ a menos que el cliente lo pida

Target era 18+/34: NO alcanzado, pero tendencia clara de mejora (+150% en pasajes).

---

## Resultados por escenario

| ID | Grupo | Título | Veredicto | Δ vs 2026-04-18 |
|---|---|---|---|---|
| A1 | A | Cliente saluda simple | **PASS** | **↑ (era FAIL)** |
| A2 | A | Cliente saluda con pregunta personal | FAIL | = |
| A3 | A | Cliente compra 2 fotos sueltas (precio escalonado v2) | FAIL | = |
| A4 | A | Cliente pide video concreto del catálogo (v_001) | FAIL | = |
| A5 | A | Cliente compra sexting plantilla 5 min | FAIL | = |
| A6 | A | Cliente pide videollamada | FAIL | = |
| A7 | A | Cliente pregunta si es seguro pagar por bizum | FAIL | = |
| B1 | B | Pregunta por detalle de fotos | FAIL | = |
| B2 | B | Pregunta por lista de videos (v2 intent: ask_video_list) | **PASS** | **↑ (era FAIL)** |
| B3 | B | Cambia de opinión entre categorías | FAIL | = |
| B4 | B | Pregunta si tiene algo específico que SÍ existe | FAIL | = |
| B5 | B | Cliente pide algo que NO hay | FAIL | = |
| C1 | C | Cliente quiere charlar antes de comprar | FAIL | = |
| C2 | C | Cliente pregunta edad y origen | FAIL | = |
| C3 | C | Cliente pregunta qué estudia | FAIL | = |
| D1 | D | Cliente pide GRATIS | **PASS** | = |
| D2 | D | Cliente negocia precio directamente | FAIL | = |
| D3 | D | Cliente duda con el precio de un video | FAIL | = |
| D4 | D | Cliente acosador leve | FAIL | **↓ (era PASS)** |
| D5 | D | Cliente acosador fuerte | **PASS** | = |
| D6 | D | Cliente sospecha que es bot | **PASS** | **↑ (era FAIL)** |
| D7 | D | Cliente pregunta si puede quedar | **PASS** | **↑ (era FAIL)** |
| D8 | D | Cliente insiste emocionalmente sin comprar | FAIL | = |
| D9 | D | Cliente compara precios con otras modelos | **PASS** | **↑ (era FAIL)** |
| F1 | F | Sexting estándar sin roleplay (st_5min) | **PASS** | **↑ (era FAIL)** |
| F2 | F | Sexting con roleplay (profe) — plantilla 10 min | FAIL | = |
| F3 | F | Cliente en sexting manda foto suya | FAIL | = |
| F4 | F | Cliente intenta alargar sexting gratis | **PASS** | **↑ (era FAIL)** |
| G1 | G | Cliente manda múltiples mensajes seguidos (Pacer) | FAIL | = |
| G5 | G | Cliente pregunta por PayPal | **PASS** | = |
| G6 | G | Cliente paga pero el pago falla | FAIL | = |
| H1 | H | Cliente pide un video por TÍTULO concreto | FAIL | = |
| H2 | H | Cliente pide 4 fotos de tetas (precio escalonado) | FAIL | = |
| H3 | H | Sexting 15 min con roleplay (doctora) + cool_down | FAIL | = |

---

## Por grupo

| Grupo | Pasan / Total | % | vs 2026-04-18 |
|---|---|---|---|
| A — Saludo / inicio | 1/7 | 14% | ↑ (era 0/7) |
| B — Catálogo / preguntas | 1/5 | 20% | ↑ (era 0/5) |
| C — Small talk / personal | 0/3 | 0% | = (era 0/3) |
| D — Difíciles | 5/9 | 56% | ↑ (era 3/9) |
| F — Sexting | 2/4 | 50% | ↑↑ (era 0/4) — recuperación parcial de F1/F4 tras BUG B |
| G — Edge cases | 1/3 | 33% | = (era 1/3) |
| H — Nuevos v2 | 0/3 | 0% | = (era 0/3) |

---

## Causas raíz pendientes (no resueltas por BUG A/B/C)

### 1. F2/F3 sexting v2 con roleplay sigue roto

- **F2:** Alba dijo "son 30€" sin esperar método de pago. Tras pagar, sigue
  preguntando "qué necesitas que te enseñe" en lugar de arrancar el guion
  como profe → BUG B no llega a inyectar la instrucción porque la sesión v2
  todavía no está activa cuando llega el turno con roleplay (el bridge se
  engancha en payment_confirmation pero el cliente especifica el rol DESPUÉS
  del pago, en el siguiente turno; el fragmento "qué necesitas" sale antes
  de que getActiveV2SessionForClient devuelva true).
- **F3:** Aunque BUG B prohíbe "ya lo vi", el escenario falla por una
  pregunta vacía "qué te apetece imaginar conmigo?" — la instrucción de
  "TÚ DIRIGES" llega pero Persona la ignora cuando recibe una foto en
  mitad de sexting (el branch `hasMedia` del orquestador inyecta otra
  instruction y sobreescribe la del conductor v2).

### 2. H1/H2/A3/A4 — precio inventado (7€ por defecto)

A pesar del BUG A (Router devuelve params), los logs muestran que en H1/H2
el flujo cae a la rama legacy `resolveProduct(...)` cuando el cliente
responde "crypto" sin nombrar el producto otra vez (se pierde el
`pending_product_id`). FIX 2 (T2) persiste pending_product_id pero
`payment_method_selection` lo lee y aún así re-resuelve por keyword.

### 3. A5/A6/A7 — flujos de sexting/videollamada/seguridad no v2

Los escenarios A5 (sexting), A6 (videollamada), A7 (seguridad bizum) caen
fuera de v2 (siguen el path legacy `sexting_request` / `videocall_request`).
Sales Agent no termina de cerrar la operación. Requiere trabajo
independiente sobre `runSales` + plantillas.

### 4. C2/C3 — Persona alucina datos personales

Persistente desde el baseline anterior. El prompt de Persona tiene reglas
("PROHIBIDO mencionar Complutense") pero el modelo las ignora cuando el
cliente pregunta directamente por estudios/origen. Necesita endurecimiento
de Quality Gate o un short-circuit determinista para preguntas personales.

### 5. G1 — Pacer + repetición de catálogo

Aunque BUG C suprime la re-inyección automática de catálogo, G1 sigue
fallando porque Persona LITERALMENTE re-emite la lista en el TEXTO de
respuesta (no en el append). El conductor de Persona necesita una
instrucción anti-repetición más fuerte cuando detecta que el cliente está
en modo "rafagueo".

### 6. D4 — regresión mínima (tono)

D4 (acosador leve) pasó antes pero ahora falla por evaluación más
estricta del tono ("un poco de respeto vale?" suena demasiado seria) +
fragmentación excesiva. No es regresión causada por BUG A/B/C — es
inestabilidad del juez evaluador entre runs.

---

## Tipos de fallo (resumen)

| Tipo | Ocurrencias |
|---|---|
| B (no respondió) | ~17 escenarios |
| C (pregunta vacía) | ~12 escenarios |
| D (repitió info) | ~10 escenarios |
| E (inventó precio/contenido) | ~9 escenarios |
| I (flujo no avanza) | ~9 escenarios |
| F (tono/fragmentación) | ~3 escenarios |

---

## Próximos pasos (pendientes de autorización del owner)

1. **F2/F3:** mover el check `getActiveV2SessionForClient` también ANTES
   de la rama `hasMedia`, y hacer que el bridge se enganche en cuanto
   llegue el primer mensaje post-pago aunque el `payment_confirmation`
   intent venga implícito.
2. **H1/H2/A3/A4:** revisar `payment_method_selection` para que SIEMPRE
   use `pending_product_id` cuando exista, sin re-resolver por keyword.
3. **G1 (Pacer):** instrucción anti-repetición a Persona cuando detecta
   que ya respondió con lista en el turno anterior.
4. **C2/C3:** short-circuit determinista para preguntas personales tipo
   "qué estudias / de dónde eres".

> Aún por debajo del target 18+/34. Recomiendo iterar en F2/F3 y H1/H2
> antes de lanzar el loop autónomo del Paso 9.

---

## Reproducción

```bash
TEST_MODE=true npm run dev     # en otra terminal
node scripts/auto-iterate.js --mode=baseline --scenarios-v2
node scripts/run-fuzz-tests.js --sample=20
```

Resumen crudo se append a `docs/MEJORAS.md`.
