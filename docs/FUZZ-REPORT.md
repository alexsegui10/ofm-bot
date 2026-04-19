# FUZZ REPORT v2

Generado: 2026-04-19T17:45:08.456Z
Dataset: 20 perfiles de `scripts/fake-clients.json`

## Resumen

- Pasaron: **3/20** (15.0%)
- Fallaron: 17

## Por arquetipo

| arquetipo | pass | rate |
|---|---|---|
| tímido | 1/4 | 25% |
| directo | 0/4 | 0% |
| regateador | 0/4 | 0% |
| cariñoso | 2/3 | 67% |
| acosador leve | 0/4 | 0% |
| exploratorio | 0/1 | 0% |

## Fallos detectados

### fc_001 — Marcos, 28, Madrid (tímido)
- **target:** fotos
- **primer turno:** "hola... no sé si esto funciona así jaja" → ""
- **issues:**
  - C - Pregunta vacía sin propuesta: en turno 4 Alba pregunta 'qué te gustaría ver?' sin ofrecer NINGUNA opción concreta (tags, categorías, precios, nada). Según §9.C y §2 del criterio, las preguntas deben ir SIEMPRE acompañadas de 2-3 opciones concretas.
  - B - No respondió a lo que preguntó el cliente: en turno 3 el cliente menciona específicamente 'fotos', pero Alba en turno 4 hace pregunta genérica en vez de responder directamente con opciones de fotos (tags disponibles, precios escalonados 1/2/3 fotos).

### fc_002 — Rodrigo, 41, Ciudad de México (directo)
- **target:** sexting
- **primer turno:** "buenas, quiero sexting en tiempo real cuánto cobras por 30 min" → "hola cariño, me encanta"
- **issues:**
  - B — No respondió a lo que el cliente preguntó. El cliente pidió 30 min de sexting y Alba solo ofreció 5/10/15 min sin reconocer explícitamente que no tiene esa opción.
  - C — Pregunta vacía sin propuesta adaptada. Alba pregunta 'cuál te mola?' cuando el cliente ya especificó 30 min. Debería haber dicho algo como 'no tengo de 30 min bebe, tengo de 5, 10 o 15. o te hago 2 sesiones de 15 min si quieres 30'.
  - F — Tono incorrecto: mensajes demasiado largos. El turno 3 tiene formato de lista con bullets (·), lo cual está PROHIBIDO explícitamente en §7 ('formato lista con bullets (•, -, *)').
  - I — El flujo no avanza correctamente. Alba no reconoce la petición específica de 30 min del cliente ni ofrece alternativas creíbles, solo presenta opciones estándar ignorando lo que pidió.

### fc_003 — Toni, 23, Valencia (regateador)
- **target:** videos
- **primer turno:** "ey, cuanto cuestan los videos" → "holaa guapo,"
- **issues:**
  - B. No respondió a lo que preguntó el cliente — Turno 1: cliente pregunta 'cuanto cuestan los videos' y Alba solo saluda sin dar precio ni catálogo
  - B. No respondió a lo que preguntó el cliente — Turno 2: cliente compara precios con OnlyFans y Alba no defiende ni justifica, solo pregunta qué quiere
  - B. No respondió a lo que preguntó el cliente — Turno 4: cliente pide muestra gratis y Alba ignora completamente, solo sigue listando videos
  - B. No respondió a lo que preguntó el cliente — Turno 5: cliente pregunta por descuento en pack y Alba ignora, solo añade otro video
  - D. Repitió información — Turno 3 y 4: Alba lista videos de forma fragmentada sin razón (debería haber dado lista completa en turno 3)
  - D. Repitió información — Turno 5: Alba añade 'squirt fuerte con dildo' cuando en turno 3 ya había 'squirt en la ducha' (contenido redundante sin aclarar diferencia)

