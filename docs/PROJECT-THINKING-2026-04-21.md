# Project Thinking — 2026-04-21

Reflexión estratégica tras 3 días de iteración intensiva en el bot. Este documento captura mi visión después de haber estado dentro del código. 100% opinión justificada, 0% resumen de handoff.

---

## 1. Estado actual real del proyecto

### Partes sólidas
- **Pipeline de pagos (Bizum + NowPayments + Stars).** 323 líneas de `payment-verifier.js` con tests integración reales contra Postgres. Bizum tiene auto-approve con reglas de negocio claras (≥2 compras previas ∧ ≤50€). Crypto vía webhook IPN firmado. Stars vía pre_checkout_query. Las 3 vías funcionan end-to-end en tests. Si algo **tiene** que funcionar en producción es esto, y está razonablemente bien.
- **Esquema DB.** 17 migraciones idempotentes, índices completos en TODAS las columnas filtradas, `runMigrations()` auto-aplicado en arranque. Es el ámbito mejor llevado del proyecto. Migración 016 (chat_pause_state) que añadí sigue la convención sin excepciones.
- **Tests unitarios por módulo crítico.** 762 tests verdes. Patrón consistente: cada service/agent tiene su `.test.js` hermano. Grado de mocking bien equilibrado — tests de `sales.test.js` mockean I/O y testean la lógica pura, tests de `transactions.test.js` son integración real.
- **Separación Router/Persona/Sales/Quality Gate/Pacer.** Cada agente tiene responsabilidad acotada. Cuando toqué el Router pattern match para B1, no tuve que entender la Persona. Buen acoplamiento bajo.
- **C1-C3 del SPEC-HANDOFF-V1 (chat-pause, admin commands, notify-owner).** Recién añadidos, limpios, tests robustos (54 tests nuevos). Sienta las bases para C4-C6.

### Partes frágiles aunque pasen tests
- **`src/orchestrator.js` 1112 líneas.** Pasa tests porque los tests mockean las dependencias. En producción, una sola función maneja 17 caminos distintos y 11 shortcuts. Un bug en cualquier rama es difícil de encontrar porque hay mucha superficie de "otras ramas" que interpretar antes. Los tests cubren los paths principales pero no el combinatorio completo. **Ver ORCHESTRATOR-AUDIT.md.**
- **Fallbacks silenciosos en Router y Persona.** Router cae a `small_talk` con `confidence=0.5, reasoning='llm_error'` si Anthropic falla. Persona cae a modelo fallback si Grok falla. Ambos loggean pero no avisan al operador. En producción, un fallback sostenido puede pasar desapercibido durante horas. Silencio ≠ salud.
- **`_processedMessageIds` in-memory.** Dedup de mensajes Telegram vive en un Set global. Reinicio del server = dedup reset = posibles duplicados durante primeros minutos. Bajo impacto, pero hay que saberlo.
- **Pacer con timers en memoria.** Si el server reinicia en medio de una ráfaga paceada, los fragmentos pendientes se pierden. Cliente ve respuesta incompleta. Tests no cubren eso porque los tests no reinician servers.
- **TEST_MODE mezclado con lógica de negocio.** `if (env.TEST_MODE)` en `telegram.js` (3 sitios), `notify-owner.js`. Cada bug de "no llega el mensaje" tiene una pregunta adicional: ¿es TEST_MODE activado por error? Comportamiento no determinista a nivel de configuración.

### Deuda técnica invisible (no evidente en tests)
- **Evaluador LLM como gate de iteración.** Hemos ajustado criterio.md + evaluator prompt para que el evaluador Sonnet-4.6 aceptara nuestros fixes. El evaluador tiene techo (~19-21/34). A partir de ahí, no es el bot el que mejora, es el evaluador el que aplica interpretaciones subjetivas no cubiertas por las reglas literales. **Implicación:** cuando el bot hable con clientes reales, no tendrá evaluador — tendrá humanos. Los humanos aplican criterios distintos. El techo real del bot en producción puede ser distinto del techo en baseline.
- **Persona Grok 3-beta** es el modelo activo. Los modelos NSFW rotan cada 3-6 meses en OpenRouter. Si Grok cae mañana, hay fallback a Dolphin-Mistral-Venice — pero el estilo no es idéntico y los escenarios que ajustamos con Grok puede que regresionen.
- **Spec legal/privacidad del bot operando con clientes reales no documentada.** El bot lee mensajes privados de clientes, guarda historial, notifica datos a Alex. No he visto en el repo política de retención, política de GDPR, consentimiento del cliente. Si el negocio opera en UE, esto es bloqueante legal antes de producción.
- **Sin monitoring/alerting.** Logs estructurados (pino) pero no van a ningún lado externo. Si el server se cae, Alex se entera porque un cliente escribe en WhatsApp "no me responde la chica". Necesitamos al menos un healthcheck alerting a Telegram personal del admin.

