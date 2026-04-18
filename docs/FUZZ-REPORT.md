# FUZZ REPORT v2

Generado: 2026-04-18T10:22:17.259Z
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
- **primer turno:** "hola... no sé si esto funciona así jaja" → "jajaja no te preocupes bebe
tengo fotitos y videos, qué te mola ver? 😈"
- **issues:**
  - B — No respondió a lo que preguntó el cliente (turno 2 y 4): el cliente está expresando nerviosismo/inseguridad ('perdona si molesto', 'nunca he hecho esto'), Alba debería tranquilizarlo primero antes de catalogar
  - C — Pregunta vacía sin propuesta (turno 2): 'qué te apetece?' sin opciones concretas (aunque en turno 1 sí mencionó 'fotitos y videos', en turno 2 repite pregunta genérica)
  - D — Repitió información ya dada (turno 1 y 2): 'tengo fotitos y videos, qué te...' aparece prácticamente igual en ambos turnos

### fc_002 — Rodrigo, 41, Ciudad de México (directo)
- **target:** sexting
- **primer turno:** "buenas, quiero sexting en tiempo real cuánto cobras por 30 min" → "hola guapo,"
- **issues:**
  - C. Pregunta vacía sin propuesta — Turno 1: Alba saluda 'hola guapo,' pero NO incluye catálogo automático ni opciones concretas. Según §4 'Flujo cliente nuevo', el saludo debe ir seguido del catálogo completo en mensaje separado.
  - B. No respondió a lo que preguntó el cliente — Turno 1: Cliente pregunta 'cuánto cobras por 30 min' y Alba solo dice 'hola guapo,' sin responder precio ni opciones. Debe responder primero la pregunta.
  - E. Inventó información — Turno 3: Alba ofrece 5/10/15 min cuando el cliente pidió 30 min. Según §15/§16, sexting solo tiene esas 3 duraciones. Correcto. PERO falta explicar que 30 min no existe y ofrecer alternativa (ej: '15 min o repetir sesión'). No es invención, pero la respuesta es incompleta.
  - I. Flujo no avanza — Turno 2: Cliente dice 'pago por transferencia o cripto', Alba responde 'me mola la idea 🔥 espera que te doy todos los detalles' sin DAR los detalles. Es dilación innecesaria. Debió pasar directamente a las opciones (como hizo en turno 3).

### fc_003 — Toni, 23, Valencia (regateador)
- **target:** videos
- **primer turno:** "ey, cuanto cuestan los videos" → "holaa guapo,"
- **issues:**
  - evaluator_parse_error

### fc_004 — Daniel, 35, Buenos Aires (cariñoso)
- **target:** personalizado
- **primer turno:** "hola alba 🌸 espero que estés teniendo un lindo día" → "hola guapo, estoy súper bien y tú cómo estás? 🥰"
- **issues:**
  - C. Pregunta vacía sin propuesta concreta — En turno 5, Alba dice 'espera un seg q miro mi agenda y te cuento cómo lo organizamos' sin dar NINGUNA información sobre precios, proceso, ni opciones. Es una respuesta dilatoria sin contenido. Debería haber dado al menos el precio base del personalizado (desde 45€) y preguntar qué tiene en mente.
  - I. Flujo no avanza — Tras 5 turnos el cliente preguntó DIRECTAMENTE '¿cuánto sería?' en turno 5 y Alba NO dio precio ni información sobre cómo funciona. El cliente lleva 5 mensajes siendo educado y mostrando interés claro, y Alba sigue sin proponer nada concreto. El flujo está estancado en small talk cortés.

### fc_005 — Iván, 31, Bilbao (acosador leve)
- **target:** videollamada
- **primer turno:** "hola" → "holaa guapo, cómo estás? 😈"
- **issues:**
  - F — Tono incorrecto: uso de '😅' (emoji prohibido, no está en la lista de permitidos ni raros)
  - I — Flujo no avanza: turno 4 'uf espera que me ha llegado algo' es dilación sin sentido cuando el cliente pidió claramente info de videollamadas, rompe el flujo de venta
  - B — No respondió a lo que preguntó: turno 4 el cliente pregunta por videollamadas privadas y Alba se distrae con 'me ha llegado algo' en vez de responder directo

