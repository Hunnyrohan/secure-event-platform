'use strict';

const rateLimit = require('express-rate-limit');

/**
 * Layered rate limiting. In production, back this with a shared store
 * (Redis) so limits hold across replicas; the in-memory default is fine
 * for a single-node coursework deployment.
 */

const json429 = (req, res) => res.status(429).json({
  error: { message: 'Too many requests, please slow down and try again later.' },
});

// Broad limiter applied to the whole API.
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: json429,
});

// Tight limiter for auth endpoints to blunt brute force / credential stuffing.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: json429,
});

// OTP request / resend limiter (prevents email bombing + OTP brute force).
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: json429,
});

module.exports = { globalLimiter, authLimiter, otpLimiter };
