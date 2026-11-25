import { createApp } from './app.js';
import { pool, db } from './db.js';
import { config } from './config.js';
import { logger } from './logger.js';

const app = createApp(db);

const server = app.listen(config.port, () => {
  logger.info(`Rental debt API is ready at http://localhost:${config.port}/api`);
});

async function shutdown(signal) {
  logger.info({ signal }, 'shutting down');
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandledRejection'));
