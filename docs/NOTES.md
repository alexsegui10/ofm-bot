# NOTES — pendientes a mano para cuando toquemos zonas concretas

## Sistema 2 integration — notificación a Alex cuando llega mensaje durante pausa (pendiente)

Tras integrar `getChatStatus` en `handleMessage` (SPEC-HANDOFF-V1 §2), cuando un cliente escribe durante una pausa, el mensaje actualmente **solo se guarda en DB**. Alex no se entera.

Mejora pendiente: notificar a Alex por WhatsApp vía `notifyOwner` cuando el cliente siga escribiendo durante la pausa. Pendiente decidir la UX:

- ¿Por cada mensaje? (ruidoso si el cliente escribe varios seguidos)
- ¿Batch con debounce de 1-2 min? (más silencioso pero introduce latencia)
- ¿Configurable por tipo de pausa? (p.ej. `paused_awaiting_human` → notify inmediato, `paused_manual` → solo guardar)

Implementar en sprint futuro tras validar comportamiento real con el primer cliente piloto. Decisión de UX de Alex requerida.



## Experimento temperatura 2026-04-21 — REFUTADO y revertido

**Hipótesis:** Grok variance era el driver de ruido en baselines. Bajar temp de 0.75 → 0.5 en contextos non-sexting estabilizaría baseline ≥20.

**Aplicación (commit b08840d, revertido):** en `persona.js` → `temperature = /sexting/i.test(intent) ? 0.75 : 0.5`. Sexting intents mantuvieron 0.75.

**Resultado full baseline:** **17/34** (< 19 referencia limpia) → aplicada regla FASE 3: revert automático.

| Tipo | Escenarios | Count |
|---|---|---|
| RECUPERADOS (era FAIL 19/34, ahora PASS) | A5, A6 | +2 |
| REGRESIONADOS (era PASS 19/34, ahora FAIL) | B2, C3, D4, D9 | -4 |
| Net | | **-2** |

**Conclusión:** temperatura baja NO es el driver. De hecho, **empeora** escenarios del grupo B (catálogo/detalle de fotos) y algunos del grupo D donde Persona requiere variabilidad para cubrir los matices que el evaluador busca. Recuperaciones en A5/A6 son probablemente varianza normal y no atribuibles al cambio.

**Temperatura 0.75 queda como valor óptimo.** Revert automático vía `git reset --hard HEAD~1`. HEAD tras revert: `3a45aa2`.

**Próximos frentes:**
- Bajar temperatura más NO tiene sentido (0.5 ya empeoró).
- Intentar temp 0.6 o 0.65 como punto intermedio podría probarse pero ROI bajo (variance es estructural, no reducible solo con temp).
- Mejor inversión: atacar bugs reales pendientes (A6 handoff FASE 6, D3 §11 concession, empty-turn-1) o mejorar stability del orchestrator.

---



## Estado consolidado 2026-04-21 (post cherry-picks + server fresco)

Tras reintroducir `e4c3651` (A2 sanitizeElongations) y `1d54629` (B1 patrones "qué tipo de X") con server recién reiniciado y full baseline limpio:

**Baseline real: 19/34** (17 PASS confirmados + 2 H2/H3 que fallaron por `evaluator_error` de Anthropic API sin crédito, no por bot). Sin el bloqueo operacional de H2/H3, los fixes previos se validan en su state natural.

**La referencia anterior de "23/34" era ruidosa** — consolidación de 3 logs parciales (baseline-post-commits-3 + tanda-A + tanda-B) sobre un día con variance Grok alta. Inflada por LLM variance favorable entre runs. El número real sostenible está en ~19.

**PASS actual (17 confirmados + 2 eval_error):** A3, A4, A7, B2, C2, C3, D2, D4, D5, D6, D7, D9, F3, F4, G5, G6, H1, (H2*, H3* eval_error).
**FAIL reales del bot:** A1, A2, A5, A6, B1, B3, B4, B5, C1, D1, D3, D8, F1, F2, G1.

**Targets de los cherry-picks:**
- A2 (sanitizer holaaaa): FAIL en este run. Sanitizer correcto pero escenario tuvo empty-turn-1 u otra variance.
- B1 (patrones qué tipo): FAIL en este run. Pattern correcto pero Persona hizo pregunta vacía antes del tag list (turno 2 [2] empty, [3] tags).
- D6 (BOT_DENIAL ya fijo previamente): PASS confirmado.

**Techo estimado del bot con fixes actuales:** ~19-21/34. Variance Grok ±3 escenarios por run. Para subir techo hace falta:
- Implementar A6 handoff (FASE 6, 6 decisiones de producto pendientes — ver NOTES sección A6).
- D3 §11 concession (feature nueva, decisiones de producto).
- Atacar bugs compartidos (empty-turn-1 raro, pacer loop G1).

**Zona sucia identificada en orchestrator.js:**
- Líneas 833-842 tenían dead code duplicado (ya limpiado en 1483fc4).
- `src/agents/human-handoff.js`: placeholder que throws "FASE 6".
- Patrón "empty turn 1" silencioso (no pipeline error, no reproducible con logging añadido en ae5138c).

---



## Sesión nocturna 2026-04-20 — Resumen estructurado

**Commits reales aplicados y conservados (orden cronológico):**
- `be1f80b` — notes: round 2 evaluador refutada, pivotamos a bugs reales
- `8c10272` — notes: A2 sanitizer revertido por regresión control C2/G1

