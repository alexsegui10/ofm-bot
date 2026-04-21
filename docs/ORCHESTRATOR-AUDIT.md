# ORCHESTRATOR AUDIT 2026-04-21

Auditoría profunda de `src/orchestrator.js` — 1112 líneas, función `handleMessage` monolítica. Zona crítica del sistema con suciedad acumulada. Formato lista, cada hallazgo con archivo:línea.

---

## 1. Mapa completo de handlers (orden de evaluación)

Función `handleMessage` (L551-1108). Pipeline lineal con 17 secciones enumeradas en comentarios internos (1a-8). Orden estricto de evaluación — el primero que matchea decide la respuesta.

### Bloque 1 — Pre-routing shortcuts (antes de Router LLM)

| # | Sección | Línea | Trigger | Output |
|---|---|---|---|---|
| 1 | Get/create client | 565 | Siempre | `client` row |
| 2 | **Sexting v2 activo** | 572-600 | `activeV2 != null` | `{ fragments, intent: 'sexting_active', sextingTurn }` |
| 3 | **Bot-question short-circuit** | 606-614 | `isBotQuestion(text)` | `{ fragments, intent: 'small_talk' }` |
| 4 | **Security-question short-circuit** (A7) | 620-628 | `isSecurityQuestion(text)` | `{ fragments, intent: 'small_talk' }` |
| 5 | Fetch history | 630 | Siempre | `history` |
| 6 | Save incoming message | 637 | Siempre | (side-effect DB) |
| 7 | **Router LLM** | 643 | Siempre | `{ intent, confidence, fraud_score, reasoning, params }` |
| 8 | Fraud score check | 649 | `fraud_score > 0.3` | `updateFraudScore` (side-effect) |

### Bloque 2 — Intent post-processing

| # | Sección | Línea | Lógica |
|---|---|---|---|
| 9 | Price question → sale intent elevation | 659-673 | Si `intent === 'price_question'` y history tiene categoría, promociona a `sale_intent_X` |
| 10 | Quantity response override | 675 | Si es respuesta tipo cantidad → `resolvedIntent = 'product_selection'` (inferred) |

### Bloque 3 — Intent-specific short-circuits

| # | Sección | Línea | Trigger | Output |
|---|---|---|---|---|
| 11 | **Strong harassment (D5)** | 680-696 | `isStrongHarassment(savedText)` | `{ fragments, intent: 'suspicious', handoffTriggered: true }` |
| 12 | **PayPal rejection** | 698-708 | `/paypal/.test() && !isPaypalEnabled()` | Canned response |
| 13 | **Payment confirmation** | 711-790 | `intent === 'payment_confirmation'` | Bizum verify + posible sexting kickoff |
| 14 | **New client short-circuit** (saludo + catálogo) | 796-825 | `isNewClient && !hasMedia && intent === 'small_talk'` | Greeting + catalog |

### Bloque 4 — Price-question catalog direct

| # | Sección | Línea | Trigger | Output |
|---|---|---|---|---|
| 15 | **Price question sin categoría → catálogo directo** | 827-838 | `intent === 'price_question' && !hasMedia` | Catálogo + markClientCatalogSeen |

### Bloque 5 — V2 flows

| # | Sección | Línea | Trigger | Output |
|---|---|---|---|---|
| 16 | **handleV2Intent (v2 intents)** | 843-847 | `V2_INTENTS.has(intent)` (ask_video_list, choose_video, buy_sexting_template, …) | Delegation to `handleV2Intent` (L388-534) |

### Bloque 6 — Main pipeline (Persona + Sales + Catalog)

| # | Sección | Línea | Trigger | Output |
|---|---|---|---|---|
| 17 | **Pipeline normal** (8 etapas internas) | 852-1108 | No matching shortcut | `{ fragments, intent: resolvedIntent, starsInvoice? }` |

Desglose de la sección 17 (7. Persona, 8. Quality Gate, 9. Save, 10. Sales pipeline, 11. Catalog append/suppress, 12. Final assembly):