---

## 2. Gap entre sistema actual y producción con Alba real

Lista honesta, sin filtrar.

### Falta entero
- **FASE 5 Content Curator** (`src/agents/content-curator.js` es placeholder throw). **Bloquea flujo real post-pago** — cuando un cliente paga por Bizum confirmado, el bot debería ENVIAR las fotos/video. Ahora mismo el código tiene `// TODO FASE 5` en 3 sitios y no entrega nada. El cliente paga y no recibe.
- **Sistemas 1, 3, 4 del SPEC-HANDOFF-V1.** Acordados con el owner pero no implementados. C4 (videocall), C5 (audios IA seria), C6 (bonus ventas) pendientes. Para producción real son imprescindibles porque sin Sistema 1 no se puede ofrecer videollamada (el spec estaba claro: videollamada requiere handoff humano).
- **Implementación de `human-handoff.js`** — throws not-implemented, como arquitectura FASE 6. Conectado con sistema 1.

### Medio hecho
- **Sistema 2 pausa/reactivación manual (C1+C2).** Services + commands existen pero NO están integrados en el pipeline. Si Alex pausa un chat con `/pausar 42`, el próximo mensaje del cliente 42 **se sigue procesando por el bot** porque `handleMessage` no chequea `getChatStatus` en ninguna rama. Hay que añadir un short-circuit al inicio de `handleMessage` que lea el chat status y si no es `active`, **no responder**.
- **Persona con precios canónicos inyectados** (`buildPriceReference`). Ya está, pero falta inyectar también la **lista de tags de fotos** (tags_disponibles) para que Persona pueda RECHAZAR cosas no en catálogo ("medias rojas" no existen — el bot aún las inventa). Comentado en NOTES.md como B5 pendiente.

### Hecho pero no probado end-to-end
- **Twilio WhatsApp para notify-owner.** Funciona en tests mockeados. Nunca se ha ejecutado contra Twilio real. La primera vez que Alba active una videollamada en producción va a ser la primera vez que `sendWhatsApp` se invoque real. Alto riesgo de "credenciales mal configuradas" o "formato `to: whatsapp:+…` sin prefijo correcto".
- **Pagos con dinero real.** Los tests de Bizum usan montos sintéticos. NowPayments tiene sandbox. Producción = dinero real de cliente real = no probado.
- **Sexting Conductor v2** con pool de media real. Los tests usan media sintética. Primera sesión con un cliente pagando 15-45€ es la primera sesión real.
- **Stars invoices** funcionan en tests. No confirmado que el flujo pre_checkout_query → confirmación → entrega funcione con un Telegram Stars real.

### Depende de decisiones de producto pendientes
- **§11 D3 concesión táctica** — feature no implementada. Decisión Alex pendiente sobre qué bonus (decidida en SPEC: solo foto extra) y cuándo (pendiente).
- **Comando `/videollamadafin` vs detección automática** (ver C4-PREP-PAYLOAD-VIDEOCALL.md). Decisión Alex pendiente sobre Camino A, B, o híbrido.
- **Pool de audios de verificación.** Alba tiene que grabar 5 audios primero. Hasta entonces el bot usa fallback texto.

---

## 3. Roadmap realista a producción

Estimaciones realistas (no optimistas), incluyen tests y buffer para fricciones. Asumo 6h productivas/día (no 8h — hay fricción, dudas, debugging no previsto).

### Sprint 0 — prerequisitos bloqueantes (1-2 días)
| Item | Horas | Comentario |
|---|---|---|
| Integrar `getChatStatus` en `handleMessage` (short-circuit si no `active`) | 2h | Sistema 2 se aprovecha |
| Actualizar `.env.example` con vars nuevas | 0.5h | Trivial, audit lo detectó |
| Legal/privacidad: política retención + aviso cliente | 4-8h | **NO es ingeniería, requiere asesoría legal** |
| Monitoring básico: healthcheck + ping a Telegram admin si cae | 3h | Sin esto vas a ciegas |

**Bloqueo real: legal.** Ingeniería son ~5h.

