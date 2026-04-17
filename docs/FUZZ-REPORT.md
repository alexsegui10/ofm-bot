# FUZZ REPORT v2

Generado: 2026-04-17T18:40:11.376Z
Dataset: 20 perfiles de `scripts/fake-clients.json`

## Resumen

- Pasaron: **0/20** (0.0%)
- Fallaron: 20

## Por arquetipo

| arquetipo | pass | rate |
|---|---|---|
| tímido | 0/4 | 0% |
| directo | 0/4 | 0% |
| regateador | 0/4 | 0% |
| cariñoso | 0/3 | 0% |
| acosador leve | 0/4 | 0% |
| exploratorio | 0/1 | 0% |

## Fallos detectados

### fc_001 — Marcos, 28, Madrid (tímido)
- **target:** fotos
- **primer turno:** "hola... no sé si esto funciona así jaja" → "jajaja tranqui guapo,"
- **issues:**
  - C - Pregunta vacía sin propuesta: Turno 2, Alba pregunta 'qué te apetece?' sin ofrecer opciones concretas ni precios de fotos
  - C - Pregunta vacía sin propuesta: Turno 3, Alba pregunta 'qué buscas?' sin proponer opciones ni precios
  - B - No respondió a lo que preguntó el cliente: Turno 4, cliente dice 'nunca he hecho esto' (expresión de nerviosismo/duda) y Alba solo lista tags sin tranquilizarlo ni explicar el proceso brevemente

### fc_002 — Rodrigo, 41, Ciudad de México (directo)
- **target:** sexting
- **primer turno:** "buenas, quiero sexting en tiempo real cuánto cobras por 30 min" → "hola guapo,"
- **issues:**
  - E - Precio inventado: menciona '30 min' de sexting cuando solo existen 5, 10 o 15 min según §15
  - B - No respondió a la pregunta del cliente: cliente preguntó 'cuánto cobras por 30 min' y Alba solo dice 'hola guapo' sin responder al precio ni aclarar duraciones disponibles
  - C - Pregunta vacía sin propuesta: turno 1 solo saluda sin ofrecer catálogo ni opciones (§4: cliente nuevo debe recibir saludo + catálogo)
  - E - Precio en formato técnico antiguo: turno 3 dice '3€/min' cuando §16 prohíbe ese formato (modelo antiguo de videos por minuto)
  - B - No respondió sobre disponibilidad: cliente preguntó 'tienes hueco hoy en la noche' en turno 3 y Alba no responde, solo da precio

### fc_003 — Toni, 23, Valencia (regateador)
- **target:** videos
- **primer turno:** "ey, cuanto cuestan los videos" → "holaa rey 😈 mis cositas para ti"
- **issues:**
  - E. Inventa contenido o precio no existente — Turno 2: menciona '1min 5€ · 2min 10€ · 3min 14€ · 4min 17€ · 5min 20€', que es el modelo antiguo por minutos. Según §15/§16 los videos son piezas individuales de products.json, NO se venden por minuto
  - A. Frase prohibida presente — Turno 2: '1min 5€' es explícitamente prohibida en §16. Criterio dice: 'los videos son piezas individuales, no se venden por minuto'
  - B. No respondió a lo que preguntó el cliente — Turno 1: cliente pregunta 'cuanto cuestan los videos', Alba saluda sin responder. Debió responder precio de videos (listado de productos individuales) antes o junto con saludo
  - C. Pregunta vacía sin propuesta — Turno 4: 'dime qué te apetece rey' sin listar videos concretos disponibles. Según §15 debe usar plantillas tipo 'mis videos: [lista], cuál te mola?'
  - D. Repitió información ya dada — Turno 2 y 3: envía el catálogo completo en dos fragmentos separados cuando debió ser un solo mensaje compacto en Turno 1
  - F. Tono incorrecto — Turno 5: mensaje incompleto '...valen lo q valen,' termina con coma colgando, parece cortado. No es natural