- **Build `internalInstruction`** (L858-891) — 11 ramas if/else (ver §6)
- **Persona** (L893-899)
- **Quality Gate** con retries (L904-962)
- **Catálogo append OR category detail OR custom OR sale payment link** (L980-1094)
- **Return ensamblado** (L1104-1108)

---

## 2. Dead code detectado

### 2.1 `videocall_request` duplicado (ya conocido) — **confirmado**
`src/orchestrator.js:841-842` — **no existe en esta versión**. Verificado con grep: la segunda rama fue eliminada en commit 1483fc4. Ya no es dead code. **Actualizar NOTES.md** para marcar este item como resuelto.

Verificación grep:
```
Línea 874: } else if (resolvedIntent === 'videocall_request' || resolvedIntent === 'custom_video_request') {
Línea 876: } else if (resolvedIntent === 'sale_intent_photos') {
```
Solo 1 rama para videocall_request. ✓

### 2.2 `assistantHasShownCatalog` deprecated (ya documentado)
`src/orchestrator.js:98-100`:
```js
export function assistantHasShownCatalog(_history, _lookback = 6) {
  return false;
}
```
Wrapper que siempre devuelve `false`. Comentario L96-97 indica que es "para que tests legacy puedan migrar incrementalmente". Grep sobre `src/` muestra que **no lo usa nada en producción**. Sólo aparece en tests obsoletos que quizá ya no existen. Buscar usos en `orchestrator.test.js` y eliminar si no aparece.

### 2.3 Rama sexting_request dentro de `internalInstruction` — **potencialmente muerta**
`src/orchestrator.js:881`:
```js
} else if (resolvedIntent === 'sexting_request') {
  internalInstruction = newClientPrefix + 'El cliente quiere sexting. …';
```
Pero **el flujo sexting_request se maneja antes** en el bloque V2 (`V2_INTENTS.has(intent)` L388 + handleV2Intent para `buy_sexting_template`), y en payment_confirmation con `startSextingSessionV2`. Una petición `sexting_request` pura (sin duración confirmada) debería ir al handler de v2 si está en `V2_INTENTS`. **Revisar:** ¿`sexting_request` entra alguna vez al pipeline normal (L852) o siempre corta antes? Si siempre corta, esta rama es dead code.

**Acción:** verificar con un escenario de prueba o logging temporal. Si confirmada como muerta, eliminar junto con el L881-882.

### 2.4 `handoff_pending` intent declarado pero no manejado
`src/agents/router.js:6` declara el intent `handoff_pending` en el typedef, pero en `orchestrator.js` **no hay rama que lo maneje**. Router puede devolverlo y caerá al pipeline normal con una `internalInstruction` inadecuada. **Posible bug silente.**

### 2.5 `pre_checkout_query` no se maneja explícitamente
`src/lib/telegram.js:141` lo suscribe en `allowed_updates`, pero grep en `orchestrator.js` no lo referencia. Se maneja en `src/handlers/payments.js` (Stars) — OK pero vale documentar que este handler vive fuera del orchestrator para no confundir.

---

## 3. Duplicación lógica

### 3.1 `setPendingProduct` + `runSales + fragmentMessage` repetido 4 veces
`src/orchestrator.js:429-445, 449-467, 485-502, 508-526`:

El patrón:
```js
if (!isPaymentMethodExplicit(text)) {
  const price = lookupProductPrice(productId);
  if (!price) return null;
  await setPendingProduct(…).catch(log.warn);
  saleFragments = fragmentMessage(`son ${price.amountEur}€ bebe. bizum, crypto o stars?`, config);
  return { fragments, intent };
} else {
  const offer = await createOfferFromProduct({ productId, client, paymentMethod });
  if (!offer) return null;
  await setPendingProduct(…).catch(log.warn);
  saleFragments = fragmentMessage(offer.message, config);
  if (paymentMethod === 'stars') starsInvoice = …;
  return { fragments, intent, …(starsInvoice?…) };
}
```

