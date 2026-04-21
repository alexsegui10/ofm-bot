# C4 Preparación — Payload de videollamada en Telegram Business

Investigación técnica previa a implementar **Sistema 1 — Human Handoff para videollamadas** (SPEC-HANDOFF-V1 §1). Cero código productivo en este documento.

---

## 1. Estructura actual del webhook de Telegram Business en el proyecto

### Handler principal
- `src/handlers/business.js` — registra listeners grammY via `registerBusinessHandlers(bot)`.

### Eventos ya suscritos
En `src/lib/telegram.js:136-142` (`setWebhook`):
```js
allowed_updates: [
  'message',                    // chats privados bot↔Alex (admin)
  'business_connection',        // Alba conecta/desconecta su bot
  'business_message',           // mensaje entrante de cliente (vía Business)
  'deleted_business_messages',  // cliente borra mensaje
  'pre_checkout_query',         // Telegram Stars flujo
],
```

### Eventos manejados activamente (`src/handlers/business.js:106-234`)
- `business_connection` (L107-116): solo log, sin reacción funcional.
- `business_message` (L119-224): **core del pipeline**. parseBusinessMessage extrae {businessConnectionId, chatId, messageId, fromId, from, text, hasMedia}. Luego scheduleReadReceipt, queueMessage (pacer), handleMessage (orchestrator).
- `deleted_business_messages` (L227-234): solo log.

### Campos que `parseBusinessMessage` NO extrae y podrían ser relevantes
- `message.video_chat_started` — objeto vacío si se inició una videollamada grupal.
- `message.video_chat_ended` — objeto con `{duration}` si terminó una videollamada grupal.
- `message.video_chat_scheduled` — objeto con `{start_date}` si se programó.
- `message.video_chat_participants_invited` — objeto con `{users[]}`.

Actualmente `hasMedia` solo chequea `photo | video | document | audio | voice | sticker`. Los campos de video_chat no están cubiertos.

---

## 2. Documentación oficial Telegram Bot API — eventos de videollamada

