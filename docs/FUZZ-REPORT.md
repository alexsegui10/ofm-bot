# FUZZ REPORT v2

Generado: 2026-04-20T09:33:57.976Z
Dataset: 20 perfiles de `scripts/fake-clients.json`

## Resumen

- Pasaron: **2/20** (10.0%)
- Fallaron: 18

## Por arquetipo

| arquetipo | pass | rate |
|---|---|---|
| tímido | 0/4 | 0% |
| directo | 0/4 | 0% |
| regateador | 0/4 | 0% |
| cariñoso | 1/3 | 33% |
| acosador leve | 1/4 | 25% |
| exploratorio | 0/1 | 0% |

## Fallos detectados

### fc_001 — Marcos, 28, Madrid (tímido)
- **target:** fotos
- **primer turno:** "hola... no sé si esto funciona así jaja" → "holaaa guapo, claro q funciona
tengo fotitos y videos bebe, qué te apetece? 😈"
- **issues:**
  - C. Pregunta vacía sin propuesta — En turnos 1 y 3, Alba pregunta 'qué te apetece?' / 'qué buscas?' sin acompañar con opciones concretas (precios, categorías, ejemplos). Según §9C y §15, debe proponer algo tangible junto a la pregunta abierta.
  - B. No respondió a lo que preguntó el cliente — En turno 2, el cliente se disculpa por molestar y Alba responde 'no molestas pa nada guapo,' pero corta el mensaje sin completar la frase (probablemente error de fragmentación). Debería haber continuado con propuesta o empatía completa.
  - B. No respondió completamente — En turno 4, cliente expresa nerviosismo por primera vez ('nunca he hecho esto 😅'). Alba dice 'eyy no te preocupes,' pero corta abruptamente sin tranquilizar ni proponer. Falta el cierre natural ('todo es fácil bebe' + catálogo u opciones).

### fc_002 — Rodrigo, 41, Ciudad de México (directo)
- **target:** sexting
- **primer turno:** "buenas, quiero sexting en tiempo real cuánto cobras por 30 min" → "hola cariño, qué bueno"
- **issues:**
  - C. Pregunta vacía sin propuesta — Alba NO propone opciones concretas de sexting (5/10/15 min + precios) en ninguno de los 3 turnos
  - I. Flujo no avanza — Tras 3 turnos, Alba no ha dado precios, duraciones disponibles ni método de pago; el cliente pidió explícitamente precio por 30 min y Alba lo ignoró
  - B. No respondió a lo que preguntó el cliente — Cliente pregunta 'cuánto cobras por 30 min' en turno 1, Alba responde con vaguedades genéricas sin mencionar que sexting es 5/10/15 min ni precio
  - F. Tono incorrecto — Turno 1: 'qué bueno que me busques' suena servil/formal, no es el tono directo de Alba; Turno 2: 'espera un seg q te cuento' promete explicación que nunca llega

### fc_003 — Toni, 23, Valencia (regateador)
- **target:** videos
- **primer turno:** "ey, cuanto cuestan los videos" → "holaa guapo,"
- **issues:**
  - B - No respondió a lo que preguntó el cliente
  - C - Pregunta vacía sin propuesta concreta
  - I - Flujo no avanza hacia la venta

### fc_005 — Iván, 31, Bilbao (acosador leve)
- **target:** videollamada
- **primer turno:** "hola" → "holaa guapo, qué tal estás? 😈"
- **issues:**
  - I: El flujo no avanza — Alba ha empleado 6 turnos sin dar información concreta sobre videollamada. Cliente pidió videollamada en turno 4, Alba dijo 'miro agenda', pero en turno 6 sigue sin dar precio/disponibilidad/opciones
  - B: No responde a lo que preguntó — Cliente pregunta directamente por videollamadas en turno 4, Alba dice 'miro agenda' pero nunca da respuesta concreta. En turno 6 cliente insiste y Alba pregunta '¿qué necesitas?' cuando ya lo dijo
  - D: Repite información — Turno 1 y 2 Alba saluda similar ('holaa guapo' / 'eyy cariño'), cliente ya saludó, no debería volver a saludar genérico
  - F: Tono incorrecto — Turno 6: 'a veces me lío un poco' suena a excusa de bot/persona despistada, no es el tono directo y seguro de Alba

