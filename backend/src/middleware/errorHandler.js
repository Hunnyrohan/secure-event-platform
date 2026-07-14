'use strict';

const { HttpError } = require('../utils/httpError');
const logger = require('../utils/logger');

/** 404 for unmatched routes. */
function notFoundHandler(req, res) {
  res.status(404).json({ error: { message: 'Route not found' } });
}

/**
 * Central error handler. Never leaks stack traces or internal messages to
 * clients in production; logs the full detail server-side (redacted).
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // CSRF library uses this code.
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({ error: { message: 'Invalid or missing CSRF token' } });
  }

  if (err instanceof HttpError) {
    return res.status(err.status).json({
      error: { message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
  }

  logger.error('Unhandled error', {
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    path: req.originalUrl,
  });

  return res.status(500).json({ error: { message: 'Internal server error' } });
}

module.exports = { notFoundHandler, errorHandler };