### fc_005 — Iván, 31, Bilbao (acosador leve)
- **target:** videollamada
- **primer turno:** "hola" → "holaa de nuevo, ya estoy aquí, q tal estás? 😈"
- **issues:**
  - E. Inventó contenido o precio no existente — En turno 5 dice 'son 4€/min bebe', cuando según §15 videollamada NO se vende por minuto sino por SESIÓN (pricing.json define sesiones de 5min, 10min, etc. con precios fijos)
  - A. Frase prohibida presente — Turno 5: '4€/min' es modelo antiguo explícitamente prohibido en §16 ('cuántos minutos quieres de video' — misma razón: productos son piezas individuales)
  - B. No respondió a lo que preguntó el cliente — Turnos 2-4: cliente dice 'no me lees o qué' y 'llevo 20 min esperando respuesta', Alba NO reconoce el problema de timing ni pide disculpas, solo sigue con respuestas genéricas ('qué pasa, cómo estás?'). En turno 4 cliente dice 'solo quiero saber si haces videollamadas' y Alba responde en turno 5 'mmm videollamadas me interesan' + precio, pero ignora completamente la queja de los 20 minutos
  - I. Flujo no avanza — Turnos 1-4: cliente pregunta algo concreto (videollamadas) en turno 4, pero Alba tarda 4 turnos en dar respuesta útil, con mensajes vacíos intermedios ('holaa de nuevo', 'eyy guapo', 'qué pasa')

### fc_006 — Marcos, 28, Madrid (tímido)
- **target:** fotos
- **primer turno:** "hola, buenas" → "hola guapo, qué tal estás? 😈 cómo te llamas?"
- **issues:**
  - C - Pregunta vacía sin propuesta: En turno 4, Alba pregunta 'qué te gustaría ver?' sin ofrecer opciones concretas en ESE MISMO mensaje. Según §9.C y §7 (frases prohibidas), toda pregunta debe ir acompañada de 2-3 opciones. El catálogo llega recién en turno 5, que es un mensaje SEPARADO.
  - E - No sigue protocolo de catálogo automático: Según §4 'Flujo paso a paso', cuando un cliente saluda (turno 1), Alba debe responder con saludo breve Y catálogo en mensaje separado AUTOMÁTICO. Aquí el catálogo no apareció hasta turno 5, después de que el cliente preguntara explícitamente por fotos.

### fc_007 — Rodrigo, 41, Guadalajara MX (directo)
- **target:** sexting
- **primer turno:** "cuánto cuesta el sexting con alba" → "hola amor,"
- **issues:**
  - B. No respondió a lo que preguntó el cliente — Turno 1: cliente pregunta 'cuánto cuesta el sexting', Alba solo saluda sin responder al precio
  - D. Repitió información ya dada — Turno 3: Alba manda el listado de precios sexting que ya había empezado en turno 2 (fragmento [2] 'tengo 3 opciones:')
  - Fragmentación incorrecta — El turno 2 está partido en dos fragmentos cuando debería ser uno solo (regla de evaluación por ráfaga). Alba dice 'te cuento todo' pero no lo cuenta en ese turno, lo cuenta en el siguiente, rompiendo la coherencia

### fc_008 — Toni, 23, Valencia (regateador)
- **target:** videos
- **primer turno:** "ey qué hay" → "holaa cariño, q tal estás? 😈"
- **issues:**
  - B. No respondió a lo que preguntó el cliente — Turno 2: cliente pregunta 'a cuánto están los vídeos' esperando rango de precios general, Alba responde con pregunta genérica sin dar información de precios
  - C. Pregunta vacía sin propuesta — Turno 2: Alba pregunta 'dime qué te apetece' sin ofrecer ninguna opción concreta (categorías, títulos, rango de precios)
  - D. Repitió información ya dada — Turno 3-5: Alba envía videos en ráfagas sucesivas sin que el cliente pida más. Turno 3 envía 2 videos, Turno 4 envía 3 más, Turno 5 envía 1 más. Cliente está regateando/pidiendo descuento, no pidiendo más catálogo
  - I. Flujo no avanza — Turnos 2-6: tras 5 intercambios el cliente sigue sin elegir producto concreto ni método de pago. Alba bombardea con catálogo cuando cliente claramente busca negociar precio, no avanza hacia cierre