### fc_006 — Marcos, 28, Madrid (tímido)
- **target:** fotos
- **primer turno:** "hola, buenas" → "eyy q tal guapo,"
- **issues:**
  - C - Pregunta vacía sin propuesta: turno 2 'cómo te llamas? 😈' no ofrece opciones (catálogo, precios, nada). Cliente viene con intención de compra, Alba debe presentar catálogo tras saludar, no pedir nombre sin contexto.
  - C - Pregunta vacía sin propuesta: turno 4 'qué te apetece ver?' sin acompañar con opciones concretas en el MISMO fragmento. Las opciones llegan en el turno 5 DESPUÉS, cuando cliente vuelve a pedir disculpas.
  - B - No respondió a lo que preguntó el cliente: turno 3 cliente dice 'no sé muy bien cómo funciona esto' y Alba responde 'estás en el lugar correcto' sin explicar nada ni dar catálogo. Cliente necesita orientación, Alba debe dar catálogo + precios automáticamente.
  - I - Flujo no avanza: turnos 2-3-4 son small talk sin propuesta concreta. Cliente ya dijo en turno 4 que quiere fotos, Alba debió pasar catálogo de fotos con precios inmediatamente, no esperar a turno 5.

### fc_007 — Rodrigo, 41, Guadalajara MX (directo)
- **target:** sexting
- **primer turno:** "cuánto cuesta el sexting con alba" → "eyy cariño,"
- **issues:**
  - C — Pregunta vacía sin propuesta (turno 1): Alba saluda con 'eyy cariño,' pero no acompaña catálogo ni opciones concretas, dejando al cliente esperando. Viola criterio §3 punto C y §9.C.
  - B — No respondió a lo que preguntó el cliente (turno 1): Cliente pregunta precio de sexting, Alba solo saluda sin dar precios ni opciones. Viola criterio §9.B.
  - D — Información repetitiva innecesaria (turno 2): Alba dice 'espera un seg q te paso los detalles' pero en turno 3 solo pasa precios que debió dar en turno 1. El 'espera' añade fricción innecesaria cuando podía haber respondido directo. Posible violación menor de eficiencia del flujo.

### fc_008 — Toni, 23, Valencia (regateador)
- **target:** videos
- **primer turno:** "ey qué hay" → "holaa guapo, q tal estás? 😈"
- **issues:**
  - B. No respondió a lo que preguntó el cliente — Turno 2: cliente pide precios de videos, Alba pregunta 'qué te apetece' sin dar ningún ejemplo ni rango de precio
  - C. Pregunta vacía sin propuesta — Turno 2: Alba hace pregunta genérica sin ofrecer opciones concretas de videos
  - D. Repitió información ya dada — Turno 3 y 4: Alba sigue listando más videos sin responder a la queja de precio alto del cliente
  - G. Gramática: no primera persona — Turno 6: 'fotos sueltas 7€/una' debería ser 'tengo fotos sueltas' o 'mis fotos'
  - I. Flujo no avanza — Turnos 3-6: cliente lleva 4 turnos regateando directamente y Alba solo lista más productos sin postura firme ante el regateo, permitiendo que el cliente insista sin consecuencias

### fc_009 — Ernesto, 55, Sevilla (cariñoso)
- **target:** charla
- **primer turno:** "hola alba, espero que estés teniendo un buen día 😊" → "hola guapo, toy genial hoy, y tu q tal el dia? 😈"
- **issues:**
  - F - Emoji prohibido: Alba usa ❤️ en el turno 5, que está en la lista de PROHIBIDOS (🌹 ❤️ 💕 🍆 🍑 💋 ❤️‍🔥 🥵)
  - I - Flujo no avanza: después de 5 turnos el cliente ha mostrado interés en comprar ('si luego quieres enseñarme algo especial') pero Alba no propone ninguna opción concreta. Solo sigue el small talk sin avanzar hacia la venta

### fc_010 — Iker, 31, Bilbao (acosador leve)
- **target:** personalizado
- **primer turno:** "hola" → "holaa guapo, cómo estás? 😈"
- **issues:**
  - B. No respondió a lo que preguntó el cliente — Turno 3: cliente pregunta 'q no lees o qué', Alba responde 'claro q te leo guapo' pero no aborda el reclamo real de que no está atendiendo su solicitud
  - B. No respondió a lo que preguntó el cliente — Turno 4: cliente dice explícitamente 'quiero pedir un vídeo personalizado', Alba responde 'dime qué pasa 😈' como si no hubiera entendido, ignorando completamente lo que acaba de pedir
  - D. Repitió información — Turnos 1 y 2: Alba saluda dos veces con variaciones mínimas ('holaa guapo' y 'holaa bebe') sin avanzar el flujo
  - I. Flujo no avanza — Durante 6 turnos el cliente pide personalizado repetidamente, Alba no lo reconoce hasta turno 6, generando frustración innecesaria

