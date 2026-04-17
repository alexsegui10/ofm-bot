# Preguntas pendientes al owner

Este archivo lo usa el loop de iteración autónoma (`scripts/auto-iterate.js`) para
dejar dudas al owner cuando no puede decidir por sí mismo.

Formato de cada entrada (según `docs/criterio.md` sección 12):

```
## [YYYY-MM-DD HH:MM] <Título corto>

**Escenario afectado:** <ID> (p. ej. A3, D7)
**Iteración:** N
**Situación:**
<Descripción del caso concreto que ha ocurrido.>

**Opciones que he considerado:**
- A: ...
- B: ...

**Lo que he hecho mientras tanto:**
<Respuesta temporal, revert, o skip.>

**Decisión requerida del owner:**
<Qué necesito que decidas para desbloquear.>
```

---

## [2026-04-17 17:30] Estrategia de refactor Paso 4: extensión no-destructiva

**Escenario afectado:** Paso 4 completo
**Iteración:** 0 (decisión inicial)

**Situación:**
El código legacy ya pasa 379 tests (incluido un `src/agents/sexting-conductor.js`
con 15+ tests, un `src/lib/product-catalog.js` con 29 tests sobre `pricing.json`,
y un `orchestrator.js` con 11 tests que entretejen `resolveProduct` / `getCatalogText`
/ `getCategoryDetail` en 6+ rutas distintas). Un rewrite directo a `products.json`
rompería toda esa red.

**Decisión tomada (default, sin bloquearme):**
Refactor por extensión, NO por sustitución:
- `config/pricing.json` y `src/lib/product-catalog.js` **se quedan** como legacy
  (tú dijiste "solo lee, para info legacy que quede"). Los 29 tests de
  product-catalog siguen intactos.
- `src/agents/sexting-conductor.js` (motor viejo con playlists) **se queda**
  como fallback. Creo el nuevo en `src/lib/sexting-conductor.js` tal cual
  especificaste — es otro path.
- `src/agents/sales.js` **se amplía** con `createOfferFromProduct(productId, ...)`
  que resuelve desde `products.json`; la API `runSales` vieja no cambia.
- Router **añade** los nuevos intents (aditivo, no reemplaza los existentes).
- Orchestrator **añade ramas** para los nuevos intents v2 sin tocar las ramas
  legacy. Si el router devuelve `choose_video`/`ask_video_list`/etc, cae en
  la rama nueva. Si devuelve los antiguos, sigue el camino viejo.
- Persona.js recibe nuevas `internalInstruction` para los intents v2; el motor
  no cambia.

**Por qué:**
- Mantiene los 379 tests verdes durante el refactor.
- Permite al owner probar el nuevo flujo con un rollback trivial si algo explota.
- La migración completa (matar `pricing.json` y el conductor viejo) es un Paso
  posterior, cuando los tests v2 ya cubran la superficie.

**Decisión requerida del owner (cuando vuelvas):**
¿Apruebas este enfoque, o prefieres un rewrite destructivo ahora? Si no dices
nada, sigo con la extensión y anoto el cleanup de legacy para un paso futuro.

---

## [2026-04-17 17:35] Pasos 7 y 8 requieren credenciales LLM + llamadas reales

**Escenario afectado:** Paso 7 (baseline) y Paso 8 (fuzz generativo)
**Iteración:** 0

**Situación:**
Paso 7 ejecuta `scripts/auto-iterate.js --baseline --scenarios-v2` contra el
pipeline real (Router=Sonnet 4.6, Persona=Grok). Paso 8 genera 50 perfiles
con Sonnet 4.6 y corre 50 conversaciones simuladas.
No tengo forma de saber si el `.env` tiene ANTHROPIC_API_KEY + OPENROUTER_API_KEY
con crédito, y no debo tocar `.env`.

**Decisión tomada (default):**
- Preparo scripts completos y corro el mínimo viable para generar reportes.
- Si una llamada LLM falla por 401/quota, atrapo el error, anoto en el
  reporte las secciones no completadas, y sigo.
- Reportes se generan aunque estén parciales (`BASELINE-V2-REPORT.md` /
  `FUZZ-REPORT.md` con la sección "Estado de ejecución: parcial, motivo: X").

**Decisión requerida del owner (cuando vuelvas):**
Revisa los reportes. Si están parciales por falta de API, relanzamos los scripts
con `.env` OK en una segunda pasada.

---

## [2026-04-17 17:36] "Mueve los tests actuales a scripts/tests-legacy/" — ambigüedad

**Escenario afectado:** Paso 6
**Iteración:** 0

**Situación:**
Tu instrucción literal fue "Mueve los tests actuales a scripts/tests-legacy/ (backup)".
Dos interpretaciones posibles:
1. Mover **los 21 archivos `*.test.js` unitarios** junto al código (src/**/*.test.js).
   → los 379 tests dejan de correr, perdemos la red de seguridad.
2. Mover **los escenarios E2E antiguos** (scripts/scenarios.js + docs/test-scenarios.md)
   porque la sección de Paso 6 habla de A/B/C/D/F/G con IDs como "A3 viejo → A3 nuevo".

**Decisión tomada (default, opción 2):**
- Solo los scenarios E2E (scripts/scenarios.js) y la ficha docs/test-scenarios.md
  se mueven a `scripts/tests-legacy/`.
- Los 21 `*.test.js` unitarios junto al código NO se tocan — son la única red
  de seguridad del refactor y siguen verdes.
- scripts/tests/products-loader.test.js y scripts/tests/seed-integrity.test.js
  (que son de Paso 1/3) TAMPOCO se mueven — son tests del nuevo modelo, válidos.

**Decisión requerida del owner:**
Si querías opción 1, revertimos con `git mv`.

---
