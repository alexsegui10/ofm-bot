# C5 Preparación — Envío de audios de verificación

Investigación técnica y diseño previo a implementar **Sistema 3 — Respuesta cuando cliente pregunta en serio si es una IA** (SPEC-HANDOFF-V1 §3). Cero código productivo.

---

## 1. Telegram Bot API para envío de audios

Tres métodos candidatos:

### `sendVoice` — nota de voz (voice message)
- **Formato estricto:** archivo .ogg encoded con OPUS, `mime_type: audio/ogg`.
- Se renderiza en la UI de Telegram como **nota de voz** (el bloque con waveform y botón play, como cuando un humano manda un audio con el micrófono).
- Parámetros: `chat_id`, `voice` (file_id | InputFile), `duration?`, `caption?`, `business_connection_id?`.
- **Soporta `file_id` reusable.**

### `sendAudio` — archivo musical
- Acepta MP3, M4A, OGG. Se renderiza como **canción** con metadata (título, artista, duración, miniatura).
- Parámetros: `chat_id`, `audio`, `performer?`, `title?`, `thumbnail?`, `caption?`.
- No es lo que queremos — visualmente parece un archivo mp3 descargable, no un mensaje de voz.

### `sendDocument` — adjunto genérico
- Cualquier formato. Se renderiza como **archivo adjunto** (icono + nombre + tamaño, sin player inline).
- Descartado por completo — rompe la ilusión de "Alba te manda audio".

### Recomendación: **`sendVoice`**

Razones:
1. **UX coherente con la premisa del Sistema 3.** El cliente sospecha "eres IA". Si Alba le manda una NOTA DE VOZ (con waveform, reproducible inline, formato indistinguible de mensajes de voz humanos reales), el efecto tranquilizador es máximo.
2. **Si mandamos sendAudio**, el cliente ve "archivo.mp3" con metadata — parece un recurso pregenerado, refuerza la sospecha de bot.
3. El spec SPEC-HANDOFF-V1 §3.2 dice literalmente *"el bot envía un **audio pregrabado** de Alba del pool"* — pregrabado ≠ archivo multimedia. Pregrabado = "le mando una nota de voz que ya tengo".

**Conclusión:** usar `sendVoice`. Formato OGG/OPUS.

---

## 2. Formato de archivo

### Requisitos técnicos Telegram `sendVoice`
- **Contenedor:** OGG
- **Codec:** OPUS
- **MIME:** audio/ogg
- **Tamaño máximo recomendado:** ≤1 MB para comportamiento óptimo (Telegram renderiza como voice note). Archivos >1 MB y ≤20 MB los trata como documents en algunos clients.
- **Duración:** sin límite duro documentado para voz notes, pero por UX: **5-30 segundos es el rango natural** para una "nota improvisada de Alba". Audios más largos se sienten guión leído.

### Parámetros recomendados para los audios de Alba
- Duración objetivo: 8-15 segundos por audio.
- Bitrate: OPUS a 32-48 kbps es suficiente para voz humana, mantiene tamaño <200 KB para 15s.
- Canal: mono (stereo no aporta para voz).
- Sample rate: 48 kHz (default OPUS) o 16 kHz si se quiere máxima compresión sin pérdida perceptible en voz.

### Cómo grabarlos en la práctica (para Alba)
- **Opción simple:** Alba graba la nota de voz **directamente desde su Telegram**, la escucha, y se la envía a sí misma o a Alex. Ese audio ya viene en OGG/OPUS, listo para re-enviar.
- **Opción producción:** Audacity u otro DAW → exportar OGG (Opus).
- **Verificación previa:** antes de poblar la tabla, Alex puede subir un audio al bot vía un comando admin tipo `/uploadverif` (ver §3) que responde con el file_id.

### Contenido sugerido (lo ideal sería co-definirlo con Alba)
- "bebe tranqui, soy alba de verdad, mira" + breve risa o suspiro.
- "mira mira mira, que soy yo, hablándote desde casa, tranqui".
- Evitar frases que pudieran usarse fuera de contexto si el cliente hace un clip (nada comprometedor, nada con nombres reales).

**PENDIENTE decisión Alex/Alba:** qué grabará Alba. Sugiero 5 scripts de 10-15s para rotación + anti-repetición.

---

## 3. Storage del pool — `telegram_file_id` sobre filesystem

### Opciones analizadas

| Opción | Pros | Contras |
|---|---|---|
| **Filesystem local** (`/uploads/verification_audios/`) | Simple, control total | Ocupa disco VPS, hay que subir archivos al deploy, cada send re-upload a Telegram |
| **Bucket S3** | Escalable, backup automático | Overhead infra, coste, latencia extra |
| **Telegram `file_id` reutilizable** | Zero I/O extra, zero coste storage, caching nativo Telegram | Hay que subir 1 vez para obtener el file_id, no es portable entre bots distintos |