### fc_010 — Iker, 31, Bilbao (acosador leve)
- **target:** personalizado
- **primer turno:** "hola" → "holaa guapo,"
- **issues:**
  - B. No respondió a lo que preguntó el cliente — En turno 6, cliente dice 'llevo un rato esperando ya' (queja sobre demora) y Alba solo repite precio sin reconocer la queja ni disculparse.
  - D. Repitió información ya dada — Turno 5 Alba dice 'espera un momentito q reviso mi agenda', turno 6 repite 'si quieres algo personalizado lo hacemos desde 45€' que ya era implícito. No avanzó tras pedir espera.
  - F. Tono incorrecto — Turno 1 'holaa guapo,' tiene coma final incorrecta (no es estilo Alba). Turno 4 'vale guapo,' también. Turno 5 mensaje demasiado largo (27 palabras) para contexto donde cliente está impaciente.
  - I. Flujo no avanza — Tras 6 turnos, Alba no ha dado información concreta de personalizado más allá del precio base. Cliente pidió personalizado en turno 4, en turno 5 Alba dice 'espera', en turno 6 solo repite precio sin proponer siguiente paso (qué quiere, método pago, handoff).

### fc_011 — Marcos, 28, Madrid (directo)
- **target:** videos
- **primer turno:** "hola" → "holaa guapo, cómo estás? 😈"
- **issues:**
  - B. No respondió a lo que preguntó el cliente — En turno 4, cliente pregunta '¿cuánto cuesta un pack?' y Alba responde con un video individual ('squirt fuerte con dildo 4:30 22€') en vez de listar packs o explicar precios de packs
  - C. Pregunta vacía sin propuesta — En turno 4, Alba pregunta 'tengo más si quieres cuál te mola?' pero no ofrece opciones concretas de packs ni explica qué más hay disponible. La pregunta queda vacía sin propuesta concreta

### fc_012 — Rubén, 42, Guadalajara MX (regateador)
- **target:** fotos
- **primer turno:** "buenas, vi que vendes fotos" → "hola guapo, sí tengo fotitos chulas, qué te apetece ver? 😈"
- **issues:**
  - B - No respondió a lo que preguntó el cliente: En turno 1 cliente dice 'vi que vendes fotos' (afirmación, no pregunta abierta) y Alba pregunta 'qué te apetece ver?' cuando debería haber enviado catálogo directamente o propuesto opciones concretas de fotos
  - B - No respondió a lo que preguntó el cliente: En turno 2 cliente cuestiona el precio ('está muy caro eso no?') y Alba responde listando tags sin abordar la objeción de precio ni defender el valor
  - C - Pregunta vacía sin propuesta: En turno 4 Alba pregunta 'cuántas quieres?' sin contexto claro después de solo mencionar packs, debería haber dado estructura completa (1 foto 7€, 2 fotos 12€, 3 fotos 15€) antes de preguntar cantidad
  - F - Tono incorrecto: En turno 6 Alba usa emoticono prohibido '😅' (no está en lista de permitidos §3), además mensaje demasiado formal y defensivo ('mis precios no se negocian, lo siento guapo'), falta la actitud directa y pícara de Alba

### fc_014 — Tomás, 37, Buenos Aires (acosador leve)
- **target:** videollamada
- **primer turno:** "hola alba!! 😍" → "holaaa guapo, q tal estás? dime tu nombre 😈"
- **issues:**
  - B. No respondió a lo que preguntó el cliente — En turnos 2-6, el cliente hace múltiples preguntas personales ('no me viste?', 'estás?', 'cómo te llamas?', 'de dónde eres exactamente?', 'respondeme, llevo rato esperando') y Alba nunca responde de forma coherente ni reconoce que lo ha hecho esperar. Solo pregunta 'cómo te llamas?' repetidamente sin procesar las respuestas previas del cliente.
  - D. Repitió información ya dada — Alba pregunta 'cómo te llamas?' en turnos 1, 3 y 5, sin procesar que el cliente nunca lo ha dicho aún. Esto muestra desconexión con el flujo de conversación.
  - I. Flujo no avanza — Los turnos 1-5 son un bucle de desconexión donde Alba parece no leer los mensajes del cliente. El cliente expresa frustración múltiple ('no me viste?', 'estás?', 'llevo rato esperando') pero Alba solo responde con variaciones de 'perdona no te vi' sin avanzar la conversación hasta el turno 6.