Se repite 4 veces en el bloque v2 (choose_video, buy_single_photos, choose_pack, …). Debería extraerse a `handleV2ChooseFlow(productId, client, paymentMethod, text)`.

**ROI:** ~80 líneas deduplicables. Refactor seguro si se cubre con tests.

### 3.2 Resolución de intent en 3 sitios distintos
Hay **tres mecanismos** que deciden qué intent ejecutar, todos mutando `resolvedIntent`:

1. L605: **Router LLM** devuelve `intent`.
2. L659-673: **Elevation de `price_question`** a `sale_intent_X` según keyword en history.
3. L675: **Quantity override** (`isQuantityResponse` → `product_selection`).

Además los shortcuts tempranos (bot-question, security-question, sexting-active) **devuelven directo** sin pasar por `resolvedIntent`. Eso crea una inconsistencia: algunos paths nunca llegan a Router, otros lo invocan y luego lo sobrescriben.

**Recomendación:** explicitar la resolución en una función `resolveEffectiveIntent(routerOutput, text, history)` que encapsule las 2 transformaciones y deje `handleMessage` con un `resolvedIntent` inmutable.

### 3.3 `markClientCatalogSeen` llamado en 3 sitios
L819 (new-client short-circuit), L832 (price-question direct), L1001 (category detail). Cada uno con condiciones distintas para determinar "acabo de mandar catálogo → flag". **OK funcional** pero si alguien añade un 4º sitio que emita catálogo y olvida marcar, el cliente vería el catálogo dos veces. **Recomendación:** wrapper `sendCatalogAndMark(client, fragmentFn, tag)` que centralice.

### 3.4 `fragmentMessage(...)` + `saveMessage(assistant)` antes de cada `return` shortcut
Cada short-circuit hace:
```js
await saveMessage(client.id, 'assistant', X, intent);
const cfg = getPacerConfig();
const fragments = fragmentMessage(X, cfg);
log.info(…);
return { fragments, intent };
```

Aparece en L609-613 (bot-question), L623-628 (security), L692-695 (harassment), L703-707 (paypal), y varios más. ~6 copias exactas.

**Recomendación:** helper `buildShortCircuitResponse(client, text, intent, logMeta)` — ~3 líneas por sitio en vez de 5.

### 3.5 Instructions post-media duplicadas con variación trivial
L869-872:
```js
if (activeSexting) {
  internalInstruction = 'el cliente te acaba de mandar una foto o video suyo. reacciona en caliente, algo breve tipo "mmm que rico bebe" o "uy me estás poniendo". NUNCA digas que no puedes ver imágenes ni que eres un bot.';
} else {
  internalInstruction = 'el cliente te acaba de mandar una foto o video suyo. reacciona de forma ligera y pícara, algo tipo "uy que travieso" o "jajaja q cosas me mandas". NUNCA digas que no puedes ver imágenes ni que eres un bot.';
}
```
Mismo 90% del texto, sólo varía el ejemplo. Extraíble a template con placeholder de tono.

---

## 4. Handlers demasiado largos (>50 líneas)

### 4.1 **`payment_confirmation`** handler — **80 líneas** (L711-790)
La rama más grande. Maneja: verify bizum, start sexting session v2, fetch kickoff media, build instructions, ship. Demasiadas responsabilidades en una rama. **Extraer** a `handlePaymentConfirmation(client, context)` en un módulo dedicado.

### 4.2 **`handleV2Intent`** helper — **147 líneas** (L388-534)
Aunque ya está extraído de `handleMessage`, sigue siendo enorme. Contiene 3 sub-ramas (choose_video, choose_pack, buy_single_photos) con lógica casi idéntica (ver §3.1). **Sub-extraer** en 3 handlers dedicados o un dispatcher con registry.

### 4.3 **New client short-circuit** — **30 líneas** (L796-825)
Aceptable en tamaño pero mezcla: greeting selection + personal question detection + Persona call + QG + catalog append. Podría extraerse a `handleNewClientGreeting(client, text)`.