### fc_006 — Marcos, 28, Madrid (tímido)
- **target:** fotos
- **primer turno:** "hola, buenas" → "hola guapo,"
- **issues:**
  - B. No respondió a lo que preguntó el cliente — Turno 2: cliente pregunta '¿aquí se puede ver contenido de alba?' y Alba responde 'qué tal estás? cómo te llamas?' sin confirmar ni aclarar lo que preguntó
  - B. No respondió a lo que preguntó el cliente — Turno 4: cliente dice explícitamente 'yo quería ver fotos' y Alba responde con pregunta genérica 'tengo fotitos y videos bebe, qué te apetece?' sin dar opciones concretas de fotos
  - C. Pregunta vacía sin propuesta — Turno 4: 'qué te apetece?' sin listar opciones concretas de fotos (tags, precios escalonados, etc.)
  - I. Flujo no avanza — Tras 5 turnos el cliente manifestó interés claro en fotos (turno 4) pero Alba no ha presentado el catálogo de fotos ni propuesto nada concreto para cerrar

### fc_007 — Rodrigo, 41, Guadalajara MX (directo)
- **target:** sexting
- **primer turno:** "cuánto cuesta el sexting con alba" → "hola guapo,"
- **issues:**
  - B. No respondió a lo que preguntó el cliente — Turno 1: cliente pregunta 'cuánto cuesta el sexting', Alba solo dice 'hola guapo' sin responder precio ni catálogo de sexting
  - B. No respondió a lo que preguntó el cliente — Turno 3: cliente dice que tiene 40€ y pregunta si alcanza, Alba empieza 'hola cariño, me flipa' (mensaje cortado) pero no responde a la pregunta sobre presupuesto
  - D. Repitió información ya dada — Turno 3: Alba dice 'hola' de nuevo cuando ya saludó en turno 1
  - F. Tono incorrecto — Turno 2: 'qué ganas de ponernos a tono juntos' suena demasiado servil/formal para Alba, debería ser más directa y menos cursi
  - I. Flujo no avanza — Turno 2: Alba dice 'dame un seg que te cuento todo' pero en turno 3 no cumple esa promesa, vuelve a saludar y no da info sobre sexting

### fc_008 — Toni, 23, Valencia (regateador)
- **target:** videos
- **primer turno:** "ey qué hay" → "holaa guapo, q tal estás? 😈"
- **issues:**
  - B — No respondió a lo que preguntó el cliente: en turno 2 cliente pregunta 'a cuánto están los vídeos' y Alba responde genérico 'depende de lo q quieras ver' sin dar lista ni precios de videos
  - B — No respondió a lo que preguntó el cliente: en turno 3 cliente menciona precio caro y en otros sitios más barato, Alba pregunta 'qué te apetece' ignorando completamente la objeción de precio
  - C — Pregunta vacía sin propuesta: en turno 3 'qué te apetece? 😈' sin opciones concretas
  - D — Repitió información: turnos 4-5-6 envían el catálogo fragmentado en 3 mensajes separados cuando debería haberse enviado completo en turno 2 o máximo turno 4
  - F — Tono incorrecto: en turno 6 menciona '4€/min' para videollamada, lo cual es correcto para videollamada pero la fragmentación del catálogo hace que parezca respuesta a regateo en vez de información inicial
  - I — Flujo no avanza: tras 6 turnos de regateo del cliente, Alba no ha cerrado ni propuesto nada concreto, solo envió catálogo fragmentado. Debería haber dicho algo como 'mis precios son esos bebe, si no quieres pagar pasa' tras turno 5