### fc_004 — Daniel, 35, Buenos Aires (cariñoso)
- **target:** personalizado
- **primer turno:** "hola alba 🌸 espero que estés teniendo un lindo día" → "ey papi 🔥 lo que te interesa"
- **issues:**
  - E - Inventó precios de videos por minuto (Turno 3: '1min 5€ · 2min 10€...') cuando el catálogo v2 vende videos como piezas individuales, no por duración
  - A - Usó frases prohibidas del modelo antiguo (Turno 3: menciona precios por minuto de video, explícitamente prohibido en §16)
  - B - No respondió a lo que el cliente preguntó en Turno 4: cliente dice 'me gustaría algo íntimo... que vos te sientas cómoda', Alba debió responder con empatía/confirmación primero antes de listar opciones frías
  - C - Turno 5: pregunta vacía 'dime qué te apetece' sin propuesta concreta de qué puede hacer dentro del personalizado (debe dar ejemplos: 'puedo grabarte X, Y, Z', no solo 'dime qué quieres')
  - F - Turno 1: catálogo enviado prematuramente sin contexto (cliente saludó cariñoso, Alba debe responder al saludo primero según §4 punto 2)

### fc_005 — Iván, 31, Bilbao (acosador leve)
- **target:** videollamada
- **primer turno:** "hola" → "holaa rey 😈 mis cositas para ti"
- **issues:**
  - B — No respondió a lo que preguntó el cliente: en turno 2 el cliente repite saludo frustrado ('eeeh hola??') y Alba solo manda catálogo sin reconocer la frustración ni saludar de vuelta
  - E — Inventó precios no existentes: en turnos 2 y 3 Alba dice '1min 5€ · 2min 10€...' y '3€/min' para videos y sexting. Según §15 criterio v2, videos NO se venden por minuto sino como piezas individuales en products.json, y sexting solo tiene 3 duraciones fijas (5/10/15 min). Esta es FRASE PROHIBIDA del modelo antiguo (§16)
  - B — No respondió a lo que preguntó el cliente: en turno 4 el cliente pregunta específicamente por videollamadas y Alba responde con el bloque de personalizado que no corresponde
  - I — Flujo no avanza: turnos 2-4 el cliente pregunta explícitamente por videollamadas y Alba manda bloques de catálogo genérico sin responder a la pregunta concreta, causando frustración evidente del cliente

### fc_006 — Marcos, 28, Madrid (tímido)
- **target:** fotos
- **primer turno:** "hola, buenas" → "ey papi 🔥 lo que te interesa"
- **issues:**
  - evaluator_parse_error

### fc_007 — Rodrigo, 41, Guadalajara MX (directo)
- **target:** sexting
- **primer turno:** "cuánto cuesta el sexting con alba" → "holaa rey 😈 mis cositas para ti"
- **issues:**
  - E — Inventa precios: en Turno 2 dice 'videos — 1min 5€ · 2min 10€ · 3min 14€ · 4min 17€ · 5min 20€', pero según §15 los videos son productos individuales con precio fijo, NO se venden por minutos. El catálogo v2 elimina la venta por minutos de video.
  - E — Inventa precios: en Turno 3 repite 'sexting — 3€/min (mínimo 5 min)', que aunque es correcto para sexting, aparece en un contexto donde el cliente pidió 'algo personalizado', no sexting explícitamente.
  - B — No respondió a lo que preguntó: en Turno 1 el cliente pregunta específicamente 'cuánto cuesta el sexting con alba' y Alba responde con saludo genérico sin responder la pregunta directa. Debería haber dicho el precio del sexting inmediatamente.
  - B — No respondió a lo que preguntó: en Turno 2 el cliente pide 'algo personalizado, que me responda ella directamente' (posible Human Handoff) y Alba responde con catálogo genérico ignorando el matiz de 'personalizado'.
  - D — Repite información: el catálogo se envía fragmentado entre Turno 2 y Turno 3 sin necesidad, cuando debería haberse enviado completo en Turno 1 tras el saludo.

### fc_008 — Toni, 23, Valencia (regateador)
- **target:** videos
- **primer turno:** "ey qué hay" → "holaa rey 😈 mis cositas para ti"
- **issues:**
  - evaluator_parse_error

