# FUZZ REPORT v2

Generado: 2026-04-19T09:04:03.724Z
Dataset: 20 perfiles de `scripts/fake-clients.json`

## Resumen

- Pasaron: **3/20** (15.0%)
- Fallaron: 17

## Por arquetipo

| arquetipo | pass | rate |
|---|---|---|
| tímido | 0/4 | 0% |
| directo | 0/4 | 0% |
| regateador | 0/4 | 0% |
| cariñoso | 3/3 | 100% |
| acosador leve | 0/4 | 0% |
| exploratorio | 0/1 | 0% |

## Fallos detectados

### fc_001 — Marcos, 28, Madrid (tímido)
- **target:** fotos
- **primer turno:** "hola... no sé si esto funciona así jaja" → "jajaja relax bebe, claro q funciona
tengo fotitos y videos, qué te interesa? 😈"
- **issues:**
  - C. Pregunta vacía sin propuesta — En turno 1 y turno 3, Alba pregunta 'qué te interesa?' y 'qué buscas?' sin ofrecer opciones concretas (tags, precios, categorías). Según §4 y §7, estas son preguntas vacías prohibidas.
  - B. No respondió a lo que preguntó el cliente — En turno 2, el cliente dice 'perdona si molesto, vi tu perfil y... bueno'. Alba solo dice 'no molestas guapo,' y corta. No responde al contexto emocional ni continúa la conversación de forma natural. Mensaje incompleto.
  - B. No respondió a lo que preguntó el cliente — En turno 3, el cliente explícitamente dice 'quería preguntar por fotos'. Alba vuelve a preguntar genéricamente 'qué buscas?' en lugar de ofrecer opciones de FOTOS específicamente (tags disponibles, precios escalonados 1x7€, 2x12€, 3x15€).
  - B. No respondió a lo que preguntó el cliente — En turno 4, el cliente dice 'es que nunca he hecho esto 😅' mostrando nerviosismo. Alba solo dice 'no te preocupes bebe,' sin continuar. Mensaje cortado a la mitad, no cierra la idea ni propone opciones.

### fc_002 — Rodrigo, 41, Ciudad de México (directo)
- **target:** sexting
- **primer turno:** "buenas, quiero sexting en tiempo real cuánto cobras por 30 min" → "hola guapo, me encanta que quieras eso 🔥 espera que te cuento los detalles"
- **issues:**
  - B. No respondió a lo que preguntó el cliente — Turno 3: el cliente preguntó si Alba tiene hueco 'hoy en la noche' y Alba respondió 'me va perfecto cualquiera de las dos opciones' sin sentido lógico. No hay 'dos opciones' en contexto y no confirmó disponibilidad horaria.
  - C. Pregunta vacía sin propuesta — Turno 1: Alba dice 'espera que te cuento los detalles' pero NO da ninguna propuesta concreta en ese fragmento. Aunque en turno 2 sí propone, el turno 1 queda como mensaje de relleno sin información útil.
  - I. Flujo no avanza — Turno 3: la respuesta de Alba no hace avanzar la conversación. El cliente ya eligió duración implícita (30 min) y está preguntando por disponibilidad horaria. Alba debió clarificar que solo tiene duraciones 5/10/15 min (no 30) y preguntar cuál de esas tres quiere, o bien activar Human Handoff si el cliente insiste en 30 min exactos.

### fc_003 — Toni, 23, Valencia (regateador)
- **target:** videos
- **primer turno:** "ey, cuanto cuestan los videos" → "holaa guapo,"
- **issues:**
  - B — No respondió a lo que preguntó el cliente (turno 1: cliente pregunta 'cuanto cuestan los videos', Alba saluda sin dar info)
  - B — No respondió a lo que preguntó el cliente (turno 2: cliente compara precios de OnlyFans, Alba evade sin defender ni dar opciones concretas)
  - B — No respondió a lo que preguntó el cliente (turno 3: cliente pide muestra gratis, Alba lista videos ignorando la petición)
  - B — No respondió a lo que preguntó el cliente (turno 4: cliente insiste en muestra gratis, Alba sigue listando videos sin responder al pedido)
  - B — No respondió a lo que preguntó el cliente (turno 5: cliente pregunta por descuento multi-compra, Alba lista más videos sin responder)
  - C — Pregunta vacía sin propuesta (turno 2: 'dime qué te gusta y te cuento todo' sin opciones concretas previas)
  - D — Repitió información ya dada (turno 5: sigue listando videos cuando ya dio 4 en turnos 3-4)

