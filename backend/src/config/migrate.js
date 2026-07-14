'use strict';

/* Simple, dependency-free migration runner: executes every .sql file in
 * ../../migrations in lexical order. Idempotent because the SQL uses
 * IF NOT EXISTS / guarded CREATE TYPE blocks. */

const fs = require('fs');
const path = require('path');
const { pool } = require('./db');
const logger = require('../utils/logger');

async function run() {
  const dir = path.join(__dirname, '..', '..', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    logger.info(`Running migration: ${file}`);
    // eslint-disable-next-line no-await-in-loop
    await pool.query(sql);
  }
  logger.info('Migrations complete');
  await pool.end();
}

run().catch((err) => {
  logger.error('Migration failed', { message: err.message });
  process.exit(1);
});
