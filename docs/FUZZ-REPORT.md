# FUZZ REPORT v2

Generado: 2026-04-19T23:17:47.023Z
Dataset: 20 perfiles de `scripts/fake-clients.json`

## Resumen

- Pasaron: **1/20** (5.0%)
- Fallaron: 19

## Por arquetipo

| arquetipo | pass | rate |
|---|---|---|
| tímido | 0/4 | 0% |
| directo | 0/4 | 0% |
| regateador | 0/4 | 0% |
| cariñoso | 1/3 | 33% |
| acosador leve | 0/4 | 0% |
| exploratorio | 0/1 | 0% |

## Fallos detectados

### fc_001 — Marcos, 28, Madrid (tímido)
- **target:** fotos
- **primer turno:** "hola... no sé si esto funciona así jaja" → ""
- **issues:**
  - C. Pregunta vacía sin propuesta concreta — en turno 4 Alba pregunta 'qué buscas?' sin ofrecer NINGUNA opción específica (tags, precios, categorías). Según criterio §3 y §9C, si Alba pregunta debe acompañar con 2-3 opciones concretas, no preguntas vacías.
  - Regla I. Flujo no avanza — tras 4 turnos del cliente (donde expresa interés explícito en 'fotos' en turno 3), Alba no ha mostrado catálogo, precios, ni opciones. El flujo está estancado en validación emocional sin propuesta comercial. Según §4 y §9I, después de 2-3 intercambios debe haber movimiento hacia venta.

### fc_002 — Rodrigo, 41, Ciudad de México (directo)
- **target:** sexting
- **primer turno:** "buenas, quiero sexting en tiempo real cuánto cobras por 30 min" → "hola guapo, qué rico"
- **issues:**
  - B — No respondió a lo que preguntó el cliente: En turno 1 el cliente pregunta precio por 30 min de sexting. Alba solo responde 'hola guapo, qué rico' sin dar información sobre precios ni duración. Debió responder con las opciones de sexting (5, 10, 15 min) y sus precios según §15.
  - C — Pregunta vacía sin propuesta: Alba no ofrece ninguna opción concreta de duración ni precio durante toda la conversación. El cliente pidió 30 min (fuera de plantilla) y Alba nunca propuso las duraciones disponibles (5, 10, 15 min).
  - I — Flujo no avanza: Tras 3 turnos el cliente ha expresado interés claro (sexting, método de pago, disponibilidad) pero Alba no ha dado ni precios, ni opciones de duración, ni avanzado hacia cierre de venta. Solo respuestas genéricas ('me va perfecto cualquiera de las dos') sin contexto.
  - Turno 3 — Respuesta sin sentido: Alba dice 'me va perfecto cualquiera de las dos' cuando el cliente preguntó disponibilidad horaria ('hoy en la noche'). No hay coherencia con lo preguntado, parece respuesta a otra conversación.

### fc_003 — Toni, 23, Valencia (regateador)
- **target:** videos
- **primer turno:** "ey, cuanto cuestan los videos" → "holaa guapo,"
- **issues:**
  - B. No respondió a lo que preguntó el cliente — Turno 1: cliente preguntó 'cuánto cuestan los videos', Alba solo saludó sin dar catálogo ni precios
  - C. Pregunta vacía sin propuesta — Turno 2: 'cuéntame qué buscas' sin ofrecer lista de videos concretos ni precios
  - B. No respondió a lo que preguntó el cliente — Turno 2: cliente comparó precios con OnlyFans, Alba debió responder firme según criterio §8 'Cliente que compara precios' pero solo preguntó qué busca
  - D. Repitió información — Turno 5: cliente pregunta por descuento en pack, Alba dice 'no insistas' pero NO ofreció propuesta alternativa concreta (debió mencionar bonus o cerrar con catalogo concreto según §11)
  - I. Flujo no avanza — Tras 5 turnos, Alba NO ha mostrado catálogo de videos, NO ha dado precios concretos, conversación estancada en small talk defensivo sin propuesta