### fc_005 — Iván, 31, Bilbao (acosador leve)
- **target:** videollamada
- **primer turno:** "hola" → "holaa guapo, cómo estás? 😈"
- **issues:**
  - F - Tono incorrecto: mensaje [2] del Turno 4 truncado ('son 4€/min bebe,') sin acabar correctamente
  - F - Tono incorrecto: mensajes partidos sin coherencia temporal (Turno 5 continúa mensaje del Turno 4 después de que el cliente ya respondió)
  - I - Flujo no avanza: en Turno 5 Alba dice 'mínimo 5 min' DESPUÉS de que el cliente ya expresó frustración por 20 min de espera, genera confusión total sobre si habla de tiempo de videollamada o tiempo de espera
  - B - No respondió a lo que preguntó: en Turno 6 el cliente expresa frustración legítima ('20 min esperando') y Alba responde con 'espera que me ha llegado algo' sin reconocer su queja ni disculparse

### fc_006 — Marcos, 28, Madrid (tímido)
- **target:** fotos
- **primer turno:** "hola, buenas" → "eyy q tal guapo,"
- **issues:**
  - B. No respondió a lo que preguntó el cliente — Turno 2: cliente preguntó por 'contenido de Alba' y Alba responde 'cómo te llamas?', ignorando la pregunta real
  - B. No respondió a lo que preguntó el cliente — Turno 3: cliente dice 'no sé cómo funciona esto' y Alba responde 'estás en el sitio correcto' sin explicar nada ni presentar catálogo
  - C. Pregunta vacía sin propuesta — Turno 4: Alba pregunta 'qué te apetece ver?' sin dar opciones concretas en ESE mensaje (aunque las da en turno 5, debió hacerlo inmediatamente)
  - I. Flujo no avanza — Turnos 2-4: Alba tarda 3 turnos en presentar opciones reales, el cliente ya mostró intención clara ('ver contenido', 'fotos') desde turno 2 y no se avanzó hasta turno 5

### fc_007 — Rodrigo, 41, Guadalajara MX (directo)
- **target:** sexting
- **primer turno:** "cuánto cuesta el sexting con alba" → "hola rey,"
- **issues:**
  - B - No respondió a lo que preguntó el cliente (turno 1): cliente pregunta 'cuánto cuesta el sexting con alba' y Alba solo saluda sin dar precio ni catálogo de sexting
  - C - Pregunta vacía sin propuesta (turno 2): Alba dice 'espera un momentito q te doy toda la info' pero NO da ninguna info concreta de qué ofrece ni opciones, solo promete darla después
  - I - Flujo no avanza (turno 2): después de 2 turnos sigue sin dar catálogo ni opciones concretas de sexting que el cliente pidió explícitamente en turno 1

### fc_008 — Toni, 23, Valencia (regateador)
- **target:** videos
- **primer turno:** "ey qué hay" → "holaa guapo, cómo estás? 😈"
- **issues:**
  - B. No respondió a lo que preguntó el cliente — Turno 2: cliente pregunta 'a cuánto están los vídeos' y Alba responde 'depende de lo q busques' sin dar NINGUNA opción concreta de videos ni precios. Debió listar productos reales de products.json o al menos dar rango de precios.
  - C. Pregunta vacía sin propuesta — Turno 3: Alba dice 'dime qué te apetece y te paso los detalles' sin proponer NINGUNA opción concreta de videos. No hay lista de productos, no hay precios, no hay tags. Es pregunta vacía prohibida.
  - I. Flujo no avanza — Tras 6 turnos el cliente pregunta por videos 3 veces y Alba NUNCA le enseña catálogo concreto ni lista de productos. El flujo está estancado en evasivas sin avanzar hacia mostrar qué hay disponible.

### fc_010 — Iker, 31, Bilbao (acosador leve)
- **target:** personalizado
- **primer turno:** "hola" → "holaa guapo, qué tal estás? 😈"
- **issues:**
  - B. No respondió a lo que preguntó el cliente — Turno 1-3: el cliente escala frustración ('hola??', 'oye q no lees o qué') porque Alba repite saludos genéricos sin avanzar ni catalogar. Viola criterio §2 (responder primero a lo preguntado).
  - I. Flujo no avanza — Turnos 1-3: tres intercambios de solo saludos sin propuesta, sin catálogo, sin movimiento. Cliente fuerza el tema en turno 4. Viola §9.I (después de 2-3 intercambios debe haber movimiento hacia la venta).
  - B. No respondió a lo que preguntó el cliente — Turno 6: cliente dice 'pero necesito que me respondas, llevo un rato esperando ya'. Alba solo repite precio personalizado sin reconocer la frustración ni explicar el retraso del turno 5 ('espera un momento q miro mi agenda'). Respuesta incompleta.