### Sprint 1 — Sistemas SPEC-HANDOFF-V1 C4+C5+C6 (3-4 días)
| Item | Horas | Comentario |
|---|---|---|
| C4 Sistema 1 (videocall handoff) | 6-8h | Incluye decisión Camino A/B, trigger pausa, notify, timers, excusas, cierre post-llamada |
| C5 Sistema 3 (audios IA seria) | 4-6h | Más simple si la tabla ya existe (sí). Falta Alba grabe audios. |
| C6 Sistema 4 (bonus ventas) | 3-4h | Detección 4-5 turnos + Sales prompt update |

**Total: 13-18h.** Realistas 3-4 días laborales.

### Sprint 2 — FASE 5 Content Curator (2-3 días)
| Item | Horas | Comentario |
|---|---|---|
| Content Curator implementation | 6-8h | Clave: entregar media tras pago verificado |
| Integración con payment-verifier + bizum-timer callbacks | 2-3h | Los 3 TODO FASE 5 del código |
| Tests end-to-end pago → entrega | 3h | Obligatorio |

**Total: 11-14h, 2-3 días.**

### Sprint 3 — Refactor orchestrator (opcional antes de producción)
Ver ORCHESTRATOR-AUDIT.md top 5 refactors. Total 9.5h = 2 días.

**Opinión:** saltar Sprint 3 y entrar a producción con orchestrator sucio. El refactor reduce deuda pero no bloquea funcionalidad. Mejor ganar feedback real del primer cliente real.

### Sprint 4 — Validación producción (1-2 días)
| Item | Horas | Comentario |
|---|---|---|
| Deploy VPS con TEST_MODE=false | 2h | Asumiendo VPS ya configurado |
| Webhook Telegram apuntando al dominio real | 1h | |
| Primer cliente real con Alba observando (shadow mode) | 4h | Alba lee todas las respuestas antes de que el bot las emita, fase piloto |
| Ajustes de los primeros 10 clientes reales | 6-10h | Invariablemente saldrán bugs no cubiertos |

**Total: 13-17h, 2-3 días.**

### Agregado total
- Sprint 0: 5h ingeniería + legal (bloqueante externo)
- Sprint 1: 13-18h
- Sprint 2: 11-14h
- Sprint 4 (si saltamos Sprint 3): 13-17h

**42-54 horas de ingeniería** desde hoy hasta producción con primer cliente real. Esto son **7-9 días de trabajo efectivo**. Calendario real dependiendo de disponibilidad: **2-3 semanas calendario** realistas.

---

## 4. Riesgos que me preocuparía como Alex

### Alta probabilidad / Alta severidad
- **Cliente paga y no recibe contenido** (FASE 5 no implementada). Probabilidad = 100% con código actual. Severidad = ruina reputacional + devoluciones. **Bloquea producción absoluta.**
- **Twilio WhatsApp format error** en primer notify-owner real. Probabilidad ~40% (mi estimación basada en que nunca se ha probado contra Twilio real). Severidad = Alex no recibe alertas críticas, cliente se queda pausado sin atender. **Test con Twilio real antes de producción es mandatorio.**

### Alta probabilidad / Media severidad
- **Grok 3-beta deja OpenRouter** o sube precio. Probabilidad alta a 6 meses. Severidad media — hay fallback a Dolphin pero estilo cambia. Recomendación: tener un segundo modelo "primary alterno" testeado para poder cambiar en 30 min.
- **Pool de audios de verificación vacío en producción.** Probabilidad 100% si Alba no graba antes de lanzar. Severidad media — hay fallback texto. El cliente que llegue sospechando en serio recibirá "un momento bebe te mando audio ahora mismo" y luego silencio. Mal.
- **Evaluator dashboard no existe.** Probabilidad 100%. Severidad media — no hay forma objetiva de saber si el bot está respondiendo bien a clientes reales más allá de que no queje. El sistema actual de scenarios es solo para desarrollo.

### Media probabilidad / Alta severidad
- **Sexting pool de media mal etiquetado.** Si un tag está mal en products.json, el conductor v2 puede enviar una foto equivocada en el momento más inadecuado. Probabilidad media (depende del cuidado al seedear). Severidad alta (cliente se ríe, cancela, pide reembolso, difunde).
- **Fraud detection trivial.** `fraud_score > 0.3` sólo actualiza DB, no bloquea. Un cliente con historial sospechoso puede seguir comprando. Probabilidad media — si el bot se hace popular en grupos "gratis" de Telegram, aumenta. Severidad alta — chargebacks de crypto no se pueden recuperar.
- **Empty-turn-1 en cliente nuevo.** 5% de manifestación en tests. Si son 100 clientes nuevos/mes × 5% = 5 clientes/mes que no reciben respuesta al saludo. Severidad alta para esos 5.

