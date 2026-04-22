# OFM Bot — CLAUDE.md

## Descripción del proyecto
Bot de Telegram con Business Connection que gestiona fans de modelos OnlyFans/Fansly.
Mantiene conversaciones de roleplaying/sexting con IA, vende contenido (fotos/videos),
gestiona sexting con timer, y escala a humano vía WhatsApp para videollamadas y personalizados.

## Stack técnico
- **Runtime:** Node.js 20+ con JavaScript (ESM)
- **Servidor:** Express para webhooks
- **Base de datos:** PostgreSQL en Docker
- **Mensajería:** Telegram Bot API + Business Connection
- **LLMs:**
  - Anthropic SDK — `claude-sonnet-4-6` para Router / Profile / Quality Gate / Sales / Curator / Handoff (temperatura 0.3)
  - OpenRouter (Persona) — primario `xai/grok-3-beta` (temp 0.75 catálogo / 0.9 sexting), fallback `cognitivecomputations/dolphin-mistral-24b-venice-edition`
  - Modelos de Persona intercambiables vía `.env` (`MODEL_PERSONA`, `MODEL_PERSONA_FALLBACK`). El Router hardcodea `claude-sonnet-4-6` en `src/agents/router.js:220` — `MODEL_ROUTER` no se lee (pendiente: o cablearlo en env.js o eliminar la referencia).
- **Pagos:** NowPayments (crypto), PayPal, Telegram Stars (XTR)
- **WhatsApp:** Twilio

## Reglas absolutas

1. **Nunca hardcodees claves API ni precios** — todo va a `.env` o `config/`. Si ves un valor sensible en código, muévelo inmediatamente.
2. **Nunca commitees archivos `.env`** — solo `.env.example` va al repo. Asegúrate de que `.gitignore` los cubra.
3. **Nunca toques `/root/openclaw/` ni nada fuera de este repo** — cualquier acceso externo requiere confirmación explícita.
4. **Mismo código corre en local y VPS** — las diferencias de entorno se gestionan SOLO vía variables `.env`. No hay if/else de entorno en el código de negocio.
5. **Antes de marcar una fase como completa: tests verdes 3 veces seguidas** — un test que pasa una vez puede ser flaky. Confirma estabilidad.
6. **Si encuentras una decisión de arquitectura no trivial: PARA y pregunta** — no asumas. Las decisiones de arquitectura impactan todo el sistema.

## Comandos útiles del proyecto

```bash
# Iniciar el servidor en desarrollo
npm run dev

# Correr tests unitarios
npm test

# Correr tests de integración
npm run test:integration

# Lint
npm run lint

# Migraciones de BBDD
npm run db:migrate

# Seed de datos de prueba
npm run db:seed

# Docker (Postgres local)
docker compose up -d postgres

# Ver logs del bot
docker compose logs -f bot
```

## Convenciones de código

- **Async/await siempre** — nunca callbacks ni `.then()` encadenados salvo casos justificados
- **Named exports** — no default exports (facilita tree-shaking y búsquedas)
- **Imports al principio** del archivo, agrupados: externos → internos → tipos
- **Archivos de agente** en `src/agents/<nombre>.js`, uno por agente
- **Errores:** siempre lanzar `Error` con mensaje descriptivo; capturarlos en el orquestador
- **Logs:** usar el logger del proyecto (no `console.log` en producción)
- **Variables de entorno:** acceder siempre via `src/config/env.js`, nunca `process.env` directo
- **Tests:** colocados junto al módulo en `<modulo>.test.js`
- **Migraciones:** prefijo `NNN_descripcion.sql` en `db/migrations/`

## Estructura de agentes runtime (se implementa en Prompt 2+)

```
Router → identifica intent del mensaje
Profile Manager → carga/actualiza perfil del cliente
Persona → genera respuesta en personaje (OpenRouter)
Quality Gate → verifica la respuesta antes de enviar
Sales → gestiona upsell y catálogo
Payment Verifier → procesa y verifica pagos
Content Curator → entrega contenido tras pago
Human Handoff → escala a operador humano vía WhatsApp
```
 ## Mantenimiento del CLAUDE.md (auto-actualización)

Este archivo es la memoria permanente del proyecto. Tiene que mantenerse vivo para que cada sesión nueva arranque con el contexto real, no con el de hace semanas.

### Cuándo actualizar CLAUDE.md

Actualizas este archivo al final de una sesión SI (y solo si) se cumple alguna de estas condiciones:

1. **Decisión arquitectónica nueva.** Ej: "ports-and-adapters adoptado para notificaciones", "audios se guardan por telegram_file_id, no filesystem". Son decisiones que cambian cómo se construye código futuro.
2. **Regla aprendida que debe aplicar en sesiones futuras.** Ej: "no correr round 3 de calibración del evaluador, techo confirmado", "no consolidar baselines parciales como referencia".
3. **Ubicación de documento importante creado en esa sesión.** Ej: "la especificación activa vive en docs/SPEC-HANDOFF-V1.md".
4. **Cambio en el stack, en comandos frecuentes, o en el entorno.** Ej: nueva variable .env, nuevo comando de desarrollo.
5. **Zona sucia o bug conocido que afecta sesiones futuras.** Ej: "orchestrator.js tiene dead code documentado en docs/ORCHESTRATOR-AUDIT.md".

### Cuándo NO actualizar CLAUDE.md

- Cambios triviales de código (bugfixes puntuales, refactors menores).
- Decisiones efímeras que solo aplican a la sesión actual.
- Progresos temporales (baselines, métricas). Esos van a NOTES.md, no aquí.
- Información que ya está en otro doc: pon pointer, no duplicado.

### Cómo actualizar

- Añade entradas al final de la sección correspondiente, con fecha entre paréntesis.
- Si una entrada antigua queda obsoleta, táchala o márcala como obsoleta, no la borres (contexto histórico).
- Si la sección ya tiene 10+ entradas similares, consolida en un resumen y archiva las antiguas en docs/CLAUDE-HISTORY.md.
- Siempre que añadas una entrada, haz commit separado con mensaje "docs(claude.md): [qué se añadió]".

### Límites duros

- CLAUDE.md no supera 400 líneas. Si se pasa, consolidar.
- No añadir información sensible (credenciales, IDs personales, datos de clientes).
- No reescribir secciones existentes sin confirmar con Alex primero.