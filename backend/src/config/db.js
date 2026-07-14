'use strict';

const { Pool } = require('pg');
const config = require('./env');
const logger = require('../utils/logger');

/**
 * A single shared connection pool. We ALWAYS use parameterised queries
 * ($1, $2 ...) — never string concatenation — which is the primary
 * defence against SQL injection.
 */
const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  ssl: config.db.ssl,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.error('Unexpected PostgreSQL pool error', { message: err.message });
});

/**
 * Run a parameterised query.
 * @param {string} text  SQL with $1.. placeholders
 * @param {Array}  params
 */
async function query(text, params) {
  return pool.query(text, params);
}

/**
 * Run a set of statements inside a single transaction.
 * The callback receives a dedicated client; throwing rolls everything back.
 * Used by booking/creation flows to guarantee atomicity.
 */
async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
