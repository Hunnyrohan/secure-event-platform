'use strict';

const { body, param, query, validationResult } = require('express-validator');
const { badRequest } = require('../utils/httpError');

/**
 * Central validation gate. Runs the supplied express-validator chains, then
 * rejects on the first error with a 400 + field list. All user input passes
 * through here (defence against injection, XSS payloads, malformed data).
 * `.trim()` normalises input; user-generated content is then run through
 * `sanitize-html` in the service layer before storage (see utils/sanitize.js),
 * and the client renders everything as auto-escaped text. An allow-list
 * sanitizer is preferred over blanket `.escape()`: it removes dangerous
 * tags/attributes/URL-schemes precisely, permits safe rich formatting in long
 * fields, and preserves legitimate quotes/apostrophes that `.escape()` mangles.
 */
function validate(chains) {
  return [
    ...chains,
    (req, res, next) => {
      const errors = validationResult(req);
      if (errors.isEmpty()) return next();
      return next(badRequest('Validation failed', {
        fields: errors.array().map((e) => ({ field: e.path, message: e.msg })),
      }));
    },
  ];
}

// ---- Reusable field rules ------------------------------------------------
const email = body('email').isEmail().withMessage('Valid email required')
  .normalizeEmail().isLength({ max: 254 });

const strongPassword = body('password').isString().isLength({ min: 12, max: 128 })
  .withMessage('Password must be 12-128 characters');

const uuidParam = (name) => param(name).isUUID().withMessage(`${name} must be a UUID`);

// Username: 3-30 chars, letters/digits/underscore/dot/hyphen only. The strict
// character class doubles as an injection/XSS guard.
const username = body('username').isString().trim()
  .isLength({ min: 3, max: 30 })
  .matches(/^[a-zA-Z0-9._-]+$/)
  .withMessage('Username may contain only letters, digits, and . _ -');

// A 6-digit TOTP code OR a recovery code (alphanumeric, up to 20 chars).
const mfaCode = body('otp').isString().trim()
  .isLength({ min: 6, max: 20 })
  .matches(/^[a-zA-Z0-9]+$/)
  .withMessage('Enter your 6-digit code or a recovery code');

// ---- Chains --------------------------------------------------------------
const registerRules = validate([
  email,
  username,
  body('fullName').isString().trim().isLength({ min: 2, max: 120 }),
  strongPassword,
]);

const loginRules = validate([
  email,
  body('password').isString().isLength({ min: 1, max: 128 }),
]);

const mfaRules = validate([
  body('mfaToken').isString().notEmpty(),
  mfaCode,
]);

// Confirming MFA enrollment: a 6-digit TOTP code from the authenticator app.
const mfaEnableRules = validate([
  body('token').isString().trim().isLength({ min: 6, max: 6 }).isNumeric()
    .withMessage('Enter the 6-digit code from your authenticator app'),
]);

const changePasswordRules = validate([
  body('currentPassword').isString().notEmpty(),
  body('newPassword').isString().isLength({ min: 12, max: 128 }),
]);

const updateProfileRules = validate([
  body('fullName').optional().isString().trim().isLength({ min: 2, max: 120 }),
  body('bio').optional().isString().isLength({ max: 2000 }),
]);

const eventRules = validate([
  body('title').isString().trim().isLength({ min: 3, max: 160 }),
  body('description').isString().trim().isLength({ min: 3, max: 5000 }),
  body('location').isString().trim().isLength({ min: 2, max: 200 }),
  body('category').isString().trim().isLength({ min: 2, max: 60 }),
  body('startsAt').isISO8601().withMessage('startsAt must be an ISO-8601 date'),
  body('capacity').isInt({ min: 1, max: 100000 }).toInt(),
  body('ticketPrice').isFloat({ min: 0, max: 1000000 }).toFloat(),
]);

const roleChangeRules = validate([
  uuidParam('id'),
  body('role').isIn(['admin', 'organizer', 'user']),
]);

const listQueryRules = validate([
  query('limit').optional().isInt({ min: 1, max: 200 }).toInt(),
  query('offset').optional().isInt({ min: 0 }).toInt(),
]);

module.exports = {
  validate, uuidParam,
  registerRules, loginRules, mfaRules, mfaEnableRules, changePasswordRules, updateProfileRules,
  eventRules, roleChangeRules, listQueryRules,
};