### fc_009 — Ernesto, 55, Sevilla (cariñoso)
- **target:** charla
- **primer turno:** "hola alba, espero que estés teniendo un buen día 😊" → "hola cariño,"
- **issues:**
  - B. No respondió a lo que preguntó el cliente — En turno 2, cliente da cumplido sobre personalidad, Alba responde con pregunta genérica sin aceptar/agradecer el cumplido primero
  - B. No respondió a lo que preguntó el cliente — En turno 3, cliente dice explícitamente 'si tienes un rato me encantaría charlar un poco contigo', Alba no responde afirmativamente a esa intención
  - I. Flujo no avanza — Tras 5 turnos (10+ intercambios) sigue en small talk puro sin proponer nada concreto ni mencionar catálogo, viola §4 flujo de venta
  - B. No respondió a lo que preguntó el cliente — En turno 4, cliente menciona 'si luego quieres enseñarme algo especial', Alba pregunta nombre sin reconocer la intención de compra potencial

### fc_011 — Marcos, 28, Madrid (directo)
- **target:** videos
- **primer turno:** "hola" → "holaa guapo, cómo estás? 😈"
- **issues:**
  - B. No respondió a lo que preguntó el cliente — Turno 4: cliente preguntó '¿cuánto cuesta un pack?' pero Alba respondió listando otro video individual (squirt fuerte con dildo 22€) en vez de explicar precios de packs o listar packs disponibles
  - E. Inventó contenido — Turno 4: Alba menciona 'squirt fuerte con dildo · 4:30 · 22€' sin que el evaluador pueda verificar que existe en products.json. Posible invención de producto no catalogado

### fc_012 — Rubén, 42, Guadalajara MX (regateador)
- **target:** fotos
- **primer turno:** "buenas, vi que vendes fotos" → "hola guapo, sí,"
- **issues:**
  - C. Pregunta vacía sin propuesta — Turno 5[2]: 'cuántas quieres?' sin contexto claro de qué está ofreciendo (fotos sueltas o packs). La ráfaga menciona packs en [1] pero la pregunta [2] queda ambigua.
  - B. No respondió a lo que preguntó el cliente — Turno 2: Cliente cuestiona precio ('está muy caro'), Alba ignora completamente la objeción y solo pregunta qué busca. Debió reconocer la objeción primero.
  - B. No respondió a lo que preguntó el cliente — Turno 3: Cliente compara con otras páginas (5€), Alba ignora y lista tags sin contexto de precio.
  - I. Flujo no avanza — Turno 6: Cliente insiste en regateo directo por tercera vez. Alba debe cerrar o cortar firme según §8 'Cliente gorrón', no seguir riendo. Falta firmeza.

### fc_013 — David, 23, Valencia (tímido)
- **target:** sexting
- **primer turno:** "hola, perdona que moleste" → "hola cariño, no molestas en absoluto 😈 cómo te va?"
- **issues:**
  - B - No respondió a lo que preguntó el cliente: en turnos 2-4 el cliente pregunta explícitamente por 'chatear' (sexting) pero Alba nunca da la información solicitada, solo dice 'pregunta lo que sea' sin responder realmente
  - I - Flujo no avanza: después de 4 turnos el cliente sigue sin saber si Alba hace sexting ni los precios, el diálogo se estanca en 'pregunta tranquilo' sin propuesta concreta

### fc_014 — Tomás, 37, Buenos Aires (acosador leve)
- **target:** videollamada
- **primer turno:** "hola alba!! 😍" → "holaaa guapo, q bien verte por aquí 😈 cómo te llamas?"
- **issues:**
  - B. No respondió a lo que preguntó el cliente — En turno 5 cliente pide VIDEOLLAMADA con precio y Alba NO responde sobre precio ni videollamada, solo vuelve a preguntar su nombre (cliente ya lo intenta desde turno 1). En turno 6 cliente pide que responda porque lleva esperando y Alba recién ahí agradece el piropo pero NO responde sobre videollamada.
  - D. Repitió información ya dada — Alba pregunta 'cómo te llamas' en turno 1, turno 3 y turno 5 (3 veces). Cliente no da nombre pero insistir 3 veces es repetitivo. Debió avanzar el flujo sin esperar dato no crítico.
  - I. Flujo no avanza — Turnos 1-6 y Alba aún no ha dado precio de videollamada ni propuesto nada concreto. Cliente pidió videollamada con precio en turno 4, repitió intención en turno 5-6, y Alba sigue en small talk pidiendo nombre. Violación de avance de flujo tras 2-3 intercambios (criterio §9.I).

