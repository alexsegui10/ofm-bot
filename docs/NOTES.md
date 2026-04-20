# NOTES — pendientes a mano para cuando toquemos zonas concretas

## Orquestador — suciedad acumulada en zona videocall

Al investigar A6 (2026-04-20) vi estas cosas en `src/orchestrator.js` que hay que arreglar cuando se entre a tocar orquestador (bloque A1/A2/A3/B5 + A6):

- **Dead code duplicado:** líneas 833-834 y 841-842 ambas manejan `resolvedIntent === 'videocall_request'`. El segundo handler nunca dispara (el primero lo captura antes, porque incluye OR con `custom_video_request`). La segunda rama puede eliminarse.

- **Instrucción A6 mal redactada:** línea 834 dice *"dile que espere un momento mientras miras tu agenda. NO confirmes nada aún"*. Debería decir el precio primero: *"son 4€ el minuto mínimo 5 min, cuándo te va bien?"* y sólo tras el cliente dar un momento concreto pasar a handoff + "dame 5 min".

- Además: el orquestador no invoca `createOfferFromProduct('videocall:N')` cuando el cliente ya dio minutos — delega siempre a Persona. Plausible bug secundario a revisar con A6.

## D3 — §11 concession no implementado (post 91ad323)

D3 escenario evalúa DOS cosas: (1) precio correcto del video, (2) §11 tactical concession cuando cliente muestra duda de precio ("uff 12€... no sé"). Post-commits:

- Precio correcto cubierto por la inyección de `buildPriceReference()` en Persona (si acaba cotizando, usa 12€ de v_005 y no inventa 15€).
- **§11 concession NO existe en código.** Ningún grep por `concession`, `bonus`, `price_hesitation`, `§11` encuentra nada. Requiere feature nueva: (a) Router intent nuevo o pattern match para "uff X€... no sé", (b) Sales handler que emita oferta bonus (foto extra gratis), (c) decisiones de producto por owner: qué bonus, cuándo aplica, máx 15%.

Se discute con Alba otro día. Por ahora D3 probablemente seguirá FAIL.

## Baseline crashed en D2 (2026-04-20 15:48 UTC)

Full baseline de 34 post-3-commits murió silenciosamente durante D2 (scenario 17/34). Se completaron A1-D1 (16 veredictos), se perdieron D2-H3 (18). Causa desconocida: proceso `node auto-iterate.js` desapareció, server TEST_MODE seguía vivo. No hubo excepción al stdout. Posibles: Grok timeout, rate-limit Anthropic, OOM node, bug en fake-client.js post-turn-heavy scenario. Re-lanzado en 2 tandas. Si se repite, investigar antes de seguir.

## Empty turn 1 tras 'hola' (patrón A1/A2/A3)

Al calibrar evaluador vi que A3 ahora falla con "Alba no emitió ningún fragmento en turno 1". Mismo patrón en A1, A2. El escenario G5 también lo ha mostrado intermitentemente (varianza). Probable causa: race entre pacer / catálogo auto-emitido / fake-client captura. Prioridad alta cuando toquemos orquestador.
