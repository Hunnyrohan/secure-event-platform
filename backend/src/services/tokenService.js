'use strict';

const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const config = require('../config/env');
const { sha256 } = require('../utils/crypto');
const audit = require('./auditService');
const logger = require('../utils/logger');

/**
 * Access + refresh token handling with refresh-token ROTATION and
 * reuse detection ("token family" pattern):
 *   - Each login starts a token family (random family_id).
 *   - Every refresh issues a new refresh token and revokes the old one.
 *   - If a *revoked* refresh token is ever presented again, we treat it as
 *     theft and revoke the entire family, forcing re-authentication.
 */

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessTtl, algorithm: 'HS256' },
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, config.jwt.accessSecret, { algorithms: ['HS256'] });
}

function ttlToDate(ttl) {
  // supports "7d" / "15m" style strings for the DB expiry column
  const m = /^(\d+)([smhd])$/.exec(ttl);
  const mult = { s: 1e3, m: 6e4, h: 36e5, d: 864e5 };
  const ms = m ? Number(m[1]) * mult[m[2]] : 7 * 864e5;
  return new Date(Date.now() + ms);
}

async function issueRefreshToken(user, familyId, req) {
  const jti = uuidv4();
  const token = jwt.sign(
    { sub: user.id, fam: familyId, jti },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshTtl, algorithm: 'HS256' },
  );
  await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, family_id, user_agent, ip_address, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [user.id, sha256(token), familyId,
      req?.headers['user-agent'] || null, req?.ip || null, ttlToDate(config.jwt.refreshTtl)],
  );
  return token;
}

/** Called on login: fresh family + first refresh token. */
async function startSession(user, req) {
  const familyId = uuidv4();
  const refreshToken = await issueRefreshToken(user, familyId, req);
  return { accessToken: signAccessToken(user), refreshToken };
}

/**
 * Rotate a presented refresh token. Returns new access+refresh tokens.
 * Throws on invalid/expired/reused tokens.
 */
async function rotate(presentedToken, req, loadUser) {
  let payload;
  try {
    payload = jwt.verify(presentedToken, config.jwt.refreshSecret, { algorithms: ['HS256'] });
  } catch (e) {
    const err = new Error('Invalid refresh token'); err.status = 401; throw err;
  }

  const hash = sha256(presentedToken);
  const { rows } = await db.query(
    'SELECT * FROM refresh_tokens WHERE token_hash = $1 LIMIT 1', [hash],
  );
  const stored = rows[0];

  // Unknown token that nonetheless verifies => secret leak or forgery attempt.
  if (!stored) { const e = new Error('Refresh token not recognised'); e.status = 401; throw e; }

  // Reuse of an already-revoked token => compromise. Revoke whole family.
  if (stored.revoked_at) {
    await db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL',
      [stored.family_id]);
    await audit.record({
      actorId: stored.user_id, action: audit.ACTIONS.TOKEN_REUSE_ALERT,
      outcome: 'alert', req, metadata: { familyId: stored.family_id },
    });
    logger.warn('Refresh token reuse detected; family revoked', { userId: stored.user_id });
    const e = new Error('Refresh token reuse detected'); e.status = 401; throw e;
  }

  const user = await loadUser(payload.sub);
  if (!user || user.status !== 'active') {
    const e = new Error('Account not active'); e.status = 401; throw e;
  }

  // Revoke the presented token and issue a replacement in the same family.
  await db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1', [stored.id]);
  const newRefresh = await issueRefreshToken(user, stored.family_id, req);
  return { accessToken: signAccessToken(user), refreshToken: newRefresh, user };
}

/** Revoke a single refresh token (logout). */
async function revoke(presentedToken) {
  if (!presentedToken) return;
  await db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL',
    [sha256(presentedToken)]);
}

/** Revoke every active session for a user (e.g. after password change). */
async function revokeAllForUser(userId) {
  await db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
    [userId]);
}

module.exports = {
  signAccessToken, verifyAccessToken, startSession, rotate, revoke, revokeAllForUser,
};
