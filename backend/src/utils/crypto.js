'use strict';

const crypto = require('crypto');
const config = require('../config/env');

/**
 * Application-level encryption for data-at-rest secrets (OTP codes,
 * recovery codes, and any other sensitive field) using AES-256-GCM.
 *
 * Key management strategy
 * -----------------------
 *   * The 256-bit key is supplied as DATA_ENCRYPTION_KEY (64 hex chars).
 *   * In production it MUST be injected from a KMS / secrets manager
 *     (AWS KMS, Vault, Azure Key Vault) at runtime — never baked into an
 *     image or committed. Rotate by adding a versioned key and re-wrapping.
 *   * GCM provides confidentiality AND integrity (auth tag), so tampered
 *     ciphertext fails to decrypt rather than silently returning garbage.
 *
 * Ciphertext format (all hex, colon-delimited):  iv:authTag:ciphertext
 */

const ALGO = 'aes-256-gcm';

function getKey() {
  const key = Buffer.from(config.encryptionKeyHex || '', 'hex');
  if (key.length !== 32) {
    throw new Error('DATA_ENCRYPTION_KEY must be 32 bytes (64 hex chars)');
  }
  return key;
}

function encrypt(plaintext) {
  const iv = crypto.randomBytes(12); // 96-bit nonce recommended for GCM
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

function decrypt(payload) {
  const [ivHex, tagHex, dataHex] = String(payload).split(':');
  if (!ivHex || !tagHex || !dataHex) throw new Error('Malformed ciphertext');
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]);
  return dec.toString('utf8');
}

/** One-way SHA-256, used to store opaque tokens (refresh / verification). */
function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

/** Cryptographically-strong URL-safe random token. */
function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** Numeric OTP of the configured length, generated without modulo bias. */
function generateOtp(length = config.otp.length) {
  let otp = '';
  while (otp.length < length) {
    const byte = crypto.randomBytes(1)[0];
    if (byte < 250) otp += (byte % 10).toString(); // reject >=250 to avoid bias
  }
  return otp;
}

/** Constant-time string comparison to prevent timing attacks. */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = {
  encrypt, decrypt, sha256, randomToken, generateOtp, safeEqual,
};