### Recomendación firme: **`telegram_file_id`**

Del [Bot API docs](https://core.telegram.org/bots/api#inputfile):
> "If the file is already stored somewhere on the Telegram servers, you don't need to reupload it: each file object has a field file_id which can be passed to any method as a String."

Flujo:
1. Alex/Alba tiene el archivo OGG en su móvil o disco.
2. Alex ejecuta un comando admin (ver §3.4) que sube el archivo al bot vía Telegram personal.
3. El bot responde con el `file_id` que Telegram asignó al subirlo.
4. Guardamos el `file_id` en la tabla `verification_audios.file_path`.
5. A partir de ahí, `sendVoice(chat_id, file_id)` reutiliza el archivo sin resubir — instantáneo, sin I/O de disco del VPS.

### Modificación necesaria al schema

Actualmente `src/services/verification-audios.js` y migración 017 tienen el campo `file_path` (text). **Semánticamente debe ser `telegram_file_id`.** Dos opciones:

- **Opción simple:** renombrar columna `file_path` → `telegram_file_id` en migración 018 (+ actualizar código). Limpio pero requiere migración.
- **Opción pragmática:** dejar el nombre `file_path` pero documentar en JSDoc que almacena un `file_id` de Telegram. Ahorra una migración. Peor estética.

**Recomendación:** renombrar en C5 (coherente con el dominio). Migración 018_rename_file_path_to_telegram_file_id.sql trivial con `ALTER TABLE ... RENAME COLUMN`.

### Flujo de seed (cómo Alex sube los audios la primera vez)

**Propuesta: comando admin `/uploadverif`**
1. Alex envía al bot (chat privado) el audio adjunto + caption `/uploadverif [transcript opcional]`.
2. El handler del message event (en `src/adapters/telegramAdminCommands.js`) detecta:
   - `ctx.from.id === ADMIN_TELEGRAM_USER_ID`
   - Mensaje tiene `voice` adjunto Y `caption.startsWith('/uploadverif')`
3. Extrae `file_id` del `voice.file_id`.
4. INSERT a `verification_audios (telegram_file_id, transcript, context_tag)`.
5. Bot responde: "✅ audio añadido id=42, pool ahora tiene N audios".

**Alternativa:** script `scripts/seed-verification-audios.js` que lea local y suba uno a uno — más complejo (requires subir manualmente al admin chat para obtener file_id, luego escribir script). `/uploadverif` es más directo.

**PENDIENTE decisión Alex:** OK con `/uploadverif`? Alternativa: panel web FASE 7 lo cubre, entonces C5 solo implementa el sendVoice consumer sin flujo de ingesta.

---

## 4. Tracking por cliente — tabla `client_audio_history`

### Problema
`getRandomVerificationAudio({ excludedIds })` ya soporta exclusión via parámetro. Pero el caller (Sistema 3) necesita **saber qué audios ha recibido cada cliente históricamente** para pasar `excludedIds`. Sin esa persistencia, cada ejecución vería "pool entero" y podría repetir.

### Schema propuesto

```sql
-- Migración 019_client_audio_history.sql
CREATE TABLE IF NOT EXISTS client_audio_history (
  id          SERIAL PRIMARY KEY,
  client_id   INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  audio_id    INTEGER NOT NULL REFERENCES verification_audios(id) ON DELETE CASCADE,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  context_tag TEXT NOT NULL DEFAULT 'verification'
);

CREATE INDEX IF NOT EXISTS idx_client_audio_history_client
  ON client_audio_history(client_id, context_tag);

CREATE UNIQUE INDEX IF NOT EXISTS uq_client_audio_unique
  ON client_audio_history(client_id, audio_id);
```

- `sent_at`: para auditoría/analytics.
- `context_tag`: permite separar histories si en el futuro hay `verification` vs otros contextos.
- UNIQUE `(client_id, audio_id)`: un cliente no puede recibir el mismo audio dos veces, por diseño.

### Integración con servicio existente

Añadir 2 funciones a `src/services/verification-audios.js`:

```js
// Lista audio_ids ya enviados a este cliente para context_tag
export async function getClientAudioHistory(clientId, contextTag = 'verification') {
  const { rows } = await query(
    `SELECT audio_id FROM client_audio_history WHERE client_id = $1 AND context_tag = $2`,
    [clientId, contextTag]
  );
  return rows.map(r => r.audio_id);
}

// Registra que el cliente recibió el audio (llamar tras sendVoice exitoso)
export async function recordAudioSent(clientId, audioId, contextTag = 'verification') {
  await query(
    `INSERT INTO client_audio_history (client_id, audio_id, context_tag)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [clientId, audioId, contextTag]
  );
}
```

El caller (Sistema 3) haría:
```js
const excludedIds = await getClientAudioHistory(clientId);
const audio = await getRandomVerificationAudio({ excludedIds });
if (audio === null) { /* pool agotado, ver §6 */ }
else {
  await sendVoice(..., audio.telegram_file_id, ...);
  await recordAudioSent(clientId, audio.id);
}
```

---

## 5. Flujo completo Sistema 3 end-to-end

```
  ┌─────────────────────────────────────────────────────────────────┐
  │ Cliente envía mensaje "en serio eres una IA??" (o similar)      │
  └──────────────────────┬──────────────────────────────────────────┘
                         ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ Orchestrator detecta: isSeriousIaQuestion(text, history)        │
  │   - Pattern match "en serio|no me estafes|dime la verdad..."    │
  │   - O counter >= 2 preguntas tipo-IA en misma sesión            │
  │   - O tras BOT_DENIAL, cliente insiste                          │
  └──────────────────────┬──────────────────────────────────────────┘
                         ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ pauseChatBot(clientId, 'verification_serious',                  │
  │   { status: 'paused_awaiting_human', expectedResumeBy: +5min }) │
  └──────────────────────┬──────────────────────────────────────────┘
                         ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ notifyOwner('ia_verification_serious', {                        │
  │   clientId, clientName, literalMessage                          │
  │ })                                                              │
  │ → Alex recibe WhatsApp                                          │
  └──────────────────────┬──────────────────────────────────────────┘
                         ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │ setTimeout 5 min                                                │
  └──────────────────────┬──────────────────────────────────────────┘
                         ▼
           ┌─────────────┴─────────────┐
           ▼                           ▼
    ┌─────────────┐            ┌─────────────────┐
    │ Alex responde│            │ Timeout 5 min    │
    │ en WhatsApp │            │ sin respuesta    │
    │ o /reactivar│            └─────────┬────────┘
    │ manual      │                      ▼
    └──────┬──────┘       ┌──────────────────────────────────────┐
           │              │ await getClientAudioHistory(clientId) │
           ▼              │ → excludedIds                         │
    ┌──────────────┐      └──────────────┬───────────────────────┘
    │ Chat pausado │                     ▼
    │ hasta que Alex│      ┌──────────────────────────────────────┐
    │ reactive     │      │ audio = await                         │
    └──────────────┘      │   getRandomVerificationAudio({        │
                          │     excludedIds                        │
                          │   })                                   │
                          └──────────────┬───────────────────────┘
                                         ▼
                      ┌──────────────────┴──────────────────┐
                      ▼                                      ▼
            ┌─────────────────┐                    ┌───────────────────┐
            │ audio !== null  │                    │ audio === null    │
            │ → sendVoice     │                    │ (pool agotado)    │
            │   + recordAudio │                    │ → fallback texto  │
            │ Sent            │                    │   de 3 variantes  │
            └────────┬────────┘                    └─────────┬─────────┘
                     ▼                                       ▼
         ┌───────────────────────────────────────────────────┐
         │ resumeChatBot(clientId, 'auto_after_verif_sent') │
         │ status → 'active'                                 │
         └───────────────────────────────────────────────────┘