### 4.4 **Catálogo/categoria detail branch** — **60 líneas** (L980-1040)
Lógica de "enviar catálogo completo, o detalle de categoría, o pass-through". Muchas condiciones enlazadas (`appendCatalog`, `CATEGORY_DETAIL_INTENTS`, `suppressByHistory`, `custom_video_request`). Extraíble a `resolveCatalogStrategy(client, resolvedIntent, text)` que devuelva un enum `{FULL, DETAIL, CUSTOM, NONE}` y luego un switch simple.

### 4.5 **Sales pipeline con retries** — **58 líneas** (L904-962)
Quality gate + retries con `buildRetryInstruction`. OK funcional pero el patrón "llama Persona, llama QG, si falla reintenta" aparece 3 veces (primera, retry1, retry2). **Extraíble** a un `retryPersonaUntilQGPasses(persona, qg, maxAttempts, buildRetryInstruction)` genérico.

---

## 5. Inconsistencias en resolución de intents

### 5.1 Router devuelve `intent` pero el código usa `resolvedIntent` cruzándolos
L605: `const { intent, … } = await runRouter(…)`.
L657-673: `let resolvedIntent = intent` + posibles overrides.

A partir de L657 **todas las ramas deben usar `resolvedIntent`, no `intent`**, pero:
- L711: `if (intent === 'payment_confirmation')` — usa el `intent` raw de Router, NO el resolvedIntent. Si Router dijo `payment_confirmation` y luego quantity-override lo cambió a `product_selection`, esta rama sigue firing con `intent === 'payment_confirmation'`. **Posible inconsistencia.**
- L799: `if (isNewClient && !hasMedia && resolvedIntent === 'small_talk')` — usa resolvedIntent correctamente.
- L828: `if (resolvedIntent === 'price_question' && !hasMedia)` — correcto.
- L873-889 (internalInstruction switch) — usa resolvedIntent correctamente.

**Acción:** revisar si `intent` vs `resolvedIntent` en L711 está pensado así (tiene sentido: el override quantity solo aplica si NO es payment_confirmation, ya filtrado por L675) o es bug. Casi seguro intencional, pero documentar explícitamente.

### 5.2 `fraud_score > 0.3` fires silently
L649-657: si el cliente tiene fraud_score alto, actualiza en DB pero **sigue el pipeline normal**. No corta, no pausa, no notifica. La "detección de fraude" aquí es solo telemetría, no acción. **Bug de expectativa** — si Alex cree que hay protección anti-fraude, no la hay.

### 5.3 Router fallback silencioso
Si Router falla (LLM error), `src/agents/router.js:227-230` devuelve `intent: 'small_talk', confidence: 0.5, reasoning: 'llm_error'`. Orchestrator no distingue un `small_talk` genuino de uno-por-fallback. **Recomendación:** loggear warn/alert cuando reasoning === 'llm_error' para no perder la señal.

### 5.4 `confidence < 0.7 → small_talk` forzado
`src/agents/router.js:241-244` sobrescribe cualquier intent con confidence baja a `small_talk`. Mismo problema que 5.3 — orchestrator no sabe si estamos procesando un `small_talk` real o uno forzado por baja confianza.

---

## 6. Acoplamiento con Persona (internalInstructions inyectadas)

11 puntos donde `handleMessage` inyecta instrucciones internas a Persona. Listado completo con su contenido resumido:

