'use strict';

/**
 * Operational error carrying an HTTP status code. Thrown by services and
 * translated to a safe JSON response by the central error handler — the
 * client never receives stack traces or internal details in production.
 */
class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
    this.expose = true; // safe to show `message` to the client
  }
}

const badRequest = (m, d) => new HttpError(400, m || 'Bad request', d);
const unauthorized = (m) => new HttpError(401, m || 'Authentication required');
const forbidden = (m) => new HttpError(403, m || 'You do not have permission to do that');
const notFound = (m) => new HttpError(404, m || 'Resource not found');
const conflict = (m) => new HttpError(409, m || 'Conflict');
const tooMany = (m) => new HttpError(429, m || 'Too many requests');

module.exports = {
  HttpError, badRequest, unauthorized, forbidden, notFound, conflict, tooMany,
};
