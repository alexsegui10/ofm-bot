# Skill: telegram-flow

## Cuándo se usa
Para añadir, modificar o depurar un intent del Router de Telegram.
También cuando se trabaje con Business Connection (eventos especiales).

## Particularidades de Telegram Business Connection
- Los mensajes llegan como `business_message`, no como `message`
- `business_connection_id` identifica qué Business Connection gestiona el chat
- El `from` del mensaje es el **cliente** (usuario que escribe al bot), no el bot
- El bot actúa como si fuera el modelo — el cliente no sabe que hay un bot
- Los eventos de estado de Business Connection llegan como `business_connection`

## Workflow para añadir/modificar un intent

### Paso 1 — Define el intent en `src/agents/router.js`
```js
// Añadir el intent con al menos 5 ejemplos de mensajes reales
const INTENTS = {
  NUEVO_INTENT: {
    description: "...",
    examples: [
      "mensaje de ejemplo 1",
      // ...
    ]
  }
}
```

### Paso 2 — Añade el caso al orquestador principal (`src/index.js` o `src/orchestrator.js`)
```js
case 'NUEVO_INTENT':
  return await nuevoAgente.handle(context);
```

### Paso 3 — Si activa un agente nuevo, créalo en `src/agents/nuevo-agente.js`
- Exporta `{ handle }` (named export)
- Recibe `context` con `{ message, profile, businessConnectionId }`

### Paso 4 — Test de verdaderos positivos
Crea 5 mensajes que SÍ deben clasificarse como `NUEVO_INTENT`:
```bash
npm test -- --testNamePattern="router.*NUEVO_INTENT"
```
Verifica que los 5 se clasifican correctamente.

### Paso 5 — Test de falsos positivos
Crea 5 mensajes que NO son de ese intent y verifica que no se clasifican erróneamente.

### Paso 6 — Test de regresión del Router completo
```bash
npm test -- --testNamePattern="router"
```
Todos los intents existentes deben seguir clasificando correctamente.
