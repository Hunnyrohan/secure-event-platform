'use strict';

const bcrypt = require('bcrypt');
const config = require('../config/env');

/**
 * Password policy (mirrors the client-side strength meter so server is the
 * authoritative gate):
 *   - >= 12 characters
 *   - upper, lower, digit, symbol
 *   - not in a small deny-list of common passwords
 * bcrypt with cost 12 is used for hashing.
 */

const COMMON = new Set([
  'password', 'password1', 'password123', '123456', '12345678', 'qwerty',
  'letmein', 'admin', 'welcome', 'iloveyou', 'changeme', 'passw0rd',
]);

const RULES = [
  { test: (p) => p.length >= 12, msg: 'at least 12 characters' },
  { test: (p) => /[a-z]/.test(p), msg: 'a lowercase letter' },
  { test: (p) => /[A-Z]/.test(p), msg: 'an uppercase letter' },
  { test: (p) => /[0-9]/.test(p), msg: 'a digit' },
  { test: (p) => /[^A-Za-z0-9]/.test(p), msg: 'a symbol' },
  { test: (p) => !COMMON.has(p.toLowerCase()), msg: 'not a common password' },
];

/** @returns {{ok:boolean, missing:string[], score:number}} */
function evaluate(password) {
  const pwd = String(password || '');
  const missing = RULES.filter((r) => !r.test(pwd)).map((r) => r.msg);
  // 0-5 score for a strength meter (length bonus capped).
  let score = 0;
  if (pwd.length >= 12) score += 1;
  if (pwd.length >= 16) score += 1;
  if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score += 1;
  if (/[0-9]/.test(pwd)) score += 1;
  if (/[^A-Za-z0-9]/.test(pwd)) score += 1;
  return { ok: missing.length === 0, missing, score: Math.min(score, 5) };
}

async function hash(password) {
  return bcrypt.hash(password, config.bcryptRounds);
}

async function verify(password, storedHash) {
  return bcrypt.compare(password, storedHash);
}

module.exports = { evaluate, hash, verify };
