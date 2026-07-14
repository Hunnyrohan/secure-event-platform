'use strict';

const helmet = require('helmet');
const cors = require('cors');
const hpp = require('hpp');
const config = require('../config/env');
const { forbidden } = require('../utils/httpError');

/**
 * Helmet configuration -> security headers (CSP, HSTS, X-Frame-Options,
 * X-Content-Type-Options, Referrer-Policy, etc.). The API returns JSON only,
 * so the CSP is deliberately strict (`default-src 'none'`).
 */
const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      'default-src': ["'none'"],
      'frame-ancestors': ["'none'"],       // clickjacking defence
      'base-uri': ["'none'"],
      'form-action': ["'none'"],
      'connect-src': ["'self'"],
    },
  },
  hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'no-referrer' },
  crossOriginResourcePolicy: { policy: 'same-site' },
  // Sets `X-Content-Type-Options: nosniff` — API responses are never rendered
  // as pages, so sniff-based downloads are disabled.
  xContentTypeOptions: true,
});

/**
 * Strict CORS: only the configured origins may call the API, credentials
 * (cookies) are allowed, and we echo the required headers for CSRF.
 */
const corsMiddleware = cors({
  origin(origin, callback) {
    // Same-origin / server-to-server (no Origin header) is allowed.
    if (!origin) return callback(null, true);
    if (config.clientOrigins.includes(origin)) return callback(null, true);
    return callback(forbidden('Origin not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Captcha-Token'],
  maxAge: 600,
});

module.exports = {
  helmetMiddleware,
  corsMiddleware,
  hppMiddleware: hpp(),                 // HTTP parameter-pollution guard
};
