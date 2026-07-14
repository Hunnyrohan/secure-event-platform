'use strict';

const config = require('../config/env');

/**
 * Session cookies are HTTP-only (no JS access -> XSS can't steal tokens),
 * Secure in production (HTTPS only), and SameSite=strict (CSRF defence).
 */
const base = {
  httpOnly: true,
  secure: config.isProd,
  sameSite: 'strict',
  path: '/',
};

const ACCESS_COOKIE = 'access_token';
const REFRESH_COOKIE = 'refresh_token';

function setAuthCookies(res, { accessToken, refreshToken }) {
  res.cookie(ACCESS_COOKIE, accessToken, { ...base, maxAge: 15 * 60 * 1000 });
  // Refresh cookie scoped to the refresh endpoint only reduces its exposure.
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...base, path: '/api/auth', maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function clearAuthCookies(res) {
  res.clearCookie(ACCESS_COOKIE, { ...base });
  res.clearCookie(REFRESH_COOKIE, { ...base, path: '/api/auth' });
}

module.exports = {
  setAuthCookies, clearAuthCookies, ACCESS_COOKIE, REFRESH_COOKIE,
};