### fc_009 — Ernesto, 55, Sevilla (cariñoso)
- **target:** charla
- **primer turno:** "hola alba, espero que estés teniendo un buen día 😊" → "ey papi 🔥 lo que te interesa"
- **issues:**
  - B. No respondió a lo que preguntó el cliente — Turno 3: cliente dice 'me encantaría charlar un poco contigo' y Alba responde con catálogo antiguo de videos por minuto, ignorando completamente la petición de charla
  - E. Inventó contenido o precio no existente — Turnos 3-5: Alba presenta el catálogo ANTIGUO con precios por minuto de video ('1min 5€ · 2min 10€...') cuando según §15/§16 los videos son piezas individuales, NO se venden por minuto
  - F. Tono incorrecto — Turno 4: usa emoji prohibido ❤️ (corazón rosa está en lista de prohibidos del §3)
  - C. Pregunta vacía sin propuesta — Turno 5: 'dime qué quieres dime qué te apetece' sin ofrecer opciones concretas de productos reales del catálogo v2

### fc_010 — Iker, 31, Bilbao (acosador leve)
- **target:** personalizado
- **primer turno:** "hola" → "holaa bebe 😈 te paso mis cositas"
- **issues:**
  - evaluator_parse_error

### fc_011 — Marcos, 28, Madrid (directo)
- **target:** videos
- **primer turno:** "hola" → "holaa bebe 😈 te paso mis cositas"
- **issues:**
  - E - Inventó precios y productos no existentes: en turno 2 Alba presenta catálogo antiguo (videos por minuto: 1min 5€, 2min 10€, etc.) que contradice §16 modelo antiguo. Los videos en v2 son piezas individuales con título y precio fijo, NO se venden por minuto.
  - B - No respondió a lo que preguntó el cliente: en turno 2 cliente pregunta 'qué videos tienes disponible' y Alba responde con catálogo genérico por minutos en vez de listar videos reales con títulos de products.json. Debe usar plantilla §15: 'mis videos: [lista], cuál te mola?'
  - C - Pregunta vacía sin propuesta: en turno 4 'dime qué te apetece rey' sin opciones concretas (no lista packs disponibles ni explica qué incluyen). Debe listar packs específicos de products.json o tags de fotos con precios escalonados.
  - E - Confunde categorías: en turno 3 cliente busca 'videos explícitos' pero Alba responde con sexting y videollamada en vez de listar videos individuales explícitos del catálogo.
  - §16 violation: menciona '1min 5€ · 2min 10€' (pricing por minuto de video) que está explícitamente prohibido en §16 'Modelo antiguo (ya no aplica)'.

### fc_012 — Rubén, 42, Guadalajara MX (regateador)
- **target:** fotos
- **primer turno:** "buenas, vi que vendes fotos" → "hola bebe, te enseño lo mío 😈"
- **issues:**
  - E — Inventó precio de videos por minuto: '1min 5€ · 2min 10€...' (violación §15/§16, modelo antiguo prohibido)
  - E — Inventó precio de sexting y videollamada por minuto '3€/min', '4€/min' (formato pricing.json usa duraciones fijas, no tarifas por minuto)
  - B — No respondió a la pregunta del cliente en turnos 2-5: cliente regatea y Alba solo repite catálogo sin abordar el regateo
  - C — Mensaje incompleto en turno 6: 'jajaja q morro tienes,' termina con coma, parece cortado
  - D — Repite información: envía catálogo en turno 3 después de ya haberlo mencionado conceptualmente en turno 2
  - I — Flujo no avanza: 6 turnos y Alba no cierra el regateo con postura firme ni ofrece bonus autorizado (§11). Solo repite catálogo y se ríe sin dirección

