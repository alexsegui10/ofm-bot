import { runMigrations, closePool } from '../src/lib/db.js';
import { logger } from '../src/lib/logger.js';

try {
  await runMigrations();
  logger.info('all migrations applied');
} catch (err) {
  logger.fatal({ err }, 'migration failed');
  process.exit(1);
} finally {
  await closePool();
}
