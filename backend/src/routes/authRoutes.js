'use strict';

const express = require('express');
const ctrl = require('../controllers/authController');
const authenticate = require('../middleware/authenticate');
const { authLimiter, otpLimiter } = require('../middleware/rateLimiters');
const verifyCaptcha = require('../middleware/captcha');
const {
  registerRules, loginRules, mfaRules,
} = require('../validators');

const router = express.Router();

// Registration & verification
router.post('/register', authLimiter, verifyCaptcha, registerRules, ctrl.register);
router.post('/verify-email', authLimiter, ctrl.verifyEmail);

// Login (password) -> may return an MFA challenge
router.post('/login', authLimiter, verifyCaptcha, loginRules, ctrl.login);

// MFA step (TOTP) — the user reads the code from their authenticator app.
router.post('/mfa/verify', otpLimiter, mfaRules, ctrl.verifyMfa);

// Session lifecycle
router.post('/refresh', ctrl.refresh);
router.post('/logout', authenticate, ctrl.logout);

module.exports = router;
