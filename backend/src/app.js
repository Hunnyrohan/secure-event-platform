'use strict';

const express = require('express');
const cookieParser = require('cookie-parser');

const config = require('./config/env');
const { helmetMiddleware, corsMiddleware, hppMiddleware } = require('./middleware/security');
const { globalLimiter } = require('./middleware/rateLimiters');
const { csrfProtection, issueToken } = require('./middleware/csrf');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const eventRoutes = require('./routes/eventRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const adminRoutes = require('./routes/adminRoutes');

function createApp() {
  const app = express();

  // Behind a reverse proxy (nginx / Docker) so req.ip is the real client IP.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // ---- Global security middleware (order matters) ----
  app.use(helmetMiddleware);
  app.use(corsMiddleware);
  app.use(express.json({ limit: '100kb' }));          // body-size cap = DoS guard
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(cookieParser());
  app.use(hppMiddleware);
  app.use(globalLimiter);

  // ---- Health check ----
  app.get('/api/health', (req, res) => res.json({ status: 'ok', ts: Date.now() }));

  // ---- CSRF: token issuer + protection on state-changing routes ----
  // Disabled in the test env so Supertest can exercise handlers directly.
  if (config.env !== 'test') {
    app.get('/api/csrf-token', csrfProtection, issueToken);
    app.use('/api/users', csrfProtection);
    app.use('/api/events', csrfProtection);
    app.use('/api/bookings', csrfProtection);
    app.use('/api/admin', csrfProtection);
    // Auth routes rely on SameSite=strict cookies + rate limiting; the login
    // and register endpoints are intentionally CSRF-exempt (no auth cookie yet).
  }

  // ---- API routes ----
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/events', eventRoutes);
  app.use('/api/bookings', bookingRoutes);
  app.use('/api/admin', adminRoutes);

  // ---- Fallthrough ----
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
