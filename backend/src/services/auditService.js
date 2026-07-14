'use strict';

const db = require('../config/db');
const logger = require('../utils/logger');

/**
 * Append-only audit logging. The logger redacts secrets before anything is
 * written, and callers must never pass passwords/OTPs in `metadata`.
 */

const ACTIONS = Object.freeze({
  REGISTER: 'REGISTER',
  EMAIL_VERIFY: 'EMAIL_VERIFY',
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILURE: 'LOGIN_FAILURE',
  LOGIN_LOCKED: 'LOGIN_LOCKED',
  MFA_CHALLENGE: 'MFA_CHALLENGE',
  MFA_SUCCESS: 'MFA_SUCCESS',
  MFA_FAILURE: 'MFA_FAILURE',
  MFA_ENABLED: 'MFA_ENABLED',
  MFA_DISABLED: 'MFA_DISABLED',
  LOGOUT: 'LOGOUT',
  TOKEN_REFRESH: 'TOKEN_REFRESH',
  TOKEN_REUSE_ALERT: 'TOKEN_REUSE_ALERT',
  PASSWORD_CHANGE: 'PASSWORD_CHANGE',
  ROLE_CHANGE: 'ROLE_CHANGE',
  USER_SUSPEND: 'USER_SUSPEND',
  EVENT_CREATE: 'EVENT_CREATE',
  EVENT_UPDATE: 'EVENT_UPDATE',
  EVENT_DELETE: 'EVENT_DELETE',
  BOOKING_CREATE: 'BOOKING_CREATE',
  BOOKING_CANCEL: 'BOOKING_CANCEL',
  DATA_EXPORT: 'DATA_EXPORT',
  ACCOUNT_DELETE: 'ACCOUNT_DELETE',
  SUSPICIOUS_LOGIN: 'SUSPICIOUS_LOGIN',
});

/**
 * @param {object} p
 * @param {string|null} p.actorId
 * @param {string} p.action     one of ACTIONS
 * @param {'success'|'failure'|'alert'} p.outcome
 */
async function record({
  actorId = null, action, targetType = null, targetId = null,
  outcome = 'success', req = null, metadata = {},
}) {
  const ip = req ? (req.ip || null) : null;
  const ua = req ? (req.headers['user-agent'] || null) : null;
  const safeMeta = logger.redact(metadata);
  try {
    await db.query(
      `INSERT INTO audit_logs
         (actor_id, action, target_type, target_id, outcome, ip_address, user_agent, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [actorId, action, targetType, targetId, outcome, ip, ua, JSON.stringify(safeMeta)],
    );
  } catch (err) {
    // Audit failures must never break the request flow, but must be visible.
    logger.error('Failed to write audit log', { action, message: err.message });
  }
}

/** Searchable/filterable log query for the admin dashboard. */
async function search({
  action, actorId, outcome, from, to, limit = 100, offset = 0,
}) {
  const clauses = [];
  const params = [];
  const add = (sql, val) => { params.push(val); clauses.push(sql.replace('?', `$${params.length}`)); };

  if (action) add('action = ?', action);
  if (actorId) add('actor_id = ?', actorId);
  if (outcome) add('outcome = ?', outcome);
  if (from) add('created_at >= ?', from);
  if (to) add('created_at <= ?', to);

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(Math.min(Number(limit) || 100, 500));
  params.push(Number(offset) || 0);

  const { rows } = await db.query(
    `SELECT id, actor_id, action, target_type, target_id, outcome,
            ip_address, created_at, metadata
       FROM audit_logs ${where}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return rows;
}

module.exports = { record, search, ACTIONS };