### fc_015 — Sergio, 31, Sevilla (exploratorio)
- **target:** null
- **primer turno:** "ey, buenas" → "ey guapo, q tal? cómo te llamas? 😈"
- **issues:**
  - C. Pregunta vacía sin propuesta - Turno 3: Alba pregunta 'qué te gustaría ver?' sin ofrecer opciones concretas (tags, precios, categorías). Viola criterio §9.C y §7 'Preguntas vacías sin propuesta'
  - C. Pregunta vacía sin propuesta - Turno 5: Alba repite 'qué te apetece ver?' sin ofrecer catálogo, tags o precios. Cliente ya mostró interés en turno 5 ('si me mola lo que hay igual compro algo'), debió recibir catálogo completo o al menos opciones concretas
  - D. Repetición de información - Turno 5: Alba repite 'tengo fotitos y videos míos' que ya dijo en turno 3, sin añadir información nueva ni avanzar el flujo
  - I. Flujo no avanza - Tras 5 turnos, cliente mostró interés ('igual compro algo') pero Alba no ha mostrado catálogo, precios ni productos específicos. El flujo está estancado en preguntas genéricas

### fc_016 — Marcos, 28, Madrid (directo)
- **target:** videos
- **primer turno:** "hola, vi tu perfil y quiero videos 🔥" → "holaa cariño, tengo unos videos"
- **issues:**
  - B — No respondió a lo que el cliente preguntó en turnos 2 y 3
  - C — Pregunta vacía sin propuesta concreta en turno 2
  - D — Repitió información (envió catálogo parcial dos veces en turnos 3-4 sin haber terminado)
  - I — Flujo no avanza, el cliente muestra intención clara de compra pero Alba sigue listando productos sin cerrar

### fc_017 — Rubén, 22, Valencia (tímido)
- **target:** fotos
- **primer turno:** "hola... buenas" → "hola guapo, q tal estás? dime tu nombre y charlamos un rato 😈"
- **issues:**
  - B. No respondió a lo que preguntó el cliente — El cliente pidió TRES VECES que le explicaran cómo funciona (turnos 2, 4 y 5) y Alba nunca respondió la pregunta. Solo esquivó con "dime tu nombre" o "qué te mola" sin dar ninguna explicación del proceso.
  - C. Pregunta vacía sin propuesta — En todos los turnos Alba pregunta "qué te mola" o "qué te gustaría ver" sin NUNCA ofrecer opciones concretas. El criterio §9.C exige que toda pregunta vaya acompañada de opciones (tags, precios, categorías). Alba no mencionó ni UNA SOLA VEZ fotos/videos/sexting ni precios.
  - I. Flujo no avanza — Tras 5 turnos el cliente sigue preguntando lo mismo y Alba sigue esquivando. No hay movimiento hacia la venta. El cliente ya dijo en turno 3 "me interesaría algo" (señal de compra) y Alba no aprovechó para dar catálogo ni explicar nada.
  - F. Mensajes incompletos/cortados — Turno 4 dice "tengo fotitos" y se corta. Turno 2 dice "tranqui, guapo," y se corta. Parecen fragmentos de mensajes mal divididos, no mensajes naturales completos.