### fc_015 — Sergio, 31, Sevilla (exploratorio)
- **target:** null
- **primer turno:** "ey, buenas" → "ey guapo,"
- **issues:**
  - B - No respondió a lo que preguntó el cliente: En turno 3 el cliente pregunta 'qué tipo de contenido vendes exactamente' y Alba responde 'no te preocupes cariño' sin responder la pregunta. Recién en turno 4 da una respuesta vaga ('fotitos y videos').
  - B - No respondió a lo que preguntó el cliente: En turno 4 el cliente pregunta sobre seguridad/privacidad ('esto es seguro no? tipo no se comparte ni nada') y Alba solo responde 'tranqui guapo, todo queda entre nosotros' en turno 5, pero SIN dar el catálogo completo que debería seguir según §4.
  - C - Pregunta vacía sin propuesta: En turno 4 Alba pregunta 'qué te apetece ver?' sin dar opciones concretas. Debería haber mandado el catálogo completo después o junto con esta pregunta.

### fc_016 — Marcos, 28, Madrid (directo)
- **target:** videos
- **primer turno:** "hola, vi tu perfil y quiero videos 🔥" → "holaa guapo, tengo unos videos"
- **issues:**
  - B - No respondió a lo que preguntó el cliente: En turno 1 cliente pidió videos, Alba dice 'tengo unos videos' pero NO lista opciones de videos concretos ni propone nada. En turno 2 cliente pregunta si tiene videos ya grabados vs pedido, Alba no responde y solo pregunta 'qué tipo'. En turno 3 cliente pide VIDEOS ('pack de videos de 10 mins'), Alba responde con FOTOS (packs de fotos). En turno 4 cliente menciona pagar, Alba sigue listando FOTOS.
  - C - Pregunta vacía sin propuesta concreta: En turno 2 Alba pregunta 'qué tipo de contenido te mola?' sin dar opciones específicas de videos (debe listar títulos/descripciones según §15).
  - E - Inventó contenido o malinterpretó catálogo: En turno 3-4 Alba lista packs de FOTOS cuando el cliente explícitamente pidió VIDEOS. Los packs mostrados ('culo en tanga roja', 'tetas en lencería', 'ducha jabonosa') parecen inventados o mal extraídos.
  - Violación §16 modelo antiguo potencial: Aunque no menciona 'X€/min', el cliente pidió 'videos de 10 mins aprox' y Alba no corrigió ni explicó que los videos son piezas individuales (no se venden por minutos según §15/§16).
  - I - Flujo no avanza correctamente: Después de 4 turnos donde el cliente dejó claro que quiere videos y está dispuesto a pagar inmediatamente, Alba NO ha presentado ningún video real, solo fotos que no pidió.

### fc_017 — Rubén, 22, Valencia (tímido)
- **target:** fotos
- **primer turno:** "hola... buenas" → "hola guapo, qué tal estás? cómo te llamas? 😈"
- **issues:**
  - B. No respondió a lo que preguntó el cliente - En turno 2, cliente pregunta 'cómo funciona esto' y Alba responde 'no te rayes' sin explicar nada. En turno 4, cliente pregunta por precios y Alba no contesta. En turno 5, cliente PIDE EXPLÍCITAMENTE que le explique cómo funciona y Alba sigue evadiendo, solo pregunta nombre y qué busca sin dar información solicitada
  - I. Flujo no avanza - Después de 5 turnos, Alba NO ha mostrado catálogo, NO ha explicado cómo funciona el proceso (que el cliente pidió TRES veces), y se limita a preguntar el nombre repetidamente sin dar información concreta. Cliente muestra interés claro ('me interesaría algo') pero Alba no aprovecha para catalogar ni explicar
  - D. Repitió información ya dada - Alba pregunta '¿cómo te llamas?' en turno 1 y vuelve a preguntar en turno 3 ('dime tu nombre') y turno 5 ('cómo te llamas?'). Esto es repetición innecesaria

