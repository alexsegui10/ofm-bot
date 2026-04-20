# NOTES — pendientes a mano para cuando toquemos zonas concretas

## Techo del evaluador (2026-04-20)

Tras 2 rondas de calibración del evaluador LLM-as-judge (Sonnet 4.6):

- **Round 1 (commit 77de062):** añadió principios generales §9 + ejemplos de bot/IA denial + desambiguación risas/alargamientos. Subió baseline 11→16/34.
- **Round 2 (revertida, intentada tras ae5138c):** reforzó §9C ("catálogo auto-emitido SIEMPRE cuenta como opciones") y §9D ("JAMÁS intra-burst"). NO aportó ganancia — evaluador sigue violando las reglas reforzadas ("técnicamente la regla D dice..., aquí rompe coherencia narrativa" — aplica criterio subjetivo ignorando el literal). Se revirtió.

**Conclusión:** el evaluador tiene un techo duro. Ronda 3 no tiene sentido. Futuros FAILs a clasificar en:
- **Bugs reales del bot** (a corregir): A2 "holaaaa" determinista, B1 tags no enumera, A6 handoff no dispara, B5 inventa contenido, D3 §11 concession no implementado, empty-turn-1 raro.
- **Interpretación subjetiva irreductible** (aceptar): A2 §9D "doble saludo incoherente", A1 §9C "catálogo demasiado genérico" — no se arregla sin cambiar scenario file o modelo del evaluador.



## Orquestador — suciedad acumulada en zona videocall

Al investigar A6 (2026-04-20) vi estas cosas en `src/orchestrator.js` que hay que arreglar cuando se entre a tocar orquestador (bloque A1/A2/A3/B5 + A6):

- **Dead code duplicado:** líneas 833-834 y 841-842 ambas manejan `resolvedIntent === 'videocall_request'`. El segundo handler nunca dispara (el primero lo captura antes, porque incluye OR con `custom_video_request`). La segunda rama puede eliminarse.

- **Instrucción A6 mal redactada:** línea 834 dice *"dile que espere un momento mientras miras tu agenda. NO confirmes nada aún"*. Debería decir el precio primero: *"son 4€ el minuto mínimo 5 min, cuándo te va bien?"* y sólo tras el cliente dar un momento concreto pasar a handoff + "dame 5 min".

- Además: el orquestador no invoca `createOfferFromProduct('videocall:N')` cuando el cliente ya dio minutos — delega siempre a Persona. Plausible bug secundario a revisar con A6.

## A6 — handoff no se dispara tras videollamada (tasa 60%)

5 iteraciones de A6 tras fix 1483fc4: 3/5 FAIL por `H — No activó Human Handoff tras solicitud de videollamada`. Alba emite "dame 5 min a ver si puedo" pero el sistema **no propaga** handoff al backend (WhatsApp al owner). El turno 2 cotiza precio correctamente (fix trabaja), pero turno 3 con 'ahora' no dispara `human-handoff.js`. Investigar trigger del handoff tras calibración round 2: buscar dónde debería activarse y por qué no lo hace. No tocar en el bloque actual.

## Empty-turn-1 (A1/A6) — tasa 5%, aparcado

5 iteraciones × 4 escenarios = 20 runs. Manifestación: 1/20 (iter 3, A1, "Alba no respondió nada"). `pipeline error` en server log: 0 tras ~4h runtime. La hipótesis "catch silencioso en business.js:208" fue refutada — cuando ocurre empty-turn-1 NO hay excepción, es un path silencioso de no-output. No vale la pena fix ahora. Si la tasa sube en baselines futuros, reabrir con logging dentro de `handleMessage`.

## D3 — §11 concession no implementado (post 91ad323)

D3 escenario evalúa DOS cosas: (1) precio correcto del video, (2) §11 tactical concession cuando cliente muestra duda de precio ("uff 12€... no sé"). Post-commits:

- Precio correcto cubierto por la inyección de `buildPriceReference()` en Persona (si acaba cotizando, usa 12€ de v_005 y no inventa 15€).
- **§11 concession NO existe en código.** Ningún grep por `concession`, `bonus`, `price_hesitation`, `§11` encuentra nada. Requiere feature nueva: (a) Router intent nuevo o pattern match para "uff X€... no sé", (b) Sales handler que emita oferta bonus (foto extra gratis), (c) decisiones de producto por owner: qué bonus, cuándo aplica, máx 15%.

Se discute con Alba otro día. Por ahora D3 probablemente seguirá FAIL.

## Baseline crashed en D2 (2026-04-20 15:48 UTC)

Full baseline de 34 post-3-commits murió silenciosamente durante D2 (scenario 17/34). Se completaron A1-D1 (16 veredictos), se perdieron D2-H3 (18). Causa desconocida: proceso `node auto-iterate.js` desapareció, server TEST_MODE seguía vivo. No hubo excepción al stdout. Posibles: Grok timeout, rate-limit Anthropic, OOM node, bug en fake-client.js post-turn-heavy scenario. Re-lanzado en 2 tandas. Si se repite, investigar antes de seguir.

## Empty turn 1 tras 'hola' (patrón A1/A2/A3)

Al calibrar evaluador vi que A3 ahora falla con "Alba no emitió ningún fragmento en turno 1". Mismo patrón en A1, A2. El escenario G5 también lo ha mostrado intermitentemente (varianza). Probable causa: race entre pacer / catálogo auto-emitido / fake-client captura. Prioridad alta cuando toquemos orquestador.