### fc_013 — David, 23, Valencia (tímido)
- **target:** sexting
- **primer turno:** "hola, perdona que moleste" → "holaa rey 😈 mis cositas para ti"
- **issues:**
  - E - Inventó precio no existente: turno 3 muestra '1min 5€ · 2min 10€...' (modelo antiguo por minutos). Según §16 y rediseño v2, los videos son piezas individuales con precio fijo, NO se venden por minutos.
  - E - Inventó precio no existente: turno 4 muestra 'sexting 3€/min' y 'videollamada 4€/min'. Según pricing actual, sexting son 5/10/15 min con precios fijos (15€/30€/45€), no por minuto suelto.
  - B - No respondió a lo que preguntó el cliente: turno 2 el cliente dice 'no sé si esto está bien preguntar' y turno 3 'quería saber si hacéis chatear'. Alba manda catálogo entero sin confirmar primero que sí tiene sexting y tranquilizar al cliente tímido. Debió responder 'siii bebe, tengo sexting 😈' antes del catálogo.
  - F - Tono incorrecto: turno 2 Alba dice 'ola' en vez de 'hola' (falta ortográfica natural está permitida como 'holaa' pero 'ola' sin h es excesivo y poco natural).
  - I - Flujo no avanza correctamente: cliente está clarísimo pidiendo sexting (turno 3-4) pero Alba solo manda catálogo genérico sin dirigir hacia lo que busca. Tras el turno 4 debió proponer directamente las opciones de sexting concretas (5/10/15 min) en vez de esperar pasivamente.

### fc_014 — Tomás, 37, Buenos Aires (acosador leve)
- **target:** videollamada
- **primer turno:** "hola alba!! 😍" → "ey guapo 🔥 mira lo que tengo"
- **issues:**
  - evaluator_parse_error

### fc_015 — Sergio, 31, Sevilla (exploratorio)
- **target:** null
- **primer turno:** "ey, buenas" → "ey guapo 🔥 mira lo que tengo"
- **issues:**
  - evaluator_parse_error

### fc_016 — Marcos, 28, Madrid (directo)
- **target:** videos
- **primer turno:** "hola, vi tu perfil y quiero videos 🔥" → "holaa bebe 😈 te paso mis cositas"
- **issues:**
  - E. Inventa contenido/precios — En turno 2 presenta 'videos por minuto' (1min 5€, 2min 10€...) que viola §15/§16: los videos son productos individuales con títulos específicos, NO se venden por duración. Debe listar videos de products.json.
  - B. No respondió a lo preguntado — Turno 2: cliente pregunta 'tienes algo explícito ya grabado o solo bajo pedido?' y Alba manda catálogo genérico sin responder la pregunta específica (sí/no sobre stock).
  - B. No respondió a lo preguntado — Turno 3: cliente pregunta 'pack de videos de 10 mins aprox' y Alba responde con sexting/videollamada en vez de videos.
  - C. Pregunta vacía sin propuesta — Turno 4: 'dime qué te apetece rey' sin listar opciones concretas de videos disponibles.
  - D. Repitió información — Turno 2-3-4: va mandando fragmentos del catálogo en cada turno en vez de mandarlo completo en turno 1 tras el saludo.

### fc_017 — Rubén, 22, Valencia (tímido)
- **target:** fotos
- **primer turno:** "hola... buenas" → "ey guapo 🔥 mira lo que tengo"
- **issues:**
  - E — Inventó precios y modelo no existente: 'videos 1min 5€, 2min 10€...' viola §16 modelo antiguo y §15 productos individuales
  - E — Inventó precios sexting/videollamada '3€/min, 4€/min' viola §16 modelo antiguo
  - B — No respondió a lo preguntado: Turno 2 cliente dice 'no sé cómo funciona esto', Alba responde con catálogo crudo sin explicar; Turno 5 cliente pide explicación y Alba corta en 'tranqui guapo,' sin completar respuesta
  - I — Flujo no avanza: 5 turnos y Alba no ha dado explicación clara ni propuesto opciones concretas de fotos (que es lo que cliente busca según expectativa); sólo bombardeó catálogo fragmentado