| # | Línea | Trigger | Instrucción resumida |
|---|---|---|---|
| 1 | 867 | `isRoleplay` | "Juego de rol. Asume personaje. Físico NO cambia. NUNCA digas IA. PROHIBIDO ADE/Complutense/Moncloa." |
| 2 | 870 | `hasMedia && activeSexting` | "Cliente mandó foto. Reacciona caliente: 'mmm que rico bebe'." |
| 3 | 872 | `hasMedia && !activeSexting` | "Cliente mandó foto. Reacciona ligera/pícara." |
| 4 | 875 | `videocall_request` | "Cotiza 4€/min mín 5min o pasa a 'dame 5 min' según si dio momento." |
| 5 | 877 | `sale_intent_photos` | "SOLO fotos. Sales mandará detalles." |
| 6 | 879 | `sale_intent_videos` | "SOLO videos. Sales mandará detalles." |
| 7 | 881 | `sexting_request` | "Una frase entusiasmo. No preguntes qué." (ver §2.3 — posible dead) |
| 8 | 883 | `product_selection` | "Cliente eligió producto. Confirma. Pregunta método pago." |
| 9 | 885 | `payment_method_selection` | "Cliente eligió método. Confirma breve. Sales mandará instrucciones." |
| 10 | 887 | `payment_confirmation` | "Cliente dice que pagó. Responde con emoción." |
| 11 | 889 | `suspicious` | "Cliente sospechoso. Educada pero cortante." |

### Redundancias / contradicciones detectadas
- **#5 y #6** dicen "NUNCA menciones otras categorías"; **#4** también. Pero el `maxPriorityInstruction` de persona.js ya dice "NUNCA inventes contenido". Redundancia tolerable, no bug.
- **#11 "suspicious"** es triggered por Router cuando detecta sospecha, pero el short-circuit harassment (L682) ya maneja casos fuertes. ¿Qué es `intent=suspicious` residual? Revisar si Router emite `suspicious` por algo que el harassment short-circuit no captura.
- **#4 videocall_request:** la instrucción describe DOS comportamientos condicionales ("si NO dio momento / si YA dio momento"). Esto delega la condición al LLM que puede interpretar distinto en cada run. En C4 (Sistema 1) esta instruction debe reescribirse para SOLO describir el caso "pausa silenciosa post-request", según SPEC-HANDOFF-V1.
- **#10 payment_confirmation:** solo se ejecuta si el short-circuit L711 NO corta. Pero L711 `if (intent === 'payment_confirmation')` intercepta TODOS los payment_confirmation, así que ramificar internalInstruction para ese caso (L887) parece **dead code** (ver §2 parcialmente).

### Acoplamiento Persona ↔ pipeline
Las 11 instrucciones son strings hardcoded inline. Si alguien quiere cambiar el tono de "reacciona a foto", tiene que editar orchestrator.js. **Extraer** a `src/config/persona-instructions.js` con un mapa `{ triggerKey: instructionTemplate }`.

---

## 7. Estado mutable en orchestrator

### 7.1 `_processedMessageIds` en `src/handlers/business.js:25`
Set global in-memory con 1000 entries máx. **No persiste entre reinicios.** Si el bot reinicia mientras Telegram hace retries, un mensaje puede procesarse dos veces.

### 7.2 `_readQueues` en `src/handlers/business.js:47`
Map global de timers pendientes para read-receipts. Se limpia con `clearReadQueues()` en tests, pero en producción un reinicio deja timers huérfanos. **Bajo impacto** (solo afecta a 1 read receipt perdido), pero no idempotente.

### 7.3 `_bot` singleton en `src/lib/telegram.js:24`
Lazy-init del Bot grammY. Si tests olvidan resetearlo, pueden compartir estado entre archivos. **Aceptable** para evitar conexiones múltiples, pero hay que documentar.

### 7.4 `_pool` singleton en `src/lib/db.js:11`
Idem. Conexión postgres compartida. OK.

### 7.5 `_cached` products en `src/config/products.js:25`
Cache en memoria del JSON productos. `_resetProductsCache()` expuesto para tests. **Riesgo:** si el JSON cambia en runtime (edición manual en VPS), cache queda obsoleta hasta reinicio. No es bug en dev, pero puede sorprender en hot-fix.

### 7.6 Pacer queues (`src/agents/message-pacer.js`)
El pacer mantiene timers en memoria por chat. Reinicio = mensajes pendientes del pacer se pierden. En producción bajo carga eso puede equivaler a "1 mensaje del cliente sin respuesta". **Documentar** la trade-off de in-memory vs persistencia.