### fc_005 — Iván, 31, Bilbao (acosador leve)
- **target:** videollamada
- **primer turno:** "hola" → "holaa otra vez, ya estoy contigo, qué necesitas, cariño? 😈"
- **issues:**
  - B - No respondió a lo que preguntó el cliente. En turno 4 el cliente pregunta directamente '¿haces videollamadas privadas?' y Alba responde 'cariño, qué pasa, dime? 😈' ignorando completamente la pregunta explícita.
  - I - El flujo no avanza. Tras 6 turnos el cliente ha preguntado algo concreto (videollamadas) y mostrado disposición a pagar, pero Alba no ha dado respuesta útil ni propuesto nada. Se queda en 'espera' y mensajes vagos sin mover hacia la venta.
  - B - En turno 6 el cliente está frustrado y ofrece pagar 'lo que sea' pero Alba sigue sin responder a la pregunta original sobre videollamadas, solo dice 'que me ha llegado algo 😅' (posible confusión con pago que no existe).

### fc_006 — Marcos, 28, Madrid (tímido)
- **target:** fotos
- **primer turno:** "hola, buenas" → "hola guapo,"
- **issues:**
  - C - Pregunta vacía sin propuesta: En turno 2 pregunta '¿cómo te llamas?' sin ofrecer opciones de productos ni contexto de venta
  - C - Pregunta vacía sin propuesta: En turno 4 pregunta 'qué te apetece?' sin listar opciones concretas (fotos sueltas, packs, tags)
  - C - Pregunta vacía sin propuesta: En turno 5 pregunta 'qué te gustaría ver?' sin proponer opciones específicas de fotos
  - B - No respondió a lo que preguntó el cliente: En turno 2 el cliente pregunta si aquí se puede ver contenido de Alba, ella responde con pregunta personal ('cómo te llamas?') sin confirmar ni explicar nada
  - B - No respondió a lo que preguntó el cliente: En turno 3 el cliente dice 'no sé cómo funciona esto', Alba responde 'estás en el sitio correcto' pero NO explica cómo funciona ni qué ofrece
  - I - Flujo no avanza: 5 turnos sin proponer productos concretos, precios ni catálogo. Solo preguntas genéricas que no llevan a ninguna parte

### fc_007 — Rodrigo, 41, Guadalajara MX (directo)
- **target:** sexting
- **primer turno:** "cuánto cuesta el sexting con alba" → "hola guapo,"
- **issues:**
  - B — No respondió a lo que preguntó el cliente en turnos 1 y 3
  - C — Respuestas vacías sin propuesta concreta (turnos 2 y 3)
  - I — Flujo no avanza: 3 turnos sin dar precio ni opciones de sexting

### fc_008 — Toni, 23, Valencia (regateador)
- **target:** videos
- **primer turno:** "ey qué hay" → "holaa guapo, cómo estás? 😈"
- **issues:**
  - C. Pregunta vacía sin propuesta — Turno 3: Alba pregunta 'qué te gustaría ver?' sin ofrecer opciones concretas (lista de videos, packs, categorías). Regla C del §9 del criterio: 'si preguntas, SIEMPRE acompañado de 2-3 opciones concretas'
  - B. No respondió a lo que preguntó el cliente — Turno 2: Cliente pregunta 'a cuánto están los vídeos', Alba responde 'depende de lo q buscas' sin dar precios ni opciones concretas. Debe listar videos con precios (modelo antiguo) o mostrar catálogo nuevo según §15
  - I. Flujo no avanza — Tras 6 turnos (12 mensajes contando ráfagas) no hay propuesta concreta de productos ni precios. Cliente muestra interés en videos desde turno 2, pero Alba solo da evasivas sin mostrar catálogo ni opciones reales
  - G. Primera persona incorrecta — Turno 5: 'lo mío tiene su precio' podría interpretarse como correcto, pero el contexto general muestra falta de asertividad en primera persona (no dice 'vendo videos de X, Y, Z')

### fc_009 — Ernesto, 55, Sevilla (cariñoso)
- **target:** charla
- **primer turno:** "hola alba, espero que estés teniendo un buen día 😊" → "hola guapo,"
- **issues:**
  - evaluator_parse_error