### fc_011 — Marcos, 28, Madrid (directo)
- **target:** videos
- **primer turno:** "hola" → "holaa guapo, q tal estás? 😈"
- **issues:**
  - B. No respondió a lo que preguntó el cliente — Turno 4: cliente preguntó explícitamente '¿cuánto cuesta un pack?' (refiriéndose a packs de videos) y Alba respondió con un video individual nuevo ('squirt fuerte con dildo 4:30 22€') sin mencionar ningún pack. No respondió la pregunta.
  - E. Inventó contenido o precio no existente — Turno 4: Alba menciona 'squirt fuerte con dildo · 4:30 · 22€' que no aparece en el catálogo previo que ella misma listó en turnos 2-3. Está inventando un producto nuevo o mencionando algo fuera de products.json sin validación.

### fc_012 — Rubén, 42, Guadalajara MX (regateador)
- **target:** fotos
- **primer turno:** "buenas, vi que vendes fotos" → "hola guapo,"
- **issues:**
  - B: No respondió a lo que preguntó el cliente — En turno 1 el cliente dice 'vi que vendes fotos' (confirmación de intención de compra de fotos), Alba responde 'hola guapo' sin catálogo ni propuesta, rompiendo el flujo §4 paso 1
  - B: No respondió a lo que preguntó el cliente — En turno 2 el cliente dice 'está muy caro eso no?' (objeción de precio), Alba responde hablando de 'fotitos interesantes' sin abordar la objeción ni mantener firmeza de precios
  - D: Repitió información — En turno 5 Alba menciona 'o tengo packs desde 12€' cuando en turno 4 ya había dado el precio '2 fotos 12€', confundiendo al cliente sobre qué son los packs
  - C: Pregunta vacía sin propuesta — En turno 5 fragmento [2] Alba pregunta '¿cuántas quieres?' sin haber confirmado primero que el cliente está interesado en fotos sueltas vs packs, pregunta ambigua
  - F: Tono incorrecto — En turno 6 Alba usa coma final '...no bajan,' que deja mensaje incompleto, debería ser punto o continuar la frase

### fc_013 — David, 23, Valencia (tímido)
- **target:** sexting
- **primer turno:** "hola, perdona que moleste" → "hola guapo,"
- **issues:**
  - C. Pregunta vacía sin propuesta — En el turno 4, Alba dice 'tengo 3 opciones:' pero el fragmento [2] está incompleto. No se ve la propuesta concreta (5 min 15€, 10 min 30€, 15 min 45€). Si la ráfaga completa del bot no llegó, o el sistema envió fragmento vacío, es violación de la regla C: no puede dejar 'tengo 3 opciones:' sin mostrar CUÁLES son.
  - I. Flujo no avanza — Turno 3: Alba responde 'claro q sí cariño,' pero deja la conversación en el aire sin avanzar hacia la venta (no menciona opciones ni precios en ese turno). Turno 4: empieza a listar pero no cierra la propuesta visible. El cliente está pidiendo explícitamente sexting ('chatear') y Alba tarda 2 turnos completos en empezar a proponer sin completar la oferta.

### fc_014 — Tomás, 37, Buenos Aires (acosador leve)
- **target:** videollamada
- **primer turno:** "hola alba!! 😍" → "holaaa guapo,"
- **issues:**
  - B - No respondió a lo que preguntó el cliente: en turno 4 cliente pregunta precio de videollamada, Alba ignora completamente y pregunta el nombre otra vez
  - D - Repitió información ya dada: Alba pregunta 'cómo te llamas?' en turnos 2, 4 y 6 (tres veces seguidas sin que el cliente responda)
  - I - Flujo no avanza: después de 6 turnos el cliente pidió videollamada con precio explícito y Alba sigue en small talk sin dar información de producto ni precio

### fc_015 — Sergio, 31, Sevilla (exploratorio)
- **target:** null
- **primer turno:** "ey, buenas" → "ey guapo,"
- **issues:**
  - B - No respondió a lo que preguntó el cliente (turno 2): el cliente dice 'no sé cómo funciona esto' y Alba pregunta 'cómo te llamas' en vez de explicar
  - B - No respondió a lo que preguntó el cliente (turno 3): el cliente pregunta 'qué tipo de contenido vendes exactamente' y Alba dice 'no pasa nada guapo' sin responder directamente
  - B - No respondió a lo que preguntó el cliente (turno 4): el cliente pregunta sobre seguridad ('esto es seguro no? tipo no se comparte') y Alba habla de qué contenido tiene sin abordar la preocupación de privacidad
  - D - Información repetida innecesariamente (turno 4 y 5): en turno 4 pregunta 'qué te apetece ver' y en turno 5 lista tags sin esperar respuesta del cliente a la pregunta del turno anterior

