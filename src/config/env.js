import 'dotenv/config';

function get(name, fallback = '') {
  return process.env[name] ?? fallback;
}

export const env = {
  // Telegram
  TELEGRAM_BOT_TOKEN: get('TELEGRAM_BOT_TOKEN'),
  TELEGRAM_BUSINESS_CONNECTION_ID: get('TELEGRAM_BUSINESS_CONNECTION_ID'),

  // LLMs
  ANTHROPIC_API_KEY: get('ANTHROPIC_API_KEY'),
  OPENROUTER_API_KEY: get('OPENROUTER_API_KEY'),
  MODEL_PERSONA: get('MODEL_PERSONA', 'sao10k/l3.3-euryale-70b'),
  MODEL_PERSONA_FALLBACK: get('MODEL_PERSONA_FALLBACK', 'cognitivecomputations/dolphin-mistral-24b-venice-edition:free'),

  // Payments
  NOWPAYMENTS_API_KEY: get('NOWPAYMENTS_API_KEY'),
  NOWPAYMENTS_IPN_SECRET: get('NOWPAYMENTS_IPN_SECRET'),
  PAYPAL_CLIENT_ID: get('PAYPAL_CLIENT_ID'),
  PAYPAL_CLIENT_SECRET: get('PAYPAL_CLIENT_SECRET'),
  PAYPAL_MODE: get('PAYPAL_MODE', 'live'),
  PAYPAL_ENABLED: get('PAYPAL_ENABLED', 'false'),
  BIZUM_NUMBER: get('PARTNER_WHATSAPP_TO'), // partner phone doubles as Bizum number

  // WhatsApp
  TWILIO_ACCOUNT_SID: get('TWILIO_ACCOUNT_SID'),
  TWILIO_AUTH_TOKEN: get('TWILIO_AUTH_TOKEN'),
  TWILIO_WHATSAPP_FROM: get('TWILIO_WHATSAPP_FROM'),
  OWNER_WHATSAPP_TO: get('OWNER_WHATSAPP_TO'),
  PARTNER_WHATSAPP_TO: get('PARTNER_WHATSAPP_TO'),

  // Database
  DATABASE_URL: get('DATABASE_URL', 'postgresql://botuser:botpass@localhost:5433/ofmbot'),

  // Server
  PORT: parseInt(get('PORT', '4000'), 10),
  NODE_ENV: get('NODE_ENV', 'development'),
  WEBHOOK_BASE_URL: get('WEBHOOK_BASE_URL', 'https://bot-dev.luxemodels.eu'),
  TEST_MODE: get('TEST_MODE', 'false').toLowerCase() === 'true',
};