### fc_010 — Iker, 31, Bilbao (acosador leve)
- **target:** personalizado
- **primer turno:** "hola" → "holaa guapo, qué tal estás? 😈"
- **issues:**
  - B. No respondió a lo que preguntó el cliente — En turno 4, el cliente dice 'mira solo quiero pedir un vídeo personalizado', pero Alba responde 'claro q te leo cariño' sin conectar con la solicitud concreta. Debió decir algo como 'vale bebe, personalizados desde 45€, qué quieres que te grabe?'
  - D. Repitió información ya dada — En turno 5, Alba dice 'espera un momentito q miro mi agenda', pero en turno 6 ya responde con precio sin haber esperado tiempo real. Inconsistencia: no debió prometer 'mirar agenda' si iba a responder inmediatamente después.
  - I. Flujo no avanza — En turnos 1-3, Alba hace small talk sin dirección ('qué tal estás?', 'estoy aquí, qué pasa?') cuando el cliente desde turno 2 muestra impaciencia ('hola??', 'oye q no lees'). Debió captar urgencia y proponer catálogo antes.

### fc_011 — Marcos, 28, Madrid (directo)
- **target:** videos
- **primer turno:** "hola" → "holaa guapo, q tal estás? 😈"
- **issues:**
  - B — No respondió a lo que preguntó el cliente: en Turno 4 el cliente pregunta '¿cuánto cuesta un pack?' y Alba responde con UN VIDEO MÁS en vez de explicar qué packs tiene o sus precios
  - D — Repitió/añadió información no solicitada: cliente preguntó por PACKS, Alba sigue listando videos individuales sin transicionar al catálogo de packs
  - E — Posible invención de contenido: en Turno 4 aparece 'squirt fuerte con dildo 4:30 22€' que NO fue mencionado en Turno 2 ni Turno 3. Si este video existe en products.json está bien, pero la respuesta sugiere que Alba lo inventó sobre la marcha en vez de listar desde el catálogo completo desde el principio

### fc_012 — Rubén, 42, Guadalajara MX (regateador)
- **target:** fotos
- **primer turno:** "buenas, vi que vendes fotos" → "hola guapo, sí tengo fotitos interesantes, qué buscas? 😈"
- **issues:**
  - B. No respondió a lo que preguntó el cliente — Turno 2: cliente dice 'está muy caro', Alba responde solo con lista de tags sin contexto de precio. Cliente no preguntó qué tipo de fotos, expresó objeción al precio.
  - C. Pregunta vacía sin propuesta — Turno 4: Alba dice 'cuántas quieres?' después de dar precios, pero la pregunta llega tarde y desconectada del flujo (cliente está regateando, no eligiendo cantidad).
  - F. Tono incorrecto — Turno 4: Alba dice 'o tengo packs desde 12€' en mensaje separado del anterior ('1 foto... 3 fotos 15€'), rompiendo atomicidad. Debió unificar la oferta de fotos sueltas + packs en una sola ráfaga.
  - I. Flujo no avanza — Turnos 5-6: después de rechazar el regateo correctamente ('mis precios no bajan'), Alba no cierra con propuesta concreta ni alternativa. Dice 'si te mola algo... lo arreglamos' (vago) sin retomar las opciones específicas (1 foto 7€, pack 12€, etc.).

### fc_013 — David, 23, Valencia (tímido)
- **target:** sexting
- **primer turno:** "hola, perdona que moleste" → "hola guapo,"
- **issues:**
  - B. No respondió a lo que preguntó el cliente — El cliente pidió SEXTING ('chatear'), pero Alba nunca mencionó ni precios ni opciones de sexting. Solo dijo que le encanta la idea pero no dio información de producto.
  - I. Flujo no avanza — Tras 4 turnos el cliente ya expresó interés en sexting y Alba solo responde con frases coquetas pero NO propone el servicio concreto ni precios ni opciones (5/10/15 min, 15€/30€/45€).

### fc_014 — Tomás, 37, Buenos Aires (acosador leve)
- **target:** videollamada
- **primer turno:** "hola alba!! 😍" → "holaaa cariño,"
- **issues:**
  - B — No respondió a lo que preguntó el cliente: En turno 4 el cliente pregunta 'cuanto cobras' para videollamada y Alba responde 'no te vi antes, ya estoy aquí pa ti 😅 cómo te llamas?' sin responder el precio ni reconocer la solicitud de videollamada
  - B — No respondió a lo que preguntó el cliente: En turno 5 el cliente pregunta de dónde es exactamente y Alba dice 'uf espera' sin responder. En turno 6 el cliente insiste pidiendo respuesta y Alba dice 'que me ha llegado algo 😅' evadiendo completamente
  - I — El flujo no avanza: Después de 6 turnos Alba sigue sin proponer nada concreto sobre videollamada (que es lo que el cliente busca). Solo pregunta nombre repetidamente y evade. No hay progreso hacia venta
  - D — Repitió información ya dada: Alba pregunta 'cómo te llamas?' en turno 2 y vuelve a preguntar en turno 4, ignorando que ya lo había preguntado

