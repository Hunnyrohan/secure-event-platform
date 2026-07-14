'use strict';

const tokenService = require('../services/tokenService');
const { ACCESS_COOKIE } = require('../utils/cookies');
const { unauthorized } = require('../utils/httpError');

/**
 * Authentication middleware. Reads the access token from the HTTP-only
 * cookie (preferred) or Authorization: Bearer header (for API clients),
 * verifies it, and attaches a minimal `req.user`.
 */
function authenticate(req, res, next) {
  let token = req.cookies?.[ACCESS_COOKIE];
  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.slice(7);
  }
  if (!token) return next(unauthorized('Authentication required'));

  try {
    const payload = tokenService.verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role, email: payload.email };
    return next();
  } catch (e) {
    return next(unauthorized('Invalid or expired session'));
  }
}

module.exports = authenticate;
