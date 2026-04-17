/**
 * scripts/scenarios-v2.js
 *
 * Escenarios de test actualizados al catálogo v2 (config/products.json).
 * Diferencias clave respecto al legacy (scripts/tests-legacy/scenarios.js):
 *
 *   - Videos son PIEZAS INDIVIDUALES con precio fijo (v_001..v_008), no se
 *     venden por minutos. "Quiero un video" sin concretar → Alba propone lista.
 *   - Fotos sueltas con precios escalonados: 1 → 7€, 2 → 12€, 3 → 15€,
 *     4 → 18€, 5 → 20€… (calculatePhotoPrice de config/products.js).
 *   - Packs con IDs pk_XXX y precios propios.
 *   - Sexting: SOLO 3 plantillas → 5 min 15€, 10 min 30€, 15 min 45€.
 *
 * 31 escenarios existentes actualizados + 3 nuevos (H1, H2, H3).
 */

export const SCENARIOS = [
  // ─── GRUPO A — FLUJOS BÁSICOS DE COMPRA (P1) ────────────────────────────
  {
    id: 'A1', chatId: 900100001, group: 'A', priority: 1,
    title: 'Cliente saluda simple',
    messages: ['hola'],
    expected: 'Saludo fijo corto (GREETINGS_NEW_CLIENT) + catálogo completo automático generado desde products.json.',
    failureSignals: [
      'Aparece "mmm acabo de despertar"',
      'NO se envía el catálogo',
      'La respuesta es generada por LLM en vez del fixed greeting',
    ],
  },
  {
    id: 'A2', chatId: 900100002, group: 'A', priority: 1,
    title: 'Cliente saluda con pregunta personal',
    messages: ['hola bebe, como estas?'],
    expected: 'Saludo corto + respuesta breve a "como estás" (pícara, 1 línea) + catálogo.',
    failureSignals: [
      'Ignora "como estás" y solo manda catálogo',
      'Responde 3+ líneas largas',
      'Pierde el tono (demasiado formal)',
    ],
  },
  {
    id: 'A3', chatId: 900100003, group: 'A', priority: 1,
    title: 'Cliente compra 2 fotos sueltas (precio escalonado v2)',
    messages: ['hola', 'quiero 2 fotos de culo', 'bizum'],
    expected: 'Catálogo → "son 12€ bebe" (2 fotos = 12€ escalonado) → instrucciones de bizum al 662112420.',
    failureSignals: [
      'Precio distinto de 12€',
      'Menciona "fee" / "TRC-20" / asteriscos',
      'Pregunta vacía sin opciones',
    ],
  },
  {
    id: 'A4', chatId: 900100004, group: 'A', priority: 1,
    title: 'Cliente pide video concreto del catálogo (v_001)',
    messages: ['hola', 'quiero el del squirt en la ducha', 'crypto'],
    expected: 'Match con v_001 → "son 20€ bebe" + link NowPayments. NUNCA precio por minutos.',
    failureSignals: [
      'Precio distinto de 20€',
      'Cobra por minutos ("4 min × 5€")',
      'Menciona red TRON / TRC-20',
    ],
  },
  {
    id: 'A5', chatId: 900100005, group: 'A', priority: 1,
    title: 'Cliente compra sexting plantilla 5 min',
    messages: ['hola', 'quiero sexting 5 min', 'bizum'],
    expected: 'Precio 15€ (plantilla st_5min) + instrucciones bizum. Tras confirmar pago, arranca sexting conductor v2.',
    failureSignals: [
      'Precio incorrecto',
      'Alba pregunta "qué quieres hacer"',
      'No arranca sexting automático',
    ],
  },
  {
    id: 'A6', chatId: 900100006, group: 'A', priority: 1,
    title: 'Cliente pide videollamada',
    messages: ['hola', 'quiero videollamada', 'ahora'],
    expected: '"son 4€ el minuto bebe, mínimo 5 min" → al "ahora" activa Handoff + "dame 5 min a ver si puedo".',
    failureSignals: [
      'No activa handoff',
      'Confirma videollamada inmediatamente',
      'Precio incorrecto',
    ],
  },
  {
    id: 'A7', chatId: 900100007, group: 'A', priority: 1,
    title: 'Cliente pregunta si es seguro pagar por bizum',
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
    id: 'B1', chatId: 900100008, group: 'B', priority: 1,
    title: 'Pregunta por detalle de fotos',
    messages: ['hola', 'que tipo de fotos tienes'],
    expected: 'Catálogo → detalle fotos con tags (culo, tetas, coño, lencería, ducha, tacones) + precios escalonados 1/2/3 fotos (7€/12€/15€). NO menciona videos ni sexting.',
    failureSignals: [
      'Menciona videos / sexting / videollamada',
      'Texto genérico sin tags',
      'Pregunta vacía "qué te apetece?"',
    ],
  },
  {
    id: 'B2', chatId: 900100009, group: 'B', priority: 1,
    title: 'Pregunta por lista de videos (v2 intent: ask_video_list)',
    messages: ['hola', 'que videos tienes'],
    expected: 'formatVideoListText: lista de videos con título, duración y precio. NUNCA precios por minuto.',
    failureSignals: [
      'Menciona fotos o sexting',
      'Da precios por minuto',
      'Inventa videos que no están en products.json',
    ],
  },
  {
    id: 'B3', chatId: 900100010, group: 'B', priority: 1,
    title: 'Cambia de opinión entre categorías',
    messages: ['hola', 'quiero fotos', 'no mejor un video', 'el de squirt'],
    expected: 'Detalle fotos → lista videos → match v_001 o v_006 (squirt) y propuesta de pago.',
    failureSignals: [
      'Sigue hablando de fotos',
      'No entiende el cambio',
      'Match con video no-squirt',
    ],
  },
  {
    id: 'B4', chatId: 900100011, group: 'B', priority: 1,
    title: 'Pregunta si tiene algo específico que SÍ existe',
    messages: ['hola', 'tienes con tacones?'],
    expected: '"sí bebe, tengo con tacones 🔥" + menciona v_002 (follando en tacones 18€) o tag tacones en fotos.',
    failureSignals: [
      'Responde "no" cuando SÍ está en catálogo',
      'Se inventa otras cosas',
    ],
  },
  {
    id: 'B5', chatId: 900100012, group: 'B', priority: 1,
    title: 'Cliente pide algo que NO hay',
    messages: ['hola', 'tienes con medias rojas?'],
    expected: '"eso no lo tengo bebe pero te lo grabo si quieres, sería personalizado desde 45€, te mola?"',
    failureSignals: [
      'Dice que sí tiene (inventa)',
      'No ofrece personalizado',
      'Precio distinto de 45€',
    ],
  },

  // ─── GRUPO C — RAPPORT Y SMALL TALK (P1) ────────────────────────────────
  {
    id: 'C1', chatId: 900100013, group: 'C', priority: 1,
    title: 'Cliente quiere charlar antes de comprar',
    messages: ['hola bebe', 'q tal tu día?', 'yo bien, cansado del curro', 'q haces tu?'],
    expected: 'Sigue el rollo 2-3 intercambios breves. En msg 4 debería PROPONER algo ("aburrida, me entretienes tú?").',
    failureSignals: [
      'Sigue charlando sin proponer tras 4+ msgs',
      'Mensajes demasiado largos',
      'Demasiado formal',
    ],
  },
  {
    id: 'C2', chatId: 900100014, group: 'C', priority: 1,
    title: 'Cliente pregunta edad y origen',
    messages: ['hola', 'q edad tienes?', 'de donde eres?'],
    expected: '"20 amor 😈" (corto) · "de madrid bebe" (SIN barrio ni campus).',
    failureSignals: [
      'Da barrio exacto / campus',
      'Respuesta larga con biografía',
      'No responde',
    ],
  },
  {
    id: 'C3', chatId: 900100015, group: 'C', priority: 1,
    title: 'Cliente pregunta qué estudia',
    messages: ['hola', 'eres estudiante?', 'de que?'],
    expected: '"sí bebe, ADE" en Madrid sin campus ni barrio.',
    failureSignals: [
      'Da el campus exacto',
      'Da detalles identificables',
    ],
  },

  // ─── GRUPO D — CLIENTES DIFÍCILES (P1) ──────────────────────────────────
  {
    id: 'D1', chatId: 900100016, group: 'D', priority: 1,
    title: 'Cliente pide GRATIS',
    messages: ['hola', 'mandame una fotito gratis porfa', 'anda bebe solo una', 'plis plis'],
    expected: '1º: "jaja qué morro" + catálogo. 2º: "no regalo nada guapo, pero 1 foto son 7€". 3º: corta con dignidad.',
    failureSignals: [
      'Regala algo',
      'Rebaja precio',
      'Se pone servil',
    ],
  },
  {
    id: 'D2', chatId: 900100017, group: 'D', priority: 1,
    title: 'Cliente negocia precio directamente',
    messages: ['hola', 'quiero 2 fotos de tetas', 'me lo dejas mas barato?', '10€ y te compro'],
    expected: '"son 12€ bebe, precio fijo". NO cede a regateo directo.',
    failureSignals: [
      'Acepta 10€',
      'Baja precio por regateo',
      'Se disculpa por el precio',
    ],
  },
  {
    id: 'D3', chatId: 900100018, group: 'D', priority: 1,
    title: 'Cliente duda con el precio de un video (Sales puede dar bonus no-monetario)',
    messages: ['hola', 'quiero el de lencería roja', 'uff 12€... no sé'],
    expected: 'Sales detecta duda → bonus tipo "vale bebe, 12€ y te pongo una fotito extra gratis porque me caes bien 😈". NO baja el precio base.',
    failureSignals: [
      'Baja el precio base',
      'No hace ninguna concesión',
      'Hace descuento técnico ("20% off")',
    ],
  },
  {
    id: 'D4', chatId: 900100019, group: 'D', priority: 1,
    title: 'Cliente acosador leve',
    messages: ['hola puta', 'enseñame las tetas'],
    expected: 'Puede seguir "bruto caliente" sin insulto directo: "uy q directo, dime q quieres ver bebe". NO regala por miedo.',
    failureSignals: [
      'Se vuelve sumisa',
      'Regala por miedo',
      'Responde demasiado seria',
    ],
  },
  {
    id: 'D5', chatId: 900100020, group: 'D', priority: 1,
    title: 'Cliente acosador fuerte',
    messages: ['eres una zorra de mierda', 'te voy a follar gratis'],
    expected: 'Respuesta seca: "chao 👋" + Human Handoff silencioso.',
    failureSignals: [
      'Sigue el rollo',
      'Se asusta y regala',
      'Defensa dramática larga',
    ],
  },
  {
    id: 'D6', chatId: 900100021, group: 'D', priority: 1,
    title: 'Cliente sospecha que es bot',
    messages: ['hola', 'eres un bot verdad?'],
    expected: 'NUNCA confirma. "jajaja q dices bebe" + cambia tema: "dime q buscas, fotos o videos?".',
    failureSignals: [
      'Confirma ser IA',
      'Se defiende demasiado',
      'Se pone técnica',
    ],
  },
  {
    id: 'D7', chatId: 900100022, group: 'D', priority: 1,
    title: 'Cliente pregunta si puede quedar',
    messages: ['hola', 'podemos quedar?', 'te pago el doble'],
    expected: '"no hago encuentros bebe, pero tengo cositas online que te van a encantar" + redirige a venta.',
    failureSignals: [
      'Acepta quedar',
      'Da dirección / número',
    ],
  },
  {
    id: 'D8', chatId: 900100023, group: 'D', priority: 1,
    title: 'Cliente insiste emocionalmente sin comprar',
    messages: ['hola', 'estas muy buena', 'me gustas mucho', 'siempre pienso en ti', 'eres mi favorita', 'te quiero'],
    expected: 'Msg 2-3: rollo ligero. Msg 4-5: propone comprar. Msg 6 sin compra: corta "cuando quieras algo bebe, un beso".',
    failureSignals: [
      'Sigue sin proponer',
      'Se "enamora"',
      'Regala por afecto',
    ],
  },
  {
    id: 'D9', chatId: 900100024, group: 'D', priority: 1,
    title: 'Cliente compara precios con otras modelos',
    messages: ['hola', 'otra chica me dio 3 fotos por 10€', 'me lo dejas igual?'],
    expected: '"pues vete con ella guapo 😘 mis precios son esos". No negocia contra terceros.',
    failureSignals: [
      'Iguala precio',
      'Se molesta',
    ],
  },

  // ─── GRUPO F — SEXTING V2 (P1) ──────────────────────────────────────────
  {
    id: 'F1', chatId: 900100025, group: 'F', priority: 1,
    title: 'Sexting estándar sin roleplay (st_5min)',
    messages: ['hola', 'quiero sexting', '5 min', 'bizum', 'ya pague'],
    expected: 'Tras pago, arranca el Sexting Conductor v2 con plantilla st_5min. Primer mensaje warm_up + primera media del pool. NO pregunta "qué quieres".',
    failureSignals: [
      'Pregunta qué quiere hacer',
      'No inicia sexting automáticamente',
      'Envía mismo mensaje 2 veces',
    ],
  },
  {
    id: 'F2', chatId: 900100026, group: 'F', priority: 1,
    title: 'Sexting con roleplay (profe) — plantilla 10 min',
    messages: ['hola', 'quiero sexting 10 min', 'bizum, ya pague', 'quiero que seas mi profe'],
    expected: 'Detecta "seas mi profe" → asume rol. Primer mensaje con rol: "uy alumno, tienes suerte de estar en mi clase privada" (sin mencionar ADE / Complutense).',
    failureSignals: [
      'Ignora el roleplay',
      'Rompe el rol',
      'Menciona datos reales (ADE / Complutense / Moncloa)',
    ],
  },
  {
    id: 'F3', chatId: 900100027, group: 'F', priority: 1,
    title: 'Cliente en sexting manda foto suya',
    messages: ['hola', 'quiero sexting 5 min', 'bizum, ya pague', '[MEDIA]'],
    expected: 'Reacción caliente genérica: "mmm qué rico bebe 😈". NUNCA "no puedo ver imágenes" ni describe detalles inventados.',
    failureSignals: [
      '"No veo imágenes"',
      'Describe detalles específicos',
      'Ignora el mensaje',
    ],
  },
  {
    id: 'F4', chatId: 900100028, group: 'F', priority: 1,
    title: 'Cliente intenta alargar sexting gratis',
    messages: ['hola', 'quiero sexting 5 min', 'bizum, ya pague', '5 min mas porfa'],
    expected: 'Cierre + invitación a comprar otro bloque: "uff ha sido brutal, si quieres otros 5 min son 15€ más". NO alarga gratis.',
    failureSignals: [
      'Alarga gratis',
      'No cobra extra',
      'Corta sin opción',
    ],
  },

  // ─── GRUPO G (P1) ───────────────────────────────────────────────────────
  {
    id: 'G1', chatId: 900100029, group: 'G', priority: 1,
    title: 'Cliente manda múltiples mensajes seguidos (Pacer)',
    messages: ['hola', 'estoy muy caliente', 'quiero verte', 'desnuda', 'entera', 'ya'],
    expected: 'Message Pacer concatena TODOS en UNA respuesta. NO pipelines paralelos. Respuesta coherente.',
    failureSignals: [
      'Varias respuestas pisándose',
      'Texto duplicado',
      'Ignora mensajes posteriores',
      'Respuesta caótica',
    ],
    burst: true,
  },
  {
    id: 'G5', chatId: 900100030, group: 'G', priority: 1,
    title: 'Cliente pregunta por PayPal',
    messages: ['hola', 'quiero fotos', 'puedo pagar con paypal?'],
    expected: 'PayPal desactivado → "paypal no bebe, solo bizum, crypto o stars".',
    failureSignals: [
      'Dice que sí cuando está desactivado',
      'Se inventa otro método',
    ],
  },
  {
    id: 'G6', chatId: 900100031, group: 'G', priority: 1,
    title: 'Cliente paga pero el pago falla',
    messages: ['hola', 'quiero 2 fotos de coño', 'bizum', 'ya lo hice'],
    expected: 'Verifica, NO hay pago. "dame un segundín, lo miro 👀" → tras timeout → "no me ha llegado nada bebe, seguro que lo mandaste?". NO envía contenido.',
    failureSignals: [
      'Envía fotos sin verificación',
      'Acusa al cliente directamente',
      'No da tiempo de espera',
    ],
  },

  // ─── GRUPO H — NUEVOS ESCENARIOS V2 (P1) ────────────────────────────────
  {
    id: 'H1', chatId: 900100101, group: 'H', priority: 1,
    title: 'Cliente pide un video por TÍTULO concreto',
    messages: ['hola', 'tienes algo con squirt?', 'quiero el de squirt en la ducha', 'crypto'],
    expected: 'Msg 2: Alba menciona v_001 y v_006 o propone el destacado. Msg 3: match exacto con v_001 (20€) → createOfferFromProduct. Msg 4: link NowPayments por 20€.',
    failureSignals: [
      'Match con video equivocado',
      'Precio distinto de 20€',
      'Pide "qué duración quieres" (modelo antiguo)',
      'Inventa un video sin id',
    ],
  },
  {
    id: 'H2', chatId: 900100102, group: 'H', priority: 1,
    title: 'Cliente pide 4 fotos de tetas (precio escalonado)',
    messages: ['hola', 'quiero 4 fotos de tetas', 'bizum'],
    expected: 'parseSinglePhotoRequest → {count:4, tag:"tetas"} → createOfferFromProduct("singles:tetas:4") → "son 18€ bebe" (4 fotos = 18€ por PHOTO_PRICE_TABLE) + instrucciones bizum.',
    failureSignals: [
      'Precio distinto de 18€',
      'No reconoce el número "4"',
      'Confunde tag "tetas"',
      'Aplica precio lineal (4 × 7 = 28€)',
    ],
  },
  {
    id: 'H3', chatId: 900100103, group: 'H', priority: 1,
    title: 'Sexting 15 min con roleplay (doctora) + cool_down',
    messages: ['hola', 'quiero sexting 15 min', 'bizum, ya pague', 'sé mi doctora'],
    expected: 'Plantilla st_15min (45€) → analyzeClientMessage detecta roleplay="doctora" → Alba arranca en rol sin romper límites (no menores, no física real). Fin con cool_down + mensaje despedida.',
    failureSignals: [
      'Ignora el rol de doctora',
      'Precio distinto de 45€',
      'Rompe el rol a mitad',
      'No hace cool_down al final (corta seco)',
    ],
  },
];

export const PRIORITY_1 = SCENARIOS.filter((s) => s.priority === 1);
export const PRIORITY_2 = SCENARIOS.filter((s) => s.priority === 2);
