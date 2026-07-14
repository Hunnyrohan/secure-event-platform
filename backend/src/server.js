'use strict';

const createApp = require('./app');
const config = require('./config/env');
const logger = require('./utils/logger');
const { pool } = require('./config/db');

const app = createApp();

const server = app.listen(config.port, () => {
  logger.info(`API listening on port ${config.port}`, { env: config.env });
});

// Graceful shutdown: stop accepting connections, drain the DB pool.
function shutdown(signal) {
  logger.info(`Received ${signal}, shutting down`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  // Force-exit if cleanup hangs.
  setTimeout(() => process.exit(1), 10000).unref();
}
['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, () => shutdown(sig)));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { message: String(reason) });
});

module.exports = server;