### Ninguno compartido entre TURNOS del mismo cliente
Bueno: no hay estado mutable que pase de turno N a turno N+1 dentro de orchestrator. Todo se deriva de DB o se recomputa. Esto es positivo para testabilidad.

---

## 8. Propuesta de refactor ordenada por ROI

### Top 5 cambios

| # | Cambio | Por qué | Est. horas | Riesgo regresión |
|---|---|---|---|---|
| 1 | **Extraer `handleV2ChooseFlow`** (consolida las 4 repeticiones §3.1) | -80 líneas, 1 punto de verdad para el patrón "si no eligió método → pregúntalo, si sí → crea offer". Facilita C4 (videocall usa patrón similar) | 2h | Bajo (tests v2 existen) |
| 2 | **Extraer `buildShortCircuitResponse(client, text, intent, meta)`** (§3.4) | -30 líneas, patrón común de 6 short-circuits. Cualquier short-circuit nuevo (C4/C5 van a añadir) se escribe de 1 línea | 1.5h | Muy bajo |
| 3 | **Mover internalInstructions a `src/config/persona-instructions.js`** (§6) | Separación producto/infra. Cambiar una instrucción deja de tocar orchestrator. | 1h | Nulo si se hace solo copy+import |
| 4 | **Extraer `resolveEffectiveIntent(routerOutput, text, history)`** (§5.1) | Explicita las 3 transformaciones de intent en una función pura testeable. Elimina confusión `intent` vs `resolvedIntent`. | 2h | Medio (requiere tests específicos) |
| 5 | **Extraer `handlePaymentConfirmation(client, text)`** (§4.1) | Rama más grande (80L). Saca sexting-kickoff + bizum-verify a un módulo aparte. Reduce `handleMessage` un 7% solo. | 3h | Medio (flujo crítico de pagos) |

### ROI acumulado
- **Ganancia de líneas:** ~250 líneas menos en orchestrator (22% del archivo).
- **Ganancia de testeabilidad:** 5 funciones puras nuevas, unit-testeables directamente.
- **Ganancia de velocidad para C4/C5:** los sistemas nuevos aprovechan los helpers en lugar de duplicar patrón.

### Orden recomendado de aplicación
1 → 2 → 3 → 4 → 5. Los dos primeros son casi mecánicos (bajo riesgo). El 3 es puramente relocalización. El 4 y 5 requieren tests nuevos.

### NO incluir en este refactor
- Reescribir `handleMessage` completo a arquitectura middleware/pipeline. Riesgo alto, beneficio incierto. Mantener lineal pero más limpio.
- Eliminar los short-circuits tempranos (bot-question, security-question). Son determinísticos y bajo riesgo; mejor tenerlos visibles que escondidos en un middleware chain.

---

## Resumen ejecutivo

- **1112 líneas, 1 función god-object, 17 secciones numeradas.**
- Dead code real detectado: 2 items (§2.2, §2.3, §2.4) + 1 ya confirmado como eliminado (videocall_request duplicado).
- Duplicación lógica: 5 patrones, los 2 primeros con ROI alto de refactor.
- Handlers >50 líneas: 5 (payment_confirmation, handleV2Intent, new-client, catalog-branch, sales-pipeline).
- Inconsistencias intent resolution: 4 puntos (mezcla `intent`/`resolvedIntent`, fraud silent, router fallback, confidence override).
- 11 internalInstructions inline en orchestrator — acoplamiento producto/infra fuerte.
- Estado mutable compartido: solo global (processedIds, readQueues, pacer timers) — no cross-turn.

**Acción mínima recomendada antes de C4:**
- Refactor #2 (`buildShortCircuitResponse`) para que C4 (Sistema 1) añada su short-circuit de videocall_request con el helper nuevo, no copy-paste del bot-question.
- Refactor #3 (persona-instructions) para poder revisar todas las instrucciones en un solo archivo.

**Acción diferida:**
- Refactor #1, #4, #5 en un sprint propio antes de producción. No bloquean SPEC-HANDOFF-V1 pero dejan deuda latente.