### Media probabilidad / Media severidad
- **Reinicio del server pierde timers del pacer y dedup.** Probabilidad media — redeploys frecuentes. Severidad baja-media — algunos mensajes llegan incompletos.
- **Comando `/pausar` se escribe mal.** Alex tecla `/pausar 99` pensando en cliente 99 pero es otro. Cliente correcto sigue sin pausar. No hay confirmación interactiva. Recomendación: `/pausar 99` responde con "Cliente X (id=99, tg=12345, nombre='Pepe') pausado. ¿Correcto? Usa /reactivar si no".

### Baja probabilidad / Alta severidad
- **Bug en pricing.js** que cobra de menos. Actualmente calculatePhotoPrice está corregida (4=18€) pero no hay tests directos del módulo. Probabilidad baja. Severidad alta (pérdida de revenue por cliente pagado).
- **Data leak: el bot envía una foto a cliente equivocado.** Puede ocurrir si content-dispatcher tiene un bug de routing. Probabilidad baja. Severidad muy alta (violación privacidad).

---

## 5. Preguntas que debería responder Alex o Alba antes de avanzar

### Producto
1. **C4 videocall: Camino A (detectar mensaje manual), Camino B (/videollamadafin), o híbrido?** Mi recomendación es híbrido. Pendiente tu OK explícito.
2. **Cuándo graba Alba los 5 audios de verificación?** Sin audios, Sistema 3 cae a texto siempre. Bloquea la utilidad real del Sistema.
3. **SPEC-HANDOFF-V1 §1 punto 1** dice "bot responde normal con precio y pregunta cuándo le va bien" y luego §1 punto 2 "cliente confirma día y hora → pausa". **¿Qué cuenta como "confirmar día y hora"?** ¿Necesitamos Router nuevo para clasificar eso? ¿Pattern regex con "mañana|hoy|esta noche|a las X"? Mi prep C4 propone cascada regex→Router→bot pregunta.
4. **Sistema 4 bonus: 1 foto extra del tipo que el cliente mira.** ¿Qué pasa si el cliente estaba mirando un VIDEO? ¿Se le da una foto? ¿O una foto del tag correspondiente? Spec es ambiguo.
5. **Política retención datos.** ¿Conversaciones se borran tras X tiempo? ¿Datos del cliente (nombre, gustos) se borran si el cliente desaparece 6 meses?
6. **Si Alba deja el proyecto, qué pasa con los clientes actuales?** ¿Se migran a otra modelo? ¿Se borra todo? Afecta al diseño de `clients` + `conversations` (¿hay que tener model_id por si hay multi-modelo?).

### Técnico
7. **Actualizar @anthropic-ai/sdk 0.52 → 0.90?** Sprint propio con baseline.
8. **Shadow mode antes de full-auto?** Primeros N clientes reales, Alba lee las respuestas antes de que lleguen al cliente. Requiere integración con Telegram de Alba para pausa interactiva. Horas de implementación extra (~4h). Decisión tuya si merece la pena.
9. **Monitoring externo.** ¿UptimeRobot, Sentry, Grafana, o algo casero? Sin monitoring producción = bomba de tiempo.

---

## 6. Opinión honesta sobre la dirección del proyecto

### Lo que va bien
- **Arquitectura ports-and-adapters emergente** en C1-C3 es el camino correcto. `chat-pause.js` servicios, `telegramAdminCommands.js` adapter, `notify-owner.js` con TwilioWhatsAppAdapter/NoopAdapter. Cuando venga el panel web en FASE 7, es un adapter HTTP más sin tocar servicios.
- **Criterio de tests es sano.** Cada commit añade sus tests. 761 tests no es poco. El mocking es razonable, no excesivo.
- **SPEC-HANDOFF-V1 bien escrito.** Decisiones cerradas, fases, reglas generales, orden de implementación recomendado. Es el documento de producto mejor que he visto en este repo.
- **Disciplina de commits + reverts con datos.** Cuando un fix regresionó se revirtió con evidencia, se documentó en NOTES.md. Hay rastro de aprendizaje.

