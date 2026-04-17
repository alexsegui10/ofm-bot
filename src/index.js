import { createApp } from './app.js';
import { runMigrations, closePool } from './lib/db.js';
import { getBot, setWebhook } from './lib/telegram.js';
import { registerBusinessHandlers } from './handlers/business.js';
import { registerPaymentHandlers } from './handlers/payments.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';

async function start() {
  logger.info({ env: env.NODE_ENV, port: env.PORT }, 'starting ofm-bot');

  // 1. DB migrations (idempotent)
  await runMigrations();

  // 2. Register all bot event handlers
  registerBusinessHandlers(getBot());
  registerPaymentHandlers(getBot());

  // 3. Register Telegram webhook URL (non-fatal: tunnel may not be up yet)
  try {
    await setWebhook();
  } catch (err) {
    logger.warn({ err: err.message }, 'setWebhook failed — tunnel may not be running. Server will start anyway. Re-register manually when tunnel is up.');
  }

  // 4. Start HTTP server
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, webhook: env.WEBHOOK_BASE_URL }, 'http server ready');
  });

  // Graceful shutdown
  const shutdown = async (signal) => {
    logger.info({ signal }, 'shutting down');
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  logger.fatal({ err }, 'startup failed');
  process.exit(1);
});