Tras consultar [core.telegram.org/bots/api](https://core.telegram.org/bots/api) y [bots/api-changelog](https://core.telegram.org/bots/api-changelog):

### Campos disponibles en el Message object
| Campo | Payload | Descripción Telegram |
|---|---|---|
| `video_chat_scheduled` | `{start_date: Integer}` | Service message: video chat scheduled |
| `video_chat_started` | `{}` (empty) | Service message: video chat started |
| `video_chat_ended` | `{duration: Integer}` | Service message: video chat ended |
| `video_chat_participants_invited` | `{users: User[]}` | Service message: new participants invited to a video chat |

### Histórico: "voice chat" → "video chat"
En Bot API 6.0, Telegram renombró `voice_chat_*` → `video_chat_*`. El **concepto "video chat" en Bot API se refiere exclusivamente a las voice/video chats grupales** (la feature de voice chat en canales/grupos), NO a las videollamadas 1-a-1 entre usuarios individuales.

---

## 3. Pregunta clave — ¿Evento limpio para 1-a-1?

**Respuesta: NO.** Las videollamadas 1-a-1 entre Alba (cuenta Business) y un cliente **NO se exponen al bot vía Bot API**.

### Evidencia
1. Bot API changelog completo no tiene NINGUNA entrada sobre delivery de updates para llamadas 1-a-1.
2. Todas las referencias a `video_chat_*` en la doc apuntan al feature de "voice chat" grupal.
3. Telegram Business API (layer MTProto) sí expone algunos eventos de llamadas a clientes personales (via `updateCall`), pero eso es la capa **client-side**, no bot-side. El bot, aunque esté conectado vía Business, opera sobre updates filtrados por `allowed_updates` y ninguno incluye llamadas personales.

### Confirmación de scope
Telegram Business conecta un bot al chat del usuario, pero:
- El bot **sí** ve todos los **mensajes** de ese chat (incluidos mensajes del propio Alba cuando escribe manualmente).
- El bot **NO** ve eventos de llamadas personales. Las llamadas en Telegram (no los voice-chats grupales) usan un protocolo aparte P2P con señalización MTProto que no se replica al bot.

---

## 4. Fallback propuesto — Comando manual `/videollamadafin <client_id>`

Como el evento no existe, el **Sistema 1 §3.1 del spec** (*"La videollamada se hace por la misma cuenta de Telegram Business. Cuando acaba, Telegram envía un evento del sistema al chat"*) es **inviable con la infraestructura actual de Bot API**.

### Flujo revisado propuesto

1. Cliente pide videollamada → bot pausa (`paused_awaiting_videocall`) + `notifyOwner('videocall_requested', payload)` por WhatsApp.
2. Alex responde al WhatsApp confirmando disponibilidad, o lo gestiona manualmente con el cliente.
3. Alex llama al cliente vía Telegram Business desde su app Telegram (app móvil o desktop). **Durante esta llamada, el chat sigue pausado**.
4. **Cuando la llamada termina**, Alex tiene DOS caminos para cerrar el flujo:
   - **Camino A (recomendado):** Alex escribe manualmente cualquier mensaje al cliente por la misma cuenta de Business (ej. "ha estado genial bebe"). El bot detecta ese mensaje (llega al webhook como `business_message` con `from.id === OWNER_TELEGRAM_USER_ID`), y eso reinicia el timer de 3 min post-llamada. Si Alex no escribe más en 3 min, el bot se reactiva automáticamente.
   - **Camino B (fallback explícito):** Alex ejecuta en el chat privado bot↔admin el comando `/videollamadafin <client_id>`. El bot marca la llamada como terminada y arranca el flujo post-call.

### Diseño del comando `/videollamadafin`

```
/videollamadafin <client_id>  [duracion_min_opcional]
  → Marca el chat como `videocall_just_ended`.
  → Inicia timer de 3 minutos.
  → Si Alex escribe algún mensaje al cliente en esos 3 min, se cancela el timer.
  → Si pasan 3 min sin intervención, bot envía mensaje de cierre estilo Alba.
  → Luego reactiva el chat (status='active', last_videocall_at = NOW()).
```

Se añadiría en el adapter `src/adapters/telegramAdminCommands.js` con los otros comandos admin. Servicio correspondiente en `src/services/chat-pause.js` ya cubre la parte "marcar/reactivar" — sólo haría falta un helper específico.

### Detección Camino A (automática, sin comando)

Es deseable porque reduce fricción: Alex no tiene que acordarse del comando. Implementación posible:

- El handler de `business_message` compara `parsed.fromId` contra `env.OWNER_TELEGRAM_USER_ID`. Si coincide Y el chat está en status `paused_awaiting_videocall`, el bot asume que Alba/Alex acaba de escribir manualmente post-llamada → entra en estado `videocall_just_ended` + timer 3 min.
- Problema: esto requiere que Alex escriba AL MENOS un mensaje post-llamada. Si Alex cuelga y no escribe nada, el chat queda pausado indefinidamente hasta `/reactivar`.

### Recomendación híbrida

Implementar **Camino A automático + Camino B manual** simultáneamente:
- Automático cubre el 80% de los casos (Alex siempre escribe despedida).
- Manual cubre el 20% (Alex cuelga sin despedirse, o usa otro canal).

**PENDIENTE decisión Alex:** ¿OK con híbrido? Implementar solo Camino A (más elegante, menos comandos) o solo Camino B (más robusto pero fricciona)?

---

## 5. Experimento para confirmar (opcional, si Alex quiere certeza absoluta)

La doc oficial no clarifica explícitamente si `video_chat_ended` **también** cubre 1-a-1 o solo grupales. Para estar 100% seguros antes de confiar en el fallback:

### Protocolo de experimento

1. En entorno de pruebas (bot de dev conectado a cuenta de prueba de Alex):
   - Añadir `business_message` handler con `log.info` que dumpee el `update` completo cuando detecte cualquier campo `video_chat_*` o `call`.
2. Hacer una videollamada de 10-20 segundos desde la cuenta de prueba hacia otro usuario (usando Telegram personal).
3. Revisar logs — si aparece un evento con `video_chat_ended` o similar, la hipótesis "no fire" está refutada y ajustamos el plan.
4. Si no aparece nada, confirmado: fallback necesario.

### Alternativa pragmática
Implementar el fallback Camino A+B directamente sin hacer el experimento, porque:
- El peor caso si Telegram SÍ emitiera un evento silenciosamente es "Alex podía haberse ahorrado el comando", no "el sistema falla".
- Si en producción aparece un evento `video_chat_ended`, se añade su handler junto al comando manual — los dos coexisten.

**PENDIENTE decisión Alex:** ¿hacer el experimento antes de C4, o saltar directamente a implementar fallback?

---

## 6. Impacto sobre el spec original

### Secciones del SPEC-HANDOFF-V1 §1 que requieren revisión
- **§1 "Detección de videollamada terminada" (punto 1):** *"Telegram envía un evento del sistema al chat"* → **incorrecto según la investigación**. Reescribir ese punto con el fallback Camino A+B.
- **§1 punto 3 ("Durante esos 3 min, si Alex escribe cualquier mensaje manual…"):** este mecanismo sí es viable (detectando `from.id === OWNER_TELEGRAM_USER_ID` en `business_message`). No requiere cambio.
- **§1 punto 4 ("Si pasan los 3 min sin intervención manual → bot se reactiva solo"):** viable si el timer empieza cuando Alex escribe (Camino A) o cuando ejecuta `/videollamadafin` (Camino B).

### Cambios necesarios antes de C4
1. **Actualizar SPEC-HANDOFF-V1.md §1.3.1** reemplazando la asunción del evento de sistema por el híbrido Camino A+B.
2. **Añadir** `.env.example` la variable `OWNER_TELEGRAM_USER_ID` (ya usada en runtime pero documentada) — también aplicable a C2 ya implementado.
3. **Plan de C4 actualizado:**
   - Implementar trigger de pausa cuando cliente pide videollamada (Router o pattern match).
   - Implementar detección automática fin-de-llamada vía `business_message` con `from.id === OWNER_TELEGRAM_USER_ID` en chats pausados awaiting_videocall.
   - Implementar comando `/videollamadafin` como fallback explícito.
   - Ambos reinician el timer de 3 min + trigger de mensaje de cierre estilo Alba.

---

## Conclusión ejecutiva

- **Telegram Bot API NO emite evento para videollamadas 1-a-1 terminadas.** `video_chat_ended` es solo para voice-chats grupales.
- **Fallback viable y no complejo:** híbrido Camino A (detección automática de mensaje manual de Alex) + Camino B (`/videollamadafin` manual).
- Requiere **revisar el spec §1** antes de C4 y preguntar a Alex si prefiere A-solo, B-solo, o A+B.
- Experimento real es opcional — se puede saltar si Alex acepta el fallback por bajo riesgo.

**Sources:**
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Bot API changelog](https://core.telegram.org/bots/api-changelog)
- [Telegram Business — grammY](https://grammy.dev/advanced/business)
- [Connected business bots](https://core.telegram.org/api/bots/connected-business-bots)
- [Telegram Business API](https://core.telegram.org/api/business)