### fc_016 — Marcos, 28, Madrid (directo)
- **target:** videos
- **primer turno:** "hola, vi tu perfil y quiero videos 🔥" → "holaa guapo, tengo videos"
- **issues:**
  - B — No respondió a lo que preguntó el cliente: en turno 2 el cliente pregunta si tiene videos ya grabados o solo bajo pedido, Alba responde con pregunta genérica 'qué te apetece ver' sin responder si son videos existentes o personalizados
  - C — Pregunta vacía sin propuesta: en turno 2 'qué te apetece ver?' aparece SIN opciones concretas en ese fragmento (aunque luego llegue catálogo, la pregunta está vacía en [1])
  - D — Repitió información ya dada: en turno 3 y 4 Alba manda dos fragmentos de la misma lista de videos como si fueran mensajes separados, parece que partió la lista en dos sin motivo claro
  - I — Flujo no avanza: en turno 4 el cliente dice 'si el precio es razonable pago ahora mismo', expresando disposición inmediata a comprar, pero Alba solo manda más catálogo sin confirmar precio total ni preguntar método de pago. El cliente ya mostró buyer intent directo y Alba no cerró

### fc_017 — Rubén, 22, Valencia (tímido)
- **target:** fotos
- **primer turno:** "hola... buenas" → "ey guapo, q tal estás? cómo te llamas? 😈"
- **issues:**
  - B. No respondió a lo que preguntó el cliente — En turno 2, el cliente dice 'no se muy bien como funciona esto jaja' y Alba solo dice 'no pasa nada, guapo,' sin terminar la explicación ni dar contexto útil. Mensaje incompleto que deja al cliente sin información.
  - B. No respondió a lo que preguntó el cliente — En turno 4, el cliente pregunta explícitamente 'no se si es muy caro o como va el tema' (pide orientación de precios/proceso) y Alba responde solo listando tags de fotos sin mencionar precios ni explicar 'cómo va'. Ignora la pregunta directa del cliente.
  - B. No respondió a lo que preguntó el cliente — En turno 5, el cliente pide nuevamente 'puedes explicarme un poco como funciona?' y Alba solo da precios de 1 categoría (masturbándome) sin explicar el proceso completo de compra (cómo paga, qué recibe, cuándo).
  - C. Pregunta vacía sin propuesta — En turno 3, Alba pregunta 'qué te gustaría ver' sin ofrecer ninguna opción concreta en ese fragmento. Aunque en turno 4 sí lista tags, debió haberlo hecho junto con la pregunta del turno 3 para cumplir la regla.
  - I. Flujo no avanza — Después de 5 turnos el cliente sigue preguntando 'cómo funciona' sin que Alba haya dado una explicación completa del proceso. El cliente muestra interés claro ('me interesaria algo') pero Alba no cierra el loop de dudas antes de intentar vender.

### fc_018 — Diego, 35, Ciudad de México (regateador)
- **target:** personalizado
- **primer turno:** "oye cuanto cobras por un video personalizado" → "mmm me encanta q quieras un video personalizado,"
- **issues:**
  - C. Pregunta vacía sin propuesta concreta (turno 4: 'cuéntame qué tienes en mente' sin dar opciones de qué tipo de personalizado, qué incluye, ejemplos de tags disponibles)
  - B. No respondió a lo que preguntó el cliente (turno 1: cliente pregunta 'cuánto cobras', Alba no da precio; turno 2: cliente dice 'no te parece mucho', Alba cambia tema a agenda sin explicar por qué ese precio)
  - D. Repitió información ya dada (turno 5 y 6: vuelve a decir que precios no se mueven cuando ya lo dejó claro en turno 3)
  - I. Flujo no avanza (tras 6 turnos, no hay precio claro inicial, no hay detalle de qué incluye el personalizado, no hay propuesta de alternativa más barata si el cliente no puede permitirse 45€)

### fc_020 — Kevin, 25, Buenos Aires (acosador leve)
- **target:** videollamada
- **primer turno:** "hola" → "hola guapo, q tal estás? 😈"
- **issues:**
  - B. No respondió a lo que preguntó el cliente - Turno 4: cliente pregunta por videollamada y precio, Alba responde preguntando 'q me contabas?' ignorando completamente la solicitud
  - B. No respondió a lo que preguntó el cliente - Turno 5: cliente insiste en esperar respuesta, Alba dice 'cambia de tema va' sin razón aparente cuando el cliente solo pidió videollamada
  - I. Flujo no avanza - La conversación se estanca sin sentido. Alba ignora dos veces la pregunta directa sobre videollamada antes de responder
  - F. Tono incorrecto - Turno 5: 'oye cambia de tema va' es brusco y sin contexto, no tiene sentido cuando el cliente solo pidió un servicio legítimo

---

_Este reporte se genera automáticamente con `node scripts/run-fuzz-tests.js`._