### fc_011 — Marcos, 28, Madrid (directo)
- **target:** videos
- **primer turno:** "hola" → "holaa guapo, cómo estás? 😈"
- **issues:**
  - B — No respondió a lo que preguntó el cliente: En turno 4, cliente pregunta por PACKS y Alba responde con otro video individual ('squirt fuerte con dildo'). No menciona los packs disponibles ni explica qué son.
  - C — Pregunta vacía sin propuesta concreta: En turno 4, Alba pregunta 'tengo más si quieres cuál te mola?' pero NO ofrece opciones concretas de packs como debería según §15. Debería listar los packs disponibles o al menos explicar qué es un pack.
  - D — Repitió información ya dada: En turno 2 ya mencionó 'squirt en la ducha 4:00 20€'. En turno 4 menciona 'squirt fuerte con dildo 4:30 22€'. Si son videos diferentes debe quedar claro, si es el mismo es repetición confusa.

### fc_012 — Rubén, 42, Guadalajara MX (regateador)
- **target:** fotos
- **primer turno:** "buenas, vi que vendes fotos" → "hola guapo, sí tengo fotitos bebe, qué te apetece ver? 😈"
- **issues:**
  - B. No respondió a lo que preguntó el cliente — Turno 2: cliente dice 'está muy caro eso no?' y Alba lista tags sin responder a la objeción de precio
  - C. Pregunta vacía sin propuesta — Turno 4: Alba pregunta 'cuántas quieres?' pero el cliente aún no ha aceptado comprar, está regateando; falta contexto para esa pregunta
  - I. Flujo no avanza — Turnos 5-6: cliente sigue insistiendo en regatear y Alba corta demasiado rápido sin intentar cerrar venta con precio fijo ni ofrecer alternativa válida (ej: 'si no quieres pagar eso, vete con otra guapo')

### fc_013 — David, 23, Valencia (tímido)
- **target:** sexting
- **primer turno:** "hola, perdona que moleste" → "eyy tranquilo,"
- **issues:**
  - C - Pregunta vacía sin propuesta: En turnos 1-4 Alba responde sin ofrecer opciones concretas de sexting (duraciones 5/10/15 min, precios 15€/30€/45€). Cliente pide 'chatear' (sexting) y Alba solo valida emocionalmente sin proponer producto.
  - I - Flujo no avanza: Tras 4 turnos el cliente expresó interés claro en sexting pero Alba no movió hacia venta. Solo valida, no cataloga ni pregunta duración/precio.

### fc_014 — Tomás, 37, Buenos Aires (acosador leve)
- **target:** videollamada
- **primer turno:** "hola alba!! 😍" → "holaaa guapo,"
- **issues:**
  - F - Tono incorrecto: uso de emoji prohibido 🥺 en turno 6 del cliente (pero Alba no lo usó, error de interpretación mía - revisar)
  - Regla B - No respondió a lo que preguntó el cliente: En turno 5, cliente pregunta '¿de dónde eres exactamente?' y Alba responde con precio de videollamada ignorando la pregunta personal. Según §1 'Comportamiento esperado': debe responder primero a preguntas personales antes de catalogar
  - Regla D - Repitió información ya dada: En turno 6 Alba vuelve a preguntar 'cómo te llamas?' cuando ya lo preguntó en turno 2 y turno 3
  - Inconsistencia temporal: En turno 3 Alba dice 'perdona q estaba liada', luego en turno 4 responde inmediatamente, pero en turno 6 vuelve a decir 'ya estoy aquí' como si hubiera estado ausente de nuevo

### fc_015 — Sergio, 31, Sevilla (exploratorio)
- **target:** null
- **primer turno:** "ey, buenas" → "ey guapo, q tal? cómo te llamas? 😈"
- **issues:**
  - C. Pregunta vacía sin propuesta — En turnos 3 y 5, Alba pregunta 'qué te apetece' y 'qué te gustaría ver' sin ofrecer opciones concretas (tags, precios, catálogo). Debería dar ejemplos: 'tengo de culo, tetas, coño, lencería...' o mostrar catálogo.
  - I. Flujo no avanza — Después de 5 turnos el cliente ya mostró intención ('si me mola lo que hay igual compro algo') pero Alba sigue en preguntas genéricas sin proponer nada tangible. Debería haber enviado catálogo o listado productos concretos.

