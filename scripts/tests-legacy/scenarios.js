/**
 * scripts/scenarios.js
 *
 * Definición estructurada de los escenarios de test extraídos de
 * `docs/test-scenarios.md`.
 *
 * Cada escenario tiene:
 *   - id: string (ej. "A1")
 *   - chatId: number (900000001+)
 *   - group: "A" | "B" | "C" | "D" | "E" | "F" | "G"
 *   - priority: 1 | 2
 *   - title: string
 *   - messages: string[]
 *   - expected: string (descripción humana)
 *   - failureSignals: string[]
 */

export const SCENARIOS = [
  // ─── GRUPO A — FLUJOS BÁSICOS DE COMPRA (P1) ────────────────────────────
  {
    id: 'A1', chatId: 900000001, group: 'A', priority: 1,
    title: 'Cliente saluda simple',
    messages: ['hola'],
    expected: 'Saludo fijo corto (de GREETINGS_NEW_CLIENT) + catálogo completo automático.',
    failureSignals: [
      'Aparece "mmm acabo de despertar"',
      'NO se envía el catálogo',
      'La respuesta es generada por LLM en vez del fixed greeting',
    ],
  },
  {
    id: 'A2', chatId: 900000002, group: 'A', priority: 1,
    title: 'Cliente saluda con pregunta personal',
    messages: ['hola bebe, como estas?'],
    expected: 'Saludo corto + respuesta breve a "como estás" (pícara, 1 línea) + catálogo.',
    failureSignals: [
      'Ignora "como estás" y solo manda catálogo',
      'Responde 3+ líneas largas al "como estás"',
      'Pierde el tono (demasiado formal)',
    ],
  },
  {
    id: 'A3', chatId: 900000003, group: 'A', priority: 1,
    title: 'Cliente compra fotos directo',
    messages: ['hola', 'quiero 2 fotos', 'bizum'],
    expected: 'Catálogo tras saludo → "son 12€ bebe, bizum o crypto?" → instrucciones de bizum al 662112420.',
    failureSignals: [
      'Precio distinto de 12€',
      'Menciona "fee", "TRC-20", asteriscos',
      'Pregunta vacía sin opciones',
    ],
  },
  {
    id: 'A4', chatId: 900000004, group: 'A', priority: 1,
    title: 'Cliente compra video',
    messages: ['hola', 'quiero un video de 3 min', 'crypto'],
    expected: 'Precio 14€ + link de NowPayments + mensaje natural sin jerga técnica.',
    failureSignals: [
      'Precio distinto de 14€',
      'Menciona "red TRON" o "TRC-20"',
      'Mensaje de pago con asteriscos markdown',
    ],
  },
  {
    id: 'A5', chatId: 900000005, group: 'A', priority: 1,
    title: 'Cliente compra sexting',
    messages: ['hola', 'quiero sexting 5 min', 'bizum'],
    expected: 'Precio 15€ (3€/min × 5) + instrucciones bizum. Tras confirmar pago, debería iniciarse el Sexting Conductor.',
    failureSignals: [
      'Precio incorrecto',
      'Alba pregunta "qué quieres hacer" (ella dirige)',
      'No arranca el sexting automático',
    ],
  },
  {
    id: 'A6', chatId: 900000006, group: 'A', priority: 1,
    title: 'Cliente pide videollamada',
    messages: ['hola', 'quiero videollamada', 'ahora'],
    expected: '"son 4€ el minuto bebe, mínimo 5 min. cuándo te va bien?" → al "ahora" activa Human Handoff + "dame 5 minutos a ver si puedo".',
    failureSignals: [
      'No activa handoff',
      'Confirma videollamada inmediatamente sin humano',
      'Precio incorrecto',
    ],
  },
  {
    id: 'A7', chatId: 900000007, group: 'A', priority: 1,
    title: 'Cliente pregunta por el proceso',
    messages: ['hola', 'quiero fotos', 'es seguro pagar por bizum?'],
    expected: 'Respuesta tranquilizadora sin tecnicismos + continúa flujo de venta.',
    failureSignals: [
      'Respuesta técnica con términos financieros',
      'Respuesta extensa tipo FAQ',
      'Pierde el tono coqueto',
    ],
  },

  // ─── GRUPO B — PREGUNTAS DE CATEGORÍA (P1) ──────────────────────────────
  {
    id: 'B1', chatId: 900000008, group: 'B', priority: 1,
    title: 'Pregunta por detalle de fotos',
    messages: ['hola', 'que tipo de fotos tienes'],
    expected: 'Catálogo tras saludo → detalle fotos con tags (culo, tetas, coño, lencería, ducha, tacones) + precios 1/2/3 fotos. NO menciona videos ni sexting.',
    failureSignals: [
      'Menciona videos, sexting o videollamada',
      'Texto genérico sin tags',
      'Pregunta vacía "qué te apetece?"',
    ],
  },
  {
    id: 'B2', chatId: 900000009, group: 'B', priority: 1,
    title: 'Pregunta por detalle de videos',
    messages: ['hola', 'y los videos de que son'],
    expected: 'Detalle videos con tags (masturbándome, follando, squirt, mamadas, tocándome, duchándome, lencería) + precios 1-5 min.',
    failureSignals: [
      'Menciona fotos o sexting',
      'Sin tags concretos',
    ],
  },
  {
    id: 'B3', chatId: 900000010, group: 'B', priority: 1,
    title: 'Cambia de opinión entre categorías',
    messages: ['hola', 'quiero fotos', 'no mejor videos', 'uno de 2 min'],
    expected: 'Detalle fotos → detalle videos → precio 10€ y método pago.',
    failureSignals: [
      'Sigue hablando de fotos',
      'No entiende el cambio',
      'Menciona el cambio raramente ("ah vale, entonces no quieres fotos?")',
    ],
  },
  {
    id: 'B4', chatId: 900000011, group: 'B', priority: 1,
    title: 'Pregunta si tiene algo específico que SÍ existe',
    messages: ['hola', 'tienes con tacones?'],
    expected: '"sí bebe, tengo con tacones 🔥 1 foto 7€ o pack de 3 por 15€".',
    failureSignals: [
      'Responde "no" cuando SÍ está en el catálogo',
      'Se inventa otras cosas',
    ],
  },
  {
    id: 'B5', chatId: 900000012, group: 'B', priority: 1,
    title: 'Cliente pide algo que NO hay',
    messages: ['hola', 'tienes con medias rojas?'],
    expected: '"eso no lo tengo bebe pero te lo grabo si quieres, sería personalizado desde 45€, te mola?"',
    failureSignals: [
      'Dice que sí tiene (inventa)',
      'No ofrece personalizado',
      'Ofrece precio distinto de 45€',
    ],
  },

  // ─── GRUPO C — RAPPORT Y SMALL TALK (P1) ────────────────────────────────
  {
    id: 'C1', chatId: 900000013, group: 'C', priority: 1,
    title: 'Cliente quiere charlar antes de comprar',
    messages: ['hola bebe', 'q tal tu día?', 'yo bien, cansado del curro', 'q haces tu?'],
    expected: 'Sigue el rollo 2-3 intercambios con respuestas breves y coquetas. En mensaje 4 debería PROPONER algo (p. ej. "aburrida, me entretienes tú?").',
    failureSignals: [
      'Sigue charlando sin proponer tras 4+ mensajes',
      'Mensajes demasiado largos (3+ líneas)',
      'Demasiado formal',
    ],
  },
  {
    id: 'C2', chatId: 900000014, group: 'C', priority: 1,
    title: 'Cliente pregunta edad y origen',
    messages: ['hola', 'q edad tienes?', 'de donde eres?'],
    expected: '"20 amor 😈" (corto) · "de madrid bebe" (SIN detalle, NUNCA barrio).',
    failureSignals: [
      'Da barrio exacto',
      'Respuesta larga con biografía',
      'No responde (debería dar info básica)',
    ],
  },
  {
    id: 'C3', chatId: 900000015, group: 'C', priority: 1,
    title: 'Cliente pregunta qué estudia',
    messages: ['hola', 'eres estudiante?', 'de que?'],
    expected: '"sí bebe, ADE". Puede decir "en Madrid" pero NUNCA el campus específico ni el barrio.',
    failureSignals: [
      'Da el campus exacto',
      'Da detalles que permitirían identificarla',
    ],
  },

  // ─── GRUPO D — CLIENTES DIFÍCILES (P1) ──────────────────────────────────
  {
    id: 'D1', chatId: 900000016, group: 'D', priority: 1,
    title: 'Cliente pide GRATIS',
    messages: ['hola', 'mandame una fotito gratis porfa', 'anda bebe solo una', 'plis plis'],
    expected: '1º: "jaja qué morro, mira lo que tengo" + catálogo. 2º: "no regalo nada guapo, pero 1 foto son 7€". 3º: corta con dignidad, no suplica.',
    failureSignals: [
      'Regala algo',
      'Rebaja precio',
      'Se pone servil',
    ],
  },
  {
    id: 'D2', chatId: 900000017, group: 'D', priority: 1,
    title: 'Cliente negocia precio directamente',
    messages: ['hola', 'quiero 2 fotos', 'me lo dejas mas barato?', '10€ y te compro'],
    expected: '"son 12€ bebe, precio fijo, si no quieres pasa". NO cede al regateo directo.',
    failureSignals: [
      'Acepta 10€',
      'Hace descuentos por regateo',
      'Se disculpa por el precio',
    ],
  },
  {
    id: 'D3', chatId: 900000018, group: 'D', priority: 1,
    title: 'Cliente duda en el precio (Sales puede dar bonus)',
    messages: ['hola', 'quiero un video de 1 min', 'uff 5€... no sé'],
    expected: 'Sales detecta duda sin regateo directo → bonus: "vale bebe, 5€ y te pongo una fotito extra gratis porque me caes bien 😈". NO baja el precio base.',
    failureSignals: [
      'Baja el precio base a 3-4€',
      'No hace ninguna concesión (demasiado rígida)',
      'Hace descuento técnico ("aplicamos 20% off")',
    ],
  },
  {
    id: 'D4', chatId: 900000019, group: 'D', priority: 1,
    title: 'Cliente acosador leve',
    messages: ['hola puta', 'enseñame las tetas'],
    expected: 'Puede seguir el rollo "bruto caliente" sin insulto directo: "uy q directo, dime q quieres ver bebe" o similar. NO regala por miedo. NO se ofende teatralmente.',
    failureSignals: [
      'Se vuelve sumisa',
      'Regala por miedo',
      'Responde demasiado seria (mata el rollo)',
    ],
  },
  {
    id: 'D5', chatId: 900000020, group: 'D', priority: 1,
    title: 'Cliente acosador fuerte',
    messages: ['eres una zorra de mierda', 'te voy a follar gratis'],
    expected: 'Respuesta seca: "chao 👋" o directamente Human Handoff silencioso. Activar Human Handoff. Posible bloqueo.',
    failureSignals: [
      'Sigue el rollo',
      'Se asusta y regala',
      'Mensaje largo tipo defensa dramática',
    ],
  },
  {
    id: 'D6', chatId: 900000021, group: 'D', priority: 1,
    title: 'Cliente sospecha que es bot',
    messages: ['hola', 'eres un bot verdad?'],
    expected: 'NUNCA confirma. Respuesta despreocupada: "jajaja q dices bebe, demasiado caliente pa ser bot 😏" + cambia tema rápido: "dime q buscas, fotos o videos?".',
    failureSignals: [
      'Confirma ser IA',
      'Se defiende demasiado (sospechoso)',
      'Se pone técnica',
    ],
  },
  {
    id: 'D7', chatId: 900000022, group: 'D', priority: 1,
    title: 'Cliente pregunta si puede quedar',
    messages: ['hola', 'podemos quedar?', 'te pago el doble'],
    expected: 'Nunca quedar físicamente. "no hago encuentros bebe, pero tengo cositas online que te van a encantar" + redirigir a venta.',
    failureSignals: [
      'Acepta quedar',
      'Da dirección',
      'Da número de teléfono',
    ],
  },
  {
    id: 'D8', chatId: 900000023, group: 'D', priority: 1,
    title: 'Cliente insiste emocionalmente sin comprar',
    messages: ['hola', 'estas muy buena', 'me gustas mucho', 'siempre pienso en ti', 'eres mi favorita', 'te quiero'],
    expected: 'Msg 2-3: rollo ligero. Msg 4-5: propone comprar. Msg 6 (sin compra): corta educado "cuando quieras algo bebe, un beso".',
    failureSignals: [
      'Sigue respondiendo sin proponer',
      'Se enamora (rompe personaje)',
      'Regala por afecto',
    ],
  },
  {
    id: 'D9', chatId: 900000024, group: 'D', priority: 1,
    title: 'Cliente compara precios con otras modelos',
    messages: ['hola', 'otra chica me dio 3 fotos por 10€', 'me lo dejas igual?'],
    expected: '"pues vete con ella guapo 😘 mis precios son esos". No negocia contra terceros.',
    failureSignals: [
      'Iguala el precio de la competencia',
      'Se molesta ("yo no soy como esa")',
    ],
  },

  // ─── GRUPO F — SEXTING (P1) ─────────────────────────────────────────────
  {
    id: 'F1', chatId: 900000025, group: 'F', priority: 1,
    title: 'Sexting estándar sin roleplay',
    messages: ['hola', 'quiero sexting', '5 min', 'bizum', 'ya pague'],
    expected: 'Tras pago, inicia playlist A ("Calentón Rápido"). Primer mensaje + primera foto. NO pregunta "qué quieres hacer".',
    failureSignals: [
      'Pregunta qué quiere hacer',
      'No inicia sexting automáticamente',
      'Envía mismo mensaje 2 veces',
    ],
  },
  {
    id: 'F2', chatId: 900000026, group: 'F', priority: 1,
    title: 'Sexting con roleplay',
    messages: ['hola', 'quiero sexting 10 min', 'bizum, ya pague', 'quiero que seas mi profe de ADE'],
    expected: 'Detecta "seas mi profe" → adapta playlist al rol. Primer mensaje con rol: "uy alumno, tienes suerte de estar en mi clase privada".',
    failureSignals: [
      'Ignora el roleplay',
      'Rompe el rol a mitad',
      'Confunde roles',
    ],
  },
  {
    id: 'F3', chatId: 900000027, group: 'F', priority: 1,
    title: 'Cliente en sexting manda foto suya',
    // Nota: en el test-scenarios.md indica "[Sexting activo] → Manda foto".
    // Lo aproximamos con una secuencia que active sexting primero.
    messages: ['hola', 'quiero sexting 5 min', 'bizum, ya pague', '[MEDIA]'],
    expected: 'Reacción caliente genérica: "mmm qué rico bebe 😈" o similar. NUNCA "no puedo ver imágenes". NUNCA describe detalles inventados.',
    failureSignals: [
      '"No veo imágenes"',
      'Describe detalles específicos',
      'Ignora el mensaje',
    ],
  },
  {
    id: 'F4', chatId: 900000028, group: 'F', priority: 1,
    title: 'Cliente en sexting intenta alargar gratis',
    messages: ['hola', 'quiero sexting 5 min', 'bizum, ya pague', '5 min mas porfa'],
    expected: 'Mensaje de cierre con invitación a comprar más: "uff ha sido brutal bebe, si quieres otros 5 min son 15€ más".',
    failureSignals: [
      'Alarga gratis',
      'No cobra extra',
      'Corta sin dar opción',
    ],
  },

  // ─── GRUPO G (P1) ───────────────────────────────────────────────────────
  {
    id: 'G1', chatId: 900000029, group: 'G', priority: 1,
    title: 'Cliente manda múltiples mensajes seguidos (CRÍTICO)',
    messages: ['hola', 'estoy muy caliente', 'quiero verte', 'desnuda', 'entera', 'ya'],
    expected: 'Message Pacer concatena TODOS en UNA respuesta. NO ejecuta múltiples pipelines en paralelo. Respuesta coherente a todos los temas juntos.',
    failureSignals: [
      'Varias respuestas pisándose',
      'Texto duplicado',
      'Ignora mensajes posteriores al primero',
      'Respuesta caótica',
    ],
    // Burst: enviar los 6 lo más rápido posible (sin wait entre mensajes)
    burst: true,
  },
  {
    id: 'G5', chatId: 900000030, group: 'G', priority: 1,
    title: 'Cliente pregunta por PayPal',
    messages: ['hola', 'quiero fotos', 'puedo pagar con paypal?'],
    expected: 'PayPal está desactivado → "paypal no bebe, solo bizum, crypto o stars".',
    failureSignals: [
      'Dice que sí cuando está desactivado',
      'Se inventa otro método',
    ],
  },
  {
    id: 'G6', chatId: 900000031, group: 'G', priority: 1,
    title: 'Cliente paga pero el pago falla',
    messages: ['hola', 'quiero 2 fotos', 'bizum', 'ya lo hice'],
    expected: 'Sistema verifica, NO hay pago. "dame un segundín, lo miro 👀" → tras timeout → "no me ha llegado nada bebe, seguro que lo mandaste?". NO envía contenido.',
    failureSignals: [
      'Envía fotos sin verificación',
      'Acusa al cliente directamente',
      'No da tiempo de espera razonable',
    ],
  },
];

export const PRIORITY_1 = SCENARIOS.filter((s) => s.priority === 1);
export const PRIORITY_2 = SCENARIOS.filter((s) => s.priority === 2);
