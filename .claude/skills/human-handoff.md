# Skill: human-handoff

## Cuándo se usa
Para testear los 4 escenarios del agente Human Handoff — el mecanismo que escala
conversaciones al operador humano (modelo real) via WhatsApp cuando el cliente
pide videollamada o contenido personalizado.

## Los 4 escenarios a testear

### Escenario 1 — Videollamada, operador entra a tiempo
1. Cliente envía mensaje solicitando videollamada
2. Bot responde con precio y formulario de disponibilidad
3. Handoff Agent envía WhatsApp a `OWNER_WHATSAPP_TO` con alerta
4. Operador responde "confirmo" en WhatsApp dentro de 5 minutos
5. **Resultado esperado:** Bot notifica al cliente con enlace/instrucciones de videollamada

### Escenario 2 — Videollamada, operador NO entra (timeout 5 min)
1. Cliente envía mensaje solicitando videollamada
2. Bot responde con precio y formulario
3. Handoff Agent envía WhatsApp con alerta
4. Operador NO responde en 5 minutos
5. **Resultado esperado:** Bot envía mensaje de disculpa al cliente, ofrece reagendar, registra el timeout en BBDD

### Escenario 3 — Personalizado, operador entra a tiempo
1. Cliente pide contenido personalizado
2. Bot extrae detalles (descripción, preferencias) via conversación
3. Handoff Agent envía WhatsApp con brief del encargo
4. Operador confirma y envía el contenido dentro del plazo
5. **Resultado esperado:** Bot entrega el contenido al cliente, registra entrega

### Escenario 4 — Personalizado, operador NO entra
1. Cliente pide contenido personalizado
2. Bot extrae todos los detalles del encargo
3. Handoff Agent envía WhatsApp con brief completo
4. Operador NO responde en el tiempo configurado
5. **Resultado esperado:** Bot mantiene al cliente informado, reintenta WhatsApp, registra el estado en BBDD para seguimiento manual

## Cómo simular cada escenario

```bash
# Simular mensaje de videollamada
curl -X POST http://localhost:4000/test/simulate-message \
  -H "Content-Type: application/json" \
  -d '{"userId": 999, "text": "quiero hacer una videollamada contigo"}'

# Simular respuesta del operador (WhatsApp webhook)
curl -X POST http://localhost:4000/webhooks/twilio \
  -d "From=whatsapp:+34600000000&To=whatsapp:$TWILIO_WHATSAPP_FROM&Body=confirmo"

# Simular timeout manualmente (ajusta el reloj de la transacción)
psql $DATABASE_URL -c "UPDATE handoff_requests SET created_at = NOW() - INTERVAL '6 minutes' WHERE user_id = 999;"
```

## Verificación de cada escenario
- Revisa el estado en `handoff_requests` en BBDD
- Revisa los mensajes enviados al cliente en `message_log`
- Revisa los WhatsApp enviados en los logs de Twilio