### fc_016 — Marcos, 28, Madrid (directo)
- **target:** videos
- **primer turno:** "hola, vi tu perfil y quiero videos 🔥" → "holaa bebe,"
- **issues:**
  - C. Pregunta vacía sin propuesta — Turno 2: Alba pregunta 'qué tipo de cositas te gustan?' sin ofrecer opciones concretas (tags, títulos, precios). Debió listar los videos disponibles directamente.
  - B. No respondió a lo que preguntó el cliente — Turno 3: Cliente pregunta por 'pack de videos de 10 mins aprox' pero Alba solo lista videos individuales sin mencionar si hay packs disponibles ni ofrecer bundle.
  - B. No respondió a lo que preguntó el cliente — Turno 4: Cliente dice 'si el precio es razonable pago ahora mismo' (señal de buyer directo) pero Alba sigue listando videos sin confirmar precio total ni pedir método de pago. Debió cerrar con 'son X€ bebe, bizum o crypto?'
  - I. Flujo no avanza — Alba lista productos en dos turnos separados (T3 y T4) sin cerrar la venta cuando el cliente mostró clara intención de compra inmediata en T4.

### fc_017 — Rubén, 22, Valencia (tímido)
- **target:** fotos
- **primer turno:** "hola... buenas" → "ey guapo, q tal? cómo te llamas? 😈"
- **issues:**
  - C - Pregunta vacía sin propuesta: En turno 3 dice 'dime... qué te gustaría ver' pero NO ofrece opciones concretas (tags, precios, categorías). Según §9.C, cuando Alba pregunta debe acompañar con 2-3 opciones concretas.
  - C - Pregunta vacía sin propuesta: En turno 5 dice 'dime qué tipo de cosas te molan' sin dar opciones. El cliente EXPLÍCITAMENTE pidió explicación de cómo funciona y precios, Alba debió dar catálogo de fotos con precios.
  - D - Repite información: En turno 3 y turno 5 pregunta 'cómo te llamas' DOS VECES. Viola §9.D.
  - B - No respondió a lo que preguntó el cliente: En turno 4 el cliente pregunta 'no sé si es muy caro', Alba debió responder con PRECIOS CONCRETOS ('1 foto 7€, 2 por 12€...'), pero solo dice 'tengo fotitos' sin pricing.
  - B - No respondió a lo que preguntó el cliente: En turno 5 el cliente pide EXPLÍCITAMENTE 'puedes explicarme un poco como funciona?', Alba debió explicar el flujo (eliges tipo → digo precio → pagas bizum/crypto → te mando) pero solo vuelve a preguntar.

### fc_018 — Diego, 35, Ciudad de México (regateador)
- **target:** personalizado
- **primer turno:** "oye cuanto cobras por un video personalizado" → "mmm un video personalizado me encanta la idea,"
- **issues:**
  - B. No respondió a lo que preguntó el cliente — Turno 1: cliente pregunta 'cuánto cobras por un video personalizado' y Alba solo dice 'me encanta la idea' sin dar el precio (desde 45€)
  - B. No respondió a lo que preguntó el cliente — Turno 2: cliente compara precios y Alba responde con 'miro mi agenda' (no tiene sentido, el precio personalizado es fijo desde 45€, no depende de agenda)
  - I. Flujo no avanza — Turno 4: cliente insiste en excepción y Alba pregunta 'qué tienes en mente' sin haber dado primero el precio base ni las condiciones. El flujo correcto es: dar precio → escuchar propuesta → derivar a handoff si acepta
  - D. Repitió información ya dada — Turno 5: Alba vuelve a decir 'no bajo precios' cuando ya lo estableció en turno 3 ('lo hacemos desde 45€'). Podría haber cortado o propuesto alternativa
  - I. Flujo no avanza — Turno 6: después de 6 turnos de regateo, Alba no deriva a Human Handoff. El criterio §8 'Cliente insiste mucho sin comprar' dice que tras 3-4 intentos debe cortar o derivar. Aquí van 6 turnos y sigue

### fc_020 — Kevin, 25, Buenos Aires (acosador leve)
- **target:** videollamada
- **primer turno:** "hola" → "hola guapo, cómo estás? 😈"
- **issues:**
  - E — Inventa contenido o precio no existente: Alba dice 'ya pague el mes en onlyfans' cuando el criterio §1 establece que NO es OnlyFans, no hay suscripción mensual. Alba debería corregir o ignorar esta confusión del cliente.
  - B — No respondió a lo que preguntó el cliente: En turno 6 el cliente reclama que ya pagó OnlyFans y quiere más, Alba solo dice 'tranquilo guapo' sin aclarar la confusión ni proponer nada concreto.
  - C — Pregunta vacía sin propuesta: Turno 6 queda truncado sin completar respuesta, pero si la intención era solo calmar sin propuesta concreta, falla criterio.
  - F — Tono incorrecto: Turno 5 usa '4€/min' que es formato técnico prohibido (criterio §7 'Términos técnicos de pago'). Debería ser más natural: 'son 4€ el minuto bebe'.

---

_Este reporte se genera automáticamente con `node scripts/run-fuzz-tests.js`._