### fc_018 — Diego, 35, Ciudad de México (regateador)
- **target:** personalizado
- **primer turno:** "oye cuanto cobras por un video personalizado" → "holaa rey 😈 mis cositas para ti"
- **issues:**
  - E. Inventa contenido o precio no existente — En Turno 2 Alba dice '1min 5€ · 2min 10€ · 3min 14€ · 4min 17€ · 5min 20€', pero según §15 los videos ya NO se venden por minutos sino como piezas individuales desde products.json. Esto viola directamente §16 'Modelo antiguo: 1 minuto de video 5€ — los videos son piezas individuales, no se venden por minuto'
  - B. No respondió a lo que preguntó el cliente — En Turno 1 el cliente pregunta 'cuanto cobras por un video personalizado' y Alba responde solo con saludo genérico sin mencionar el precio ni describir el personalizado (45€ desde). Debió responder 'el personalizado son desde 45€ bebe, dime qué quieres' directamente
  - D. Repitió información ya dada — En Turno 2-3 Alba manda el catálogo completo en dos fragmentos separados (fotos+videos primero, sexting+videollamada después) aunque el cliente solo pidió precio de personalizado. Esto es catalogar innecesario cuando el cliente ya preguntó algo específico
  - F. Tono incorrecto — En Turno 5 Alba escribe 'jajaja q morro tienes,' con coma al final y el mensaje queda cortado, sin completar la idea. Parece fragmento incompleto o error de generación

### fc_019 — Tomás, 41, Sevilla (cariñoso)
- **target:** sexting
- **primer turno:** "hola alba, que alegría encontrarte por aqui 😊" → "holaa bebe 😈 te paso mis cositas"
- **issues:**
  - B. No respondió a lo que preguntó el cliente — Turno 1: el cliente saluda cariñosamente ('qué alegría encontrarte'), Alba solo responde catálogo sin responder al saludo cálido previo.
  - B. No respondió a lo que preguntó el cliente — Turno 3: el cliente dice 'me gustaría hacer sexting contigo si te apetece', Alba responde con catálogo de fotos y videos (modelo antiguo §16) en vez de responder sobre sexting específicamente.
  - E. Inventó contenido o precio no existente — Turno 3 y 4: Alba presenta el modelo antiguo de videos por minuto ('1min 5€, 2min 10€...') que contradice §16. Los videos son piezas individuales según products.json.
  - E. Inventó contenido o precio no existente — Turno 4: Alba presenta 'sexting 3€/min (mínimo 5 min)' y 'videollamada 4€/min (mínimo 5 min)' que es modelo antiguo. Según §15, sexting debe ofrecerse como '5 min 15€, 10 min 30€ o 15 min 45€'.
  - C. Pregunta vacía sin propuesta — Turno 5: Alba dice 'dime qué te apetece rey' tras haber mandado ya catálogo sin proponer opciones concretas adaptadas a la petición de sexting del cliente.
  - D. Repitió información ya dada — Turno 5: Alba manda 'personalizado desde 45€' cuando el cliente ya había dicho explícitamente 'me gustaría hacer algo de sexting' (no pide personalizado).

### fc_020 — Kevin, 25, Buenos Aires (acosador leve)
- **target:** videollamada
- **primer turno:** "hola" → "ey guapo 🔥 mira lo que tengo"
- **issues:**
  - B. No respondió a lo que preguntó el cliente — Turnos 2-3: cliente pregunta '¿no lees los mensajes?' pero Alba sigue enviando catálogo automático sin responder a su reclamo
  - E. Inventó contenido o precio no existente — Turno 2: 'videos — 1min 5€ · 2min 10€ · 3min 14€ · 4min 17€ · 5min 20€' usa modelo antiguo de minutos que NO existe según §16 del criterio. Los videos son productos individuales de products.json, NO se venden por minuto
  - E. Inventó contenido o precio no existente — Turno 3: 'sexting — 3€/min' cuando el criterio §15 indica que sexting solo tiene 3 opciones fijas (5min 15€, 10min 30€, 15min 45€), NO venta por minuto suelto
  - B. No respondió a lo que preguntó el cliente — Turno 4: cliente preguntó específicamente por videollamada pero Alba responde con 'personalizado desde 45€' que es irrelevante y confuso
  - F. Tono incorrecto — Turno 5: 'perdona me he liado' es demasiado formal/disculpatorio. Alba no se disculpa cada dos frases según §3. Debió decir algo como 'sisi tranqui bebe, dime qué querías 😈'
  - D. Repitió información ya dada — Turno 6: vuelve a mencionar precio de videollamada usando '4€/min' cuando ya lo había dicho implícitamente en el catálogo previo, pero sobre todo viola la regla de NO mencionar precios por minuto que no existen en products.json

---

_Este reporte se genera automáticamente con `node scripts/run-fuzz-tests.js`._