### Lo que me preocupa conceptualmente
- **`handleMessage` como god-function.** El patrón "lineal con 17 secciones y muchos `if`" funciona hoy porque lo conoces bien, pero a medida que SPEC-HANDOFF-V1 añada Sistemas 1/3/4, cada uno necesitará su short-circuit al inicio de `handleMessage`. En 3 sistemas más, la función tendrá 30+ secciones. **Recomendación estructural:** convertir el pipeline a una cadena de middleware explícita (array de handlers con `next()`), cada uno con nombre, ubicación y prioridad. Mejor que 17 `if/else` anidados. No urgente pero inevitable.
- **Acoplamiento orchestrator ↔ Persona via `internalInstruction` strings inline.** Cada vez que queremos que Alba responda distinto a un intent, editamos orchestrator.js con un string largo. Producto-sensible pero no testeable por separado. Extraer las 11 instrucciones a `src/config/persona-instructions.js` es un commit trivial con alto ROI.
- **Modelado de estados del chat.** Actualmente: `clients.has_seen_catalog`, `clients.pending_product_id`, `clients.num_compras`, `clients.total_gastado`, `clients.profile` (JSONB), `chat_pause_state` (tabla nueva), `sexting_sessions` (tabla), `sexting_sessions_state` (otra tabla). **Son 7+ fuentes de verdad para el estado de un cliente.** Me preocupa que en 3 meses no sepamos qué leer primero. Una abstracción `ClientContext` que agregue todo eso por cliente sería útil.
- **Evaluator-driven development.** Hemos ajustado el bot para pasar tests del evaluador. El evaluador es una aproximación. Producción son humanos con expectativas distintas. Mi consejo: **no iteres más sobre baseline de 19/34**; ve a producción con shadow mode y usa feedback real. El techo del evaluador ya se alcanzó.
- **Los tests unitarios no cubren el pipeline completo.** Tests de `orchestrator.test.js` usan 12 casos puntuales. Hay 17 secciones × N subramas = probablemente 50+ caminos válidos. Cobertura real del pipeline es baja aunque tests individuales sean muchos. Vale la pena añadir tests de integración E2E de al menos los 10 escenarios más comunes (A1, A3, A5, D1 sencillos) con mocks de LLM devolviendo outputs deterministas.

### Lo que cambiaría si empezara de cero
- **No** mezclaría TEST_MODE con la lógica de negocio. Habría un `MessageBackend` con implementaciones `TelegramBusiness`, `TestRecording`, `ConsoleEcho`. TEST_MODE = inyectar TestRecording en startup, no `if (env.TEST_MODE)` en cada send.
- **Sí** tendría Router con output tipado (TypeScript o al menos JSDoc estricto) porque ahora cualquier handler puede confundirse con la forma del response.
- **Sí** separaría "comandos admin" en chat propio del bot desde el principio, no como afterthought. Lo hecho en C2 es lo correcto pero llegó tarde — antes no había forma de gestionar el bot.
- **Sí** tendría monitoring desde el día 1 aunque fuera un `curl /health` cada 60s desde un cron externo.

### Lo que NO cambiaría
- El esquema de agentes (Router, Persona, Sales, QG, Pacer). La división de responsabilidades tiene sentido aunque el orchestrator los pegue con cinta.
- El uso de Postgres + migraciones numeradas. Sencillo, funciona, auditable.
- La decisión de TEST_MODE como flag global. Polvoriento pero permitió desarrollar 3 días sin gastar un céntimo en Telegram/Twilio/OpenRouter más de lo necesario.
- La estrategia de Bizum con reglas de auto-approve. Pragmática y realista para el mercado español.

### Dirección estratégica recomendada (si me preguntas)
1. **Parar el baseline driven development.** Ya no compensa. 19/34 es el techo razonable con evaluator LLM-as-judge.
2. **Invertir las próximas 2-3 semanas en completar SPEC-HANDOFF-V1 + FASE 5 Content Curator + monitoring.**
3. **Shadow mode antes de auto mode.** Primeros 10 clientes reales con Alba revisando. Recolectar bugs que ningún baseline va a detectar.
4. **Refactor orchestrator post-producción.** Con feedback real, el refactor va en la dirección correcta, no en la que nosotros creemos.
5. **Plan de contingencia para Grok.** Probar Dolphin-Mistral-Venice como primary durante 1 semana. Ver qué regresiona. Tener un fallback real, no nominal.

Tengo confianza en que el proyecto llega a producción. Tengo dudas sobre si llega en las 2-3 semanas que me gustaría, porque hay trabajo legal externo que no controlamos y porque C4-C6 tiene decisiones de producto pendientes que solo tú puedes cerrar.
