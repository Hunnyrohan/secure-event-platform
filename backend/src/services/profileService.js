'use strict';

const db = require('../config/db');
const userModel = require('../models/userModel');
const mfaService = require('./mfaService');
const tokenService = require('./tokenService');
const audit = require('./auditService');
const { notFound } = require('../utils/httpError');
const { sanitizePlain, sanitizeRich } = require('../utils/sanitize');

/** Current user's own profile (self scope only). */
async function getMe(userId) {
  const user = await userModel.findById(userId);
  if (!user) throw notFound('User not found');
  return userModel.publicView(user);
}

/**
 * Whitelisted update -> mass-assignment safe (see userModel.updateProfile).
 * User-generated text is sanitized (sanitize-html) before storage so a stored
 * XSS payload can never be persisted. `bio` allows a small formatting
 * allow-list; `fullName` is stripped to plain text.
 */
async function updateMe(userId, body) {
  const updated = await userModel.updateProfile(userId, {
    fullName: body.fullName === undefined ? undefined : sanitizePlain(body.fullName),
    bio: body.bio === undefined ? undefined : sanitizeRich(body.bio),
    avatarPath: body.avatarPath,
  });
  return userModel.publicView(updated);
}

/**
 * Step 1 of enrollment: generate a TOTP secret and hand back the QR / otpauth
 * URI. MFA is NOT yet active — the user must confirm with enableMfa().
 */
async function setupMfa(userId) {
  const user = await userModel.findById(userId);
  if (!user) throw notFound('User not found');
  return mfaService.setup(user);
}

/**
 * Step 2 of enrollment: verify a code from the authenticator app, activate MFA,
 * and return the one-time recovery codes (shown to the user exactly once).
 */
async function enableMfa(userId, token, req) {
  const user = await userModel.findById(userId);
  if (!user) throw notFound('User not found');
  const recoveryCodes = await mfaService.enable(user, token);
  await audit.record({ actorId: userId, action: audit.ACTIONS.MFA_ENABLED, req });
  return recoveryCodes;
}

async function disableMfa(userId, req) {
  await mfaService.disable(userId);
  await audit.record({ actorId: userId, action: audit.ACTIONS.MFA_DISABLED, req });
}

/**
 * GDPR-style personal-data export: everything we hold about the user, minus
 * secrets (password hashes, OTP ciphertext, token hashes are excluded).
 */
async function exportData(userId, req) {
  const user = await userModel.findById(userId);
  if (!user) throw notFound('User not found');

  const [bookings, events, notifications] = await Promise.all([
    db.query('SELECT id, event_id, status, created_at FROM bookings WHERE user_id = $1', [userId]),
    db.query('SELECT id, title, starts_at, created_at FROM events WHERE organizer_id = $1', [userId]),
    db.query('SELECT id, title, body, is_read, created_at FROM notifications WHERE user_id = $1', [userId]),
  ]);

  await audit.record({ actorId: userId, action: audit.ACTIONS.DATA_EXPORT, req });

  return {
    exportedAt: new Date().toISOString(),
    profile: userModel.publicView(user),
    bookings: bookings.rows,
    organizedEvents: events.rows,
    notifications: notifications.rows,
  };
}

/** Hard delete of the account and (via ON DELETE CASCADE) all owned rows. */
async function deleteAccount(userId, req) {
  await tokenService.revokeAllForUser(userId);
  await audit.record({ actorId: userId, action: audit.ACTIONS.ACCOUNT_DELETE, req });
  await userModel.remove(userId);
}

module.exports = {
  getMe, updateMe, setupMfa, enableMfa, disableMfa, exportData, deleteAccount,
};
