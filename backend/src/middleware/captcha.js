'use strict';

const config = require('../config/env');
const logger = require('../utils/logger');
const { badRequest } = require('../utils/httpError');

/**
 * Google reCAPTCHA verification applied to registration & login to frustrate
 * automated brute-force / credential-stuffing bots (automated-attack
 * mitigation, complementing the rate limiters + account lockout).
 *
 * The SPA solves the challenge and sends the token in the `X-Captcha-Token`
 * header (or `captchaToken` body field); this middleware validates it against
 * Google's siteverify API. Disabled when no secret is configured
 * (`CAPTCHA_ENABLED=false`) so local dev / tests run without a live key —
 * this preserves the existing auth flows unchanged in development.
 */

const VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';

/**
 * Calls Google's verification endpoint. Exported for unit testing (fetch is
 * mocked there so no network call is made).
 * @returns {Promise<boolean>} true only when Google confirms the token.
 */
async function verifyRecaptcha(token, remoteIp) {
  const params = new URLSearchParams({ secret: config.captcha.secret, response: token });
  if (remoteIp) params.append('remoteip', remoteIp);
  try {
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const data = await res.json();
    return data.success === true;
  } catch (err) {
    logger.error('reCAPTCHA verification error', { message: err.message });
    return false; // fail closed
  }
}

async function verifyCaptcha(req, res, next) {
  if (!config.captcha.enabled) return next();

  const token = req.headers['x-captcha-token'] || req.body?.captchaToken;
  if (!token) return next(badRequest('CAPTCHA verification required'));

  const ok = await verifyRecaptcha(token, req.ip);
  return ok ? next() : next(badRequest('CAPTCHA verification failed'));
}

module.exports = verifyCaptcha;
module.exports.verifyRecaptcha = verifyRecaptcha;