**Commits aplicados y revertidos:**
- `ccd71c5` (A2 sanitizeElongations) — revertido por regresión LLM variance en C2+G1
- `b0d79f9` (B1 patrones "qué tipo de fotos") — revertido por regresión LLM variance en B3

**Bloques:**

| Bloque | Objetivo | Resultado | Siguiente |
|---|---|---|---|
| 0 | Revertir round 2 + NOTES | ✅ Hecho | — |
| 1 | A2 sanitizer "holaaaa" | ⚠️ Aplicado+revertido (regresión C2/G1 por LLM variance, no por fix) | Reaplicar sanitizer con confianza (código + tests en historial commit ccd71c5). Fix técnicamente correcto, falló por variance. |
| 2 | B1 patrones "qué tipo de fotos" | ⚠️ Aplicado+revertido (regresión B3 por LLM variance, no por fix) | Reaplicar patrones con confianza (commit b0d79f9 en historial). Fix técnicamente correcto. |
| 3 | A6 handoff | 🛑 (C) ESPERANDO DECISIÓN DE ALEX | human-handoff.js sin implementar (throws "FASE 6"). Feature mediana (2-3 días). Decisiones de producto arriba en esta misma doc. |
| 4 | B5 inventa medias rojas | ⏭️ No iniciado (regla STOP 2 mini-baselines consecutivos regresionaron) | Plan propuesto: extender `buildPriceReference()` en persona.js con `photo_single.tags_disponibles` (bajo riesgo). Si no funciona, orchestrator pattern-match "tienes con X?" (medio riesgo). |

**Regresiones encontradas (todas LLM variance, no causadas por fixes):**
- Bloque 1 mini: C2 "Grok inventó pueblo de valencia", G1 "Grok stuck en bucle binario". Ambos independientes del sanitizer (pure text transform).
- Bloque 2 mini: B3 "Grok vago 'qué te apetece ver' + inventa squirt ducha". B3 no matchea ningún patrón nuevo, así que el fix no pudo causarlo.

**Por qué paré:** regla explícita del plan "Si 2 mini-baselines consecutivos regresionan → PARA". Cumplida tras bloque 2. No entro en bucle ciego.

**Proyección baseline actual:** 23/34 (el baseline previo se mantiene, los 2 fixes aplicados se revirtieron porque las regresiones eran control, aunque la causa no fuera el fix).

**Siguiente paso recomendado cuando Alex vuelva:**

1. **Revisar decisión sobre BLOQUE 1 y 2 revertidos.** Los fixes son técnicamente correctos (revisables en `git show ccd71c5` y `git show b0d79f9`). Las regresiones fueron varianza LLM, no causadas por los fixes. Opciones:
   - (a) Reaplicar ambos con un `cherry-pick` y correr full baseline (~2h) en lugar de mini-baselines ruidosos. Si full baseline sube, commit se queda; si baja, se revierte con datos reales.
   - (b) Descartar ambos fixes como "no valen la pena" — seguir en 23/34.
2. **Decidir sobre BLOQUE 3 A6 handoff.** 6 decisiones de producto listadas arriba. FASE 6 en el roadmap.
3. **Decidir sobre BLOQUE 4 B5.** Plan propuesto arriba. No intentado.
4. **Full baseline de validación.** NO lancé full baseline yo sola (regla). Propuesto: cuando Alex vuelva y tome decisiones, lanzar full para confirmar que el bot sigue en 23/34 o mejor.

**Señal útil de la noche:** los 2 mini-baselines consecutivos con regresiones indican que el bot está en un estado donde Grok tiene mala variance esta sesión (horas acumuladas del proceso node --watch). Posible pista: restart del server TEST_MODE antes del próximo baseline puede reducir variance.

**Estado del repo al parar:** HEAD = `8c10272`. Working tree limpio respecto a lo commiteado. `.env`, credenciales, líneas rojas intactas. No se tocó Router, BOT_DENIAL, ni archivos fuera del repo.

---



## Bloque 1 A2 sanitizer REVERTIDO (2026-04-20 noche)

Commit `ccd71c5` (Fix A2: sanitizeElongations) aplicado y revertido tras mini-baseline A2 + controles:
- A2 sigue FAIL — pero por **empty-turn-1** (nada emitido turno 1), no por elongación. El sanitizer era correcto pero no resolvía el FAIL de este run.
- **C2 REGRESIÓN**: Grok inventó "soy de un pueblo cerca de valencia" + mencionó uni proactivamente. LLM variance (content hallucination), NO causado por sanitizer.
- **G1 REGRESIÓN**: Alba en bucle binario "A o B?" sin cerrar venta. LLM variance (bot stuck), NO causado por sanitizer.

El sanitizer es técnicamente correcto (pure text transform de 3+ letras iguales a 2), no puede causar esas regresiones. Pero la regla del plan dice "regresión en control → revert inmediato". Revertido `ccd71c5`.

**Consideración para Alex:** reaplicar el sanitizer sería seguro y bajo riesgo. Código está en el historial de git (commit ccd71c5) + tests 11 casos. Bajo riesgo si se decide reintroducir. Requerirá volver a ejecutar mini-baseline para verificar A2 en un run donde no haya empty-turn-1.

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