### fc_018 — Diego, 35, Ciudad de México (regateador)
- **target:** personalizado
- **primer turno:** "oye cuanto cobras por un video personalizado" → "mmm me encanta la idea de un video personalizado,"
- **issues:**
  - B. No respondió a lo que preguntó el cliente — Turno 1: cliente pregunta precio de video personalizado, Alba solo dice 'me encanta la idea' sin dar el precio (45€). Debe responder con el precio de inmediato.
  - B. No respondió a lo que preguntó el cliente — Turno 2: cliente dice 'en otros lados cobran la mitad', Alba responde con 'espera q miro mi agenda' que no tiene sentido como respuesta a una comparación de precios. Debió aplicar §8 'Cliente que compara precios': 'pues vete con ellos guapo 😘 mis precios son esos'.
  - I. Flujo no avanza — Turnos 3-6: el flujo se estanca en círculos. Alba dice precio en turno 3, cliente sigue regateando en 4, 5 y 6, y Alba no corta después de 3 intentos. §8 especifica: 'Después de 3-4 intentos, cortar: cuando quieres comprar algo me dices bebe 😘'
  - D. Repitió información — Turno 6: Alba vuelve a decir 'mis precios son fijos' cuando ya lo había dejado claro en turno 3 ('desde 45€'). Esto es repetición inútil después de múltiples intentos fallidos de cierre.
  - C. Pregunta sin propuesta — Turno 4: 'cuéntame qué tienes en mente' sin ofrecer opciones ni contexto de qué tipo de personalizado, rangos de precio, ejemplos. Pregunta vacía que prolonga el regateo.

### fc_019 — Tomás, 41, Sevilla (cariñoso)
- **target:** sexting
- **primer turno:** "hola alba, que alegría encontrarte por aqui 😊" → "holaaa guapo,"
- **issues:**
  - B — No respondió a lo que preguntó el cliente: En turno 5 el cliente pregunta explícitamente '¿cuánto sería?' (pide precio de sexting) y Alba no responde. Solo dice 'será súper natural' pero omite completamente el precio.
  - C — Pregunta vacía sin propuesta: En turno 1 Alba saluda con 'holaaa guapo' pero NO envía el catálogo automático como requiere §4 flujo paso 1. Cliente nuevo debe recibir saludo + catálogo en mensaje separado.
  - I — Flujo no avanza: Turno 5 es la quinta interacción y Alba aún no ha dado precio ni opciones concretas de sexting (5/10/15 min, 15€/30€/45€ según §15). El cliente ya expresó intención clara de compra en turno 3.

### fc_020 — Kevin, 25, Buenos Aires (acosador leve)
- **target:** videollamada
- **primer turno:** "hola" → "hola guapo, qué tal estás? 😈"
- **issues:**
  - B. No respondió a lo que preguntó el cliente — turno 4 cliente pregunta precio de videollamada y Alba ignora completamente la pregunta
  - B. No respondió a lo que preguntó el cliente — turno 6 cliente repite que ya esperó y quiere respuesta, Alba sigue evadiendo
  - D. Repitió información ya dada — turno 4 Alba dice 'qué me decías?' cuando el cliente acaba de escribirlo en el mismo turno
  - I. Flujo no avanza — tras 6 turnos el cliente pidió videollamada y precio explícitamente 2 veces y Alba nunca responde ni da información útil

---

_Este reporte se genera automáticamente con `node scripts/run-fuzz-tests.js`._
