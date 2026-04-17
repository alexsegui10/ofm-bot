# Registro de mejoras — auto-iterate

Log de sesiones del loop `scripts/auto-iterate.js`.

Cada sesión abre un bloque con timestamp y deja trazabilidad de: baseline, cada
iteración (escenario que falló → fix → passed/failed/reverted), y resumen final.

---
## [2026-04-17T08:48:23.964Z] BASELINE

- Escenarios pasados: **0/1**
- Fallos: A1

### Detalle de fallos

#### A1 — Cliente saluda simple
Violaciones:
- B. No respondió a lo que preguntó el cliente — Faltó enviar el catálogo completo automático después del saludo
- I. Flujo no avanza — Cliente saluda y debe recibir catálogo automático para poder comprar, pero solo recibió saludo sin opciones

Sugerencias:
- Modificar el código para que tras GREETINGS_NEW_CLIENT siempre se envíe automáticamente el catálogo completo en un segundo mensaje
- Verificar que el flujo de cliente nuevo ejecute: mensaje 1 = saludo fijo aleatorio, mensaje 2 = catálogo pricing.json completo
- Revisar la lógica de detección de intent=small_talk para que no bloquee el envío automático de catálogo en primer contacto

Respuestas de Alba:
    CLIENTE: hola
      ↳ hola bebe, te enseño lo mío 😈

---
## [2026-04-17T08:51:11.404Z] BASELINE

- Escenarios pasados: **0/1**
- Fallos: A1

### Detalle de fallos

#### A1 — Cliente saluda simple
Violaciones:
- B - No respondió a lo que preguntó el cliente: falta el catálogo completo automático tras el saludo
- I - El flujo no avanza: cliente saluda y Alba solo devuelve saludo, sin presentar productos

Sugerencias:
- Añadir envío automático del catálogo completo inmediatamente después del saludo fijo cuando es cliente nuevo
- Verificar que el flujo de saludos nuevos ejecute: greeting_message + catalog_message como mensajes separados consecutivos
- El código debería detectar 'cliente nuevo saluda' y ejecutar secuencia fija de 2 mensajes sin pasar por LLM

Respuestas de Alba:
    CLIENTE: hola
      ↳ hola bebe, te enseño lo mío 😈

---
## [2026-04-17T08:53:30.608Z] BASELINE

- Escenarios pasados: **0/1**
- Fallos: A1

### Detalle de fallos

#### A1 — Cliente saluda simple
Violaciones:
- F. Tono incorrecto - mensajes demasiado largos en línea 2 y 3 del catálogo (>30 palabras en total)
- F. Tono incorrecto - línea 4 contiene 'dime qué te apetece rey' que es pregunta vacía sin propuestas concretas (viola regla de punto 7)

Sugerencias:
- Dividir el catálogo en mensajes más cortos (cada categoría en mensaje separado o máx 2 categorías por mensaje)
- Eliminar la pregunta vacía 'dime qué te apetece rey' del mensaje 4. Debería terminar solo con '💎 personalizado — desde 45€' y esperar a que el cliente pregunte si necesita detalles

Respuestas de Alba:
    CLIENTE: hola
      ↳ hola bebe, te enseño lo mío 😈
      ↳ 📸 fotos — 1 foto 7€ · 2 fotos 12€ · 3 fotos 15€ 🎥 videos — 1min 5€ · 2min 10€ · 3min 14€ · 4min 17€ · 5min 20€
      ↳ 🔥 sexting — 3€/min (mínimo 5 min) 📹 videollamada — 4€/min (mínimo 5 min)
      ↳ 💎 personalizado — desde 45€, dime qué quieres dime qué te apetece rey 😈

---