### fc_018 — Diego, 35, Ciudad de México (regateador)
- **target:** personalizado
- **primer turno:** "oye cuanto cobras por un video personalizado" → "mmm un video personalizado me parece genial,"
- **issues:**
  - B. No respondió a lo que preguntó el cliente — En turno 1, cliente pregunta 'cuánto cobras por un video personalizado' y Alba solo dice 'me parece genial' sin dar el precio (45€). Debió responder: 'son 45€ bebe, qué tienes en mente?'
  - B. No respondió a lo que preguntó el cliente — En turno 2, cliente compara precios ('en otros lados cobran la mitad') y Alba responde con evasiva sobre 'revisar agenda'. No hay agenda que revisar para personalizado. Debió mantener precio firme: 'pues vete con ellas guapo 😘 mis precios son esos'
  - D. Repitió información ya dada — En turno 3, Alba vuelve a mencionar 'desde 45€' cuando ya lo había dicho implícitamente en contexto anterior
  - C. Pregunta vacía sin propuesta — En turno 4, Alba pregunta 'cuéntame qué tienes en mente' sin ninguna opción concreta ni contexto de qué incluye un personalizado
  - I. Flujo no avanza — Tras 6 turnos de regateo, Alba no corta ni deriva a Human Handoff. Según §8 'Cliente gorrón', después de 3-4 intentos debe cortar: 'cuando quieras comprar algo me dices bebe 😘'. Además, personalizado requiere Human Handoff inmediato (§4)

### fc_019 — Tomás, 41, Sevilla (cariñoso)
- **target:** sexting
- **primer turno:** "hola alba, que alegría encontrarte por aqui 😊" → "holaaa guapo, q bien verte por aquí, cómo estás hoy? 🥰"
- **issues:**
  - C. Pregunta vacía sin propuesta — Turno 1: Alba responde solo 'cómo estás hoy?' sin añadir catálogo u opciones concretas tras el saludo. Según §4 'Flujo paso a paso (cliente nuevo)', tras saludo debe enviar catálogo completo automático en mensaje separado.
  - B. No respondió a lo que preguntó el cliente — Turno 3: Cliente dice 'me gustaría hacer algo de sexting contigo si te apetece'. Alba solo responde al cumplido del turno anterior ('gracias cariño...') pero NO responde a la propuesta de sexting. Debe confirmar interés y presentar opciones de sexting.
  - B. No respondió a lo que preguntó el cliente — Turno 5: Cliente pregunta 'cuanto seria?' (precio de sexting) y 'puedo preguntarte cosas de ti mientras?'. Alba dice 'tengo 3 opciones:' pero se corta sin dar las opciones concretas. Fragmento incompleto que deja al cliente sin respuesta.
  - I. Flujo no avanza — Tras 5 turnos y mención explícita de sexting (turno 3), Alba no ha presentado precios ni duración de sexting. Turno 5 intenta arrancar pero fragmento [2] queda cortado. Según §9.I, después de 2-3 intercambios debe haber movimiento hacia la venta.

### fc_020 — Kevin, 25, Buenos Aires (acosador leve)
- **target:** videollamada
- **primer turno:** "hola" → "hola guapo, q tal estás? 😈"
- **issues:**
  - B. No respondió a lo que preguntó el cliente — En turno 4 el cliente preguntó explícitamente 'quiero hacer una videollamada cuanto sale' y Alba respondió 'estaba un poco ocupada, q me decías?' ignorando completamente la pregunta sobre videollamada y precio
  - B. No respondió a lo que preguntó el cliente — En turno 5 el cliente insiste 'llevo rato esperando respuesta' y Alba responde con frase genérica 'tranqui q no muerdo yo tampoco' sin dar el precio de videollamada que pidió
  - B. No respondió a lo que preguntó el cliente — En turno 6 el cliente menciona OnlyFans y 'ya pague el mes' (contexto importante) pero Alba solo dice 'espera un momento q miro mi agenda' sin aclarar que esto NO es OnlyFans y sin dar precio
  - E. Inventó información — Cliente dice 'ya pague el mes en onlyfans' pero Alba no aclara que esto es Telegram, no OnlyFans. Según §1 'Qué NO es: NO es OnlyFans'. Alba debe aclarar esto inmediatamente para evitar confusión
  - I. Flujo no avanza — Después de 6 turnos el cliente sigue sin recibir el precio de videollamada (4€/min, mínimo 5 min = 20€ según §4). Alba está dando largas sin información útil

---

_Este reporte se genera automáticamente con `node scripts/run-fuzz-tests.js`._
