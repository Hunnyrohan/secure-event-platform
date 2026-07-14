'use strict';

const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const db = require('../config/db');
const userModel = require('../models/userModel');
const {
  encrypt, decrypt, safeEqual, randomToken,
} = require('../utils/crypto');
const { badRequest } = require('../utils/httpError');

/**
 * Google Authenticator (TOTP) multi-factor authentication.
 *   - A per-user TOTP secret is generated with speakeasy and stored ONLY as
 *     AES-256-GCM ciphertext (users.mfa_secret_cipher) — never in plaintext.
 *   - Setup returns an otpauth:// URI + QR code the user scans into Google
 *     Authenticator / Authy. MFA is not active until the user proves posession
 *     of the secret by confirming a code (enable()).
 *   - Ten single-use recovery codes are generated on enable, stored encrypted,
 *     and shown to the user exactly once.
 *   - Verification is done with a +/-1 step window and constant-time compares.
 */

const ISSUER = 'SecureEvent';
const RECOVERY_CODE_COUNT = 10;

/** Verify a 6-digit TOTP token against a base32 secret (tolerates clock drift). */
function verifyTotp(base32Secret, token) {
  return speakeasy.totp.verify({
    secret: base32Secret,
    encoding: 'base32',
    token: String(token).trim(),
    window: 1,
  });
}

/**
 * Begin enrollment: generate + persist a (still-inactive) secret and return the
 * QR/otpauth data for the client. Safe to call repeatedly before confirmation.
 */
async function setup(user) {
  if (user.mfa_enabled) throw badRequest('MFA is already enabled. Disable it first to re-enrol.');

  const secret = speakeasy.generateSecret({
    length: 20,
    name: `${ISSUER} (${user.email})`,
    issuer: ISSUER,
  });

  await userModel.setMfaSecret(user.id, encrypt(secret.base32));
  const qrDataUrl = await qrcode.toDataURL(secret.otpauth_url);

  // `secret.base32` is returned once so the user can key it in manually if they
  // cannot scan the QR. It is NOT persisted in plaintext anywhere.
  return { otpauthUrl: secret.otpauth_url, qrDataUrl, manualKey: secret.base32 };
}

/** Generate + persist fresh recovery codes, replacing any existing ones. */
async function generateRecoveryCodes(userId) {
  await db.query('DELETE FROM recovery_codes WHERE user_id = $1', [userId]);
  const codes = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i += 1) {
    // 10-char base32-ish, human-readable, from a CSPRNG.
    const code = randomToken(8).replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toUpperCase();
    codes.push(code);
    // eslint-disable-next-line no-await-in-loop
    await db.query('INSERT INTO recovery_codes (user_id, code_cipher) VALUES ($1,$2)',
      [userId, encrypt(code)]);
  }
  return codes;
}

/**
 * Confirm enrollment: the user submits a code from their authenticator app; if
 * it matches the pending secret we flip mfa_enabled on and issue recovery codes.
 * @returns {Promise<string[]>} one-time recovery codes (show once, never again)
 */
async function enable(user, token) {
  if (!user.mfa_secret_cipher) throw badRequest('Start MFA setup before confirming.');
  const secret = decrypt(user.mfa_secret_cipher);
  if (!verifyTotp(secret, token)) throw badRequest('Invalid authenticator code. Try again.');

  await userModel.setMfaEnabled(user.id, true);
  return generateRecoveryCodes(user.id);
}

/** Consume a single-use recovery code (constant-time match). */
async function consumeRecoveryCode(userId, submitted) {
  const { rows } = await db.query(
    'SELECT id, code_cipher FROM recovery_codes WHERE user_id = $1 AND used_at IS NULL',
    [userId],
  );
  const candidate = String(submitted).trim().toUpperCase();
  for (const r of rows) {
    if (safeEqual(decrypt(r.code_cipher), candidate)) {
      // eslint-disable-next-line no-await-in-loop
      await db.query('UPDATE recovery_codes SET used_at = now() WHERE id = $1', [r.id]);
      return true;
    }
  }
  return false;
}

/**
 * Login-time verification: accept either a valid TOTP code or an unused
 * recovery code. Throws on failure so the caller can audit it.
 */
async function verify(user, token) {
  if (!user.mfa_enabled || !user.mfa_secret_cipher) throw badRequest('MFA is not configured.');
  const secret = decrypt(user.mfa_secret_cipher);
  if (verifyTotp(secret, token)) return true;
  if (await consumeRecoveryCode(user.id, token)) return true;
  throw badRequest('Invalid authenticator or recovery code.');
}

/** Turn MFA off and destroy the secret + recovery codes. */
async function disable(userId) {
  await userModel.setMfaSecret(userId, null);
  await userModel.setMfaEnabled(userId, false);
  await db.query('DELETE FROM recovery_codes WHERE user_id = $1', [userId]);
}

module.exports = {
  setup, enable, verify, disable, generateRecoveryCodes,
};
