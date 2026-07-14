'use strict';

const db = require('../config/db');

/**
 * All queries are parameterised (SQLi-safe). `publicView` is the ONLY shape
 * returned to clients — it excludes password_hash and internal counters,
 * preventing sensitive-data exposure.
 */
function publicView(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    fullName: row.full_name,
    bio: row.bio,
    role: row.role,
    status: row.status,
    emailVerified: row.email_verified,
    mfaEnabled: row.mfa_enabled,
    avatarPath: row.avatar_path,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

async function findById(id) {
  const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] || null;
}

async function findByEmail(email) {
  const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
  return rows[0] || null;
}

async function findByUsername(username) {
  const { rows } = await db.query('SELECT * FROM users WHERE username = $1', [username]);
  return rows[0] || null;
}

async function create({
  email, username, passwordHash, fullName, role = 'user',
}) {
  const { rows } = await db.query(
    `INSERT INTO users (email, username, password_hash, full_name, role, status)
     VALUES ($1,$2,$3,$4,$5,'pending_verification')
     RETURNING *`,
    [email, username, passwordHash, fullName, role],
  );
  await db.query('INSERT INTO password_history (user_id, password_hash) VALUES ($1,$2)',
    [rows[0].id, passwordHash]);
  return rows[0];
}

/**
 * Whitelisted profile update -> defends against MASS ASSIGNMENT. Only the
 * three named columns can ever be written; role/status/email_verified are
 * unreachable from this path.
 */
async function updateProfile(id, { fullName, bio, avatarPath }) {
  const { rows } = await db.query(
    `UPDATE users
        SET full_name = COALESCE($2, full_name),
            bio = COALESCE($3, bio),
            avatar_path = COALESCE($4, avatar_path)
      WHERE id = $1
      RETURNING *`,
    [id, fullName ?? null, bio ?? null, avatarPath ?? null],
  );
  return rows[0] || null;
}

async function setPassword(id, passwordHash) {
  await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, id]);
  await db.query('INSERT INTO password_history (user_id, password_hash) VALUES ($1,$2)',
    [id, passwordHash]);
}

/** Last N hashes for reuse prevention. */
async function recentPasswordHashes(id, n = 5) {
  const { rows } = await db.query(
    'SELECT password_hash FROM password_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
    [id, n],
  );
  return rows.map((r) => r.password_hash);
}

async function markEmailVerified(id) {
  await db.query(
    "UPDATE users SET email_verified = TRUE, status = 'active' WHERE id = $1", [id],
  );
}

async function setMfaEnabled(id, enabled) {
  await db.query('UPDATE users SET mfa_enabled = $1 WHERE id = $2', [enabled, id]);
}

/** Store the AES-GCM ciphertext of the TOTP secret (or NULL to clear it). */
async function setMfaSecret(id, secretCipher) {
  await db.query('UPDATE users SET mfa_secret_cipher = $1 WHERE id = $2', [secretCipher, id]);
}

// ---- Account-protection helpers (lockout) --------------------------------
async function registerFailedLogin(id, maxAttempts, lockMinutes) {
  const { rows } = await db.query(
    `UPDATE users
        SET failed_login_count = failed_login_count + 1,
            locked_until = CASE WHEN failed_login_count + 1 >= $2
                                THEN now() + ($3 || ' minutes')::interval
                                ELSE locked_until END
      WHERE id = $1
      RETURNING failed_login_count, locked_until`,
    [id, maxAttempts, String(lockMinutes)],
  );
  return rows[0];
}

async function resetFailedLogins(id, ip) {
  await db.query(
    `UPDATE users
        SET failed_login_count = 0, locked_until = NULL,
            last_login_at = now(), last_login_ip = $2
      WHERE id = $1`,
    [id, ip || null],
  );
}

// ---- Admin operations ----------------------------------------------------
async function list({ limit = 50, offset = 0 } = {}) {
  const { rows } = await db.query(
    'SELECT * FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2',
    [Math.min(Number(limit) || 50, 200), Number(offset) || 0],
  );
  return rows.map(publicView);
}

async function setRole(id, role) {
  const { rows } = await db.query(
    'UPDATE users SET role = $2 WHERE id = $1 RETURNING *', [id, role],
  );
  return rows[0] || null;
}

async function setStatus(id, status) {
  const { rows } = await db.query(
    'UPDATE users SET status = $2 WHERE id = $1 RETURNING *', [id, status],
  );
  return rows[0] || null;
}

async function remove(id) {
  await db.query('DELETE FROM users WHERE id = $1', [id]);
}

module.exports = {
  publicView, findById, findByEmail, findByUsername, create, updateProfile, setPassword,
  recentPasswordHashes, markEmailVerified, setMfaEnabled, setMfaSecret,
  registerFailedLogin, resetFailedLogins, list, setRole, setStatus, remove,
};