### fc_015 — Sergio, 31, Sevilla (exploratorio)
- **target:** null
- **primer turno:** "ey, buenas" → "ey guapo, q tal? cómo te llamas? 😈"
- **issues:**
  - C - Pregunta vacía sin propuesta: En turno 3 Alba dice 'qué te gustaría ver?' sin dar opciones concretas (fotos/videos con tags, precios, o catálogo). Mismo problema en turno 5 'qué te apetece ver?' sin opciones.
  - B - No respondió a lo que preguntó el cliente: En turno 2 el cliente dice 'no sé cómo funciona esto' y Alba solo dice 'no te preocupes cariño' sin explicar nada. Debió explicar el flujo básico (eliges producto → pagas → te lo mando).
  - D - Repitió información: Turno 5 repite casi textual lo de turno 3 ('tengo fotitos y videos míos... qué te apetece ver'). Si ya lo dijo en turno 3, en turno 5 debió dar el catálogo concreto o proponer opciones.

### fc_016 — Marcos, 28, Madrid (directo)
- **target:** videos
- **primer turno:** "hola, vi tu perfil y quiero videos 🔥" → "holaa bebe, tengo videos"
- **issues:**
  - B. No respondió a lo que preguntó el cliente — Turno 2: cliente pregunta 'tienes algo explícito ya grabado o solo bajo pedido?' y Alba responde con pregunta genérica sin aclarar que SÍ tiene videos grabados listos
  - C. Pregunta vacía sin propuesta — Turno 2: 'qué te apetece ver?' sin listar opciones concretas de videos en ese mismo fragmento
  - B. No respondió a lo que preguntó el cliente — Turno 3: cliente pide 'pack de videos de 10 mins aprox' (quiere bundle/duración total) y Alba lista videos individuales sin agrupar ni calcular total
  - B. No respondió a lo que preguntó el cliente — Turno 4: cliente dice 'si el precio es razonable pago ahora' (muestra intención de compra inmediata) y Alba sigue listando más productos sin confirmar precio de lo ya mostrado ni proponer cerrar venta

### fc_017 — Rubén, 22, Valencia (tímido)
- **target:** fotos
- **primer turno:** "hola... buenas" → "hola guapo, cómo estás? dime tu nombre y hablamos un ratito 😈"
- **issues:**
  - B - No respondió a lo que preguntó el cliente: En turno 2, cliente dice 'no sé cómo funciona esto', Alba dice 'no pasa nada guapo' sin explicar nada. En turno 4, cliente pregunta 'no sé si es muy caro o cómo va el tema', Alba responde 'tranqui guapo tengo fotitos' sin dar precios. En turno 5, cliente pide explícitamente 'puedes explicarme un poco cómo funciona?', Alba NO explica, solo pide nombre y estilo.
  - I - Flujo no avanza: 5 turnos completos y Alba aún no ha dado el catálogo ni precios concretos. Cliente preguntó 3 veces cómo funciona/precios y sigue sin información útil. Cliente muestra interés directo ('me interesaría algo', 'cómo va el tema', 'explícame cómo funciona') pero Alba solo pide nombre repetidamente sin dar lo que pide.
  - D - Repite información ya dada: Alba pide 'dime tu nombre' en turno 1, turno 3 y turno 5. Tres veces la misma pregunta cuando el cliente claramente no quiere dar su nombre y solo busca información sobre el servicio.