```

### Timings
- Detección: síncrona, <50ms.
- Pausa + notifyOwner: ~500ms (DB + Twilio API).
- Timer 5 min: setTimeout en memoria (ver §6 caso borde: reinicio server).
- Selección audio + sendVoice: ~1-2s (Telegram API).
- Total desde pregunta cliente hasta que recibe audio: ~5 min (spec).

---

## 6. Casos borde

### 6.1 Todos los audios ya se enviaron a este cliente (pool agotado por cliente)
`getRandomVerificationAudio({ excludedIds: [1,2,3,4,5] })` devuelve `null` cuando ya los recibió todos.

**Propuesta de manejo:**
- **Opción A:** Fallback a texto (mismo que cuando el pool está entero vacío). El cliente ya escuchó todos los audios; el hecho de que insista es preocupante y la situación requiere Alex sí o sí. Texto: *"bebe esto es raro, déjame que hable yo contigo en un momento"*. **NO reactivar chat automáticamente** — se queda pausado `paused_awaiting_human` hasta que Alex reactive manualmente.
- **Opción B:** Permitir repetir el audio menos reciente (reset excludedIds). Riesgo: cliente ve que es el mismo → refuerza sospecha.

**Recomendación: Opción A.** Un cliente que recibió los 5 audios y sigue sospechando es un caso genuino para Alex, no para más automatización.

### 6.2 Cliente sigue sin creer tras el audio y vuelve a preguntar
Siguiente turno: cliente dice "ya pero y cómo sé que no es una IA que te grabó la voz".

**Propuesta:** segundo disparo del short-circuit serious-question → se detecta otra vez → pausa + notifyOwner de nuevo → timer 5 min → audio DIFERENTE (thanks to excludedIds). Si todos se agotan, cae en §6.1.

**Decisión técnica:** el detector `isSeriousIaQuestion` no debe tener cooldown — cada manifestación de pregunta seria merece su notify.

### 6.3 `file_id` expira o se borra del lado de Telegram
Aunque Telegram caché file_ids, técnicamente pueden invalidarse (caso raro, normalmente cuando el bot original que subió el archivo se borra, o si Telegram purga por inactividad extrema — no documentado oficialmente).

**Propuesta:** handler catch alrededor de `sendVoice(..., file_id, ...)`:
- Si error = "Bad Request: wrong file_id" o "file not found":
  1. Marcar la fila `verification_audios.id = X` como inválida (añadir columna `invalidated_at TIMESTAMPTZ` en la migración).
  2. Loggear ERROR y notificar a Alex vía `notifyOwner('verification_audio_invalid', { audioId })`.
  3. Re-intentar con otro audio del pool (sin el invalidado) una vez.
  4. Si sigue fallando, cae al fallback texto.

**PENDIENTE decisión Alex:** añadir campo `invalidated_at` ahora (preventivo) o esperar a que ocurra el problema?

### 6.4 Cliente recibe el audio justo cuando Alex se pone a contestar manualmente
Race condition: timer de 5 min vence justo cuando Alex está escribiendo.

**Propuesta:** antes de enviar el audio, re-chequear `getChatStatus(clientId)`. Si ya no es `paused_awaiting_human` (porque Alex ya reactivó o Alex está escribiendo — aunque "estar escribiendo" no es detectable), **no enviar**. El timer fire se convierte en no-op.

Implementación:
```js
// dentro del callback del setTimeout:
const status = await getChatStatus(clientId);
if (status !== 'paused_awaiting_human') {
  log.info({ clientId, status }, 'verification timer fired but chat no longer awaiting — skipping audio');
  return;
}
// proceder con audio
```

Esto NO resuelve la race condition completa — Alex puede empezar a escribir después del chequeo. Pero minimiza la ventana. El resto se cubre con la detección de mensaje manual de Alex (`business_message` con `from.id === OWNER_TELEGRAM_USER_ID`) que debería reactivar el chat inmediatamente.

### 6.5 Reinicio del server durante el timer de 5 min
setTimeout en memoria = se pierde si reinicia. Cliente queda pausado `paused_awaiting_human` indefinidamente.

**Propuesta (fuera de alcance C5 estricto):** al arrancar el server, escanear `chat_pause_state WHERE resumed_at IS NULL AND expected_resume_by < NOW() + buffer` y re-disparar los timers pendientes. Fuera del scope estricto de C5 pero vale la pena mencionar.

**PENDIENTE decisión Alex:** implementar recovery al arrancar (~1h extra) o asumir reinicio raro (Alex reactivará manualmente)?

---

## 7. Decisiones pendientes de Alex antes de C5

Lista clara para que Alex responda antes de arrancar C5:

1. **¿Alba graba los 5 audios antes o después de C5?** Si antes, el sistema funciona completo en primer deploy. Si después, arranca con fallback texto. Mi recomendación: grabarlos antes para validar el happy path.
2. **¿OK con renombrar `verification_audios.file_path` → `telegram_file_id` en una migración 018?** Sí/No.
3. **¿OK con comando admin `/uploadverif` para ingesta?** Alternativas: script seed o esperar panel web.
4. **¿Añadir campo `invalidated_at` preventivo para caso 6.3?** Sí/No.
5. **¿Recovery de timers en arranque server (caso 6.5)?** Sí (+1h implementación) / No (aceptar riesgo).
6. **Contenido exacto de los 5 audios.** ¿Scripts cerrados o le dejas a Alba improvisar?
7. **Fallback texto 3 variantes** (spec §3): confirmar literales exactos antes de hardcode. Las del spec están OK para empezar.

---

## Conclusión ejecutiva

- **sendVoice** sobre sendAudio/sendDocument. OGG/OPUS, max 1MB, 8-15s duración típica.
- **Storage: Telegram file_id reusable**, no filesystem. Simplifica infra, zero I/O por send.
- **Tabla nueva `client_audio_history`** para persistir qué audio recibió cada cliente. Integración trivial con `getRandomVerificationAudio({ excludedIds })` ya en C3.
- **Flujo end-to-end de Sistema 3 está diseñado** con 5 casos borde cubiertos.
- **7 decisiones de Alex pendientes** antes de implementar. Ninguna bloqueante — hay defaults sensatos.
- **Implementación estimada C5:** 4-6 horas (spec del plan original), confirmado.

**Sources:**
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [sendVoice reference](https://telegram-bot-sdk.readme.io/reference/sendvoice)
- [InputFile — file_id reuse](https://core.telegram.org/bots/api#inputfile)