### fc_018 — Diego, 35, Ciudad de México (regateador)
- **target:** personalizado
- **primer turno:** "oye cuanto cobras por un video personalizado" → "uy, un video personalizado suena genial,"
- **issues:**
  - B — No respondió a lo que preguntó el cliente: En turno 1, cliente pregunta 'cuanto cobras por un video personalizado' y Alba responde 'uy, un video personalizado suena genial,' sin dar el precio (45€). Debió responder directamente 'desde 45€ bebe, cuéntame qué quieres'.
  - B — No respondió a lo que preguntó el cliente: En turno 2, cliente dice 'en otros lados cobran la mitad' (regateo) y Alba responde 'dame un segundito q miro mi agenda' (¿agenda para qué? no tiene sentido, parece excusa). Debió mantener precio firme: 'pues vete con ellos guapo 😘 mis precios son esos'.
  - C — Pregunta vacía sin propuesta: En turno 4, Alba dice 'cuéntame qué tienes en mente' sin ofrecer opciones concretas de qué incluye un personalizado ni mencionar que deriva a human handoff. Debió dar contexto: 'personalizado desde 45€, depende de lo que quieras, dime qué te mola y te digo'.
  - I — Flujo no avanza: Después de 6 turnos el cliente sigue regateando y Alba no cierra ni deriva. Debió cortar en turno 5-6: 'si no tienes 45€ no pasa nada bebe, mira mis videos desde 5€ o fotos desde 7€' (proponer alternativa) o 'cuando tengas el dinero me dices 😘' (corte educado).

### fc_019 — Tomás, 41, Sevilla (cariñoso)
- **target:** sexting
- **primer turno:** "hola alba, que alegría encontrarte por aqui 😊" → "holaaa cariño, q gusto verte, cómo estás hoy? 🥰"
- **issues:**
  - B — No respondió a lo que preguntó el cliente: En turno 2 el cliente hace un cumplido y Alba solo dice 'gracias guapo,' (mensaje incompleto). En turno 3 el cliente propone sexting y Alba responde sobre el cumplido anterior, no sobre la propuesta de sexting. En turno 4 el cliente expresa preferencia y Alba dice 'claro q sí cariño,' sin contenido real. En turno 5 el cliente pregunta EXPLÍCITAMENTE el precio ('cuanto seria?') y si puede charlar durante, y Alba NO responde ninguna de las dos preguntas, solo da frase genérica motivacional.
  - C — Pregunta vacía sin propuesta: En turno 5, tras pregunta directa de precio, Alba debería haber dado las 3 opciones de sexting (5min 15€, 10min 30€, 15min 45€ según §15) pero no propuso nada concreto.
  - F — Tono incorrecto: Múltiples mensajes incompletos que parecen cortados ('gracias guapo,', 'claro q sí cariño,'). Esto rompe la naturalidad y parece bug técnico. Además, en turno 5 usa frase motivacional genérica ('va a ser increíble 😈') que suena a bot de autoayuda, no a Alba vendiendo.
  - I — Flujo no avanza: Después de 5 turnos donde el cliente ya propuso sexting Y preguntó precio explícitamente, Alba NO ha dado ni una sola opción de producto ni precio. El flujo está completamente estancado en respuestas emocionales sin acción comercial.

### fc_020 — Kevin, 25, Buenos Aires (acosador leve)
- **target:** videollamada
- **primer turno:** "hola" → "hola guapo, cómo estás hoy? 😈"
- **issues:**
  - B. No respondió a lo que preguntó el cliente — En turno 4 el cliente pregunta 'quiero hacer una videollamada cuanto sale' y Alba responde 'estaba liada, qué me contabas?' ignorando completamente la pregunta específica sobre videollamada y precio
  - B. No respondió a lo que preguntó el cliente — En turno 6 el cliente insiste 'ya pague el mes en onlyfans y quiero mas' y Alba sigue sin dar precio ni información sobre videollamada, solo dice 'miro mi agenda'
  - I. Flujo no avanza — Después de 6 turnos el cliente ha preguntado EXPLÍCITAMENTE por videollamada y precio, y Alba nunca ha dado ni precio (4€/min mínimo 5 min = 20€) ni propuesta concreta. El flujo está estancado en excusas
  - H. Violó límite duro — Cliente menciona 'ya pague el mes en onlyfans' lo cual es IMPOSIBLE porque según §1 'NO es OnlyFans. No hay suscripción'. Alba debería haber aclarado que esto es Telegram, no OnlyFans, no dejar pasar esa información falsa

---

_Este reporte se genera automáticamente con `node scripts/run-fuzz-tests.js`._
