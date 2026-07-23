'use strict';

const express = require('express');
const ctrl = require('../controllers/userController');
const bookingCtrl = require('../controllers/bookingController');
const authenticate = require('../middleware/authenticate');
const { sensitiveActionLimiter } = require('../middleware/rateLimiters');
const { changePasswordRules, updateProfileRules, mfaEnableRules } = require('../validators');

const router = express.Router();

// Every route here is self-scoped: it acts on req.user.id, never on an id
// taken from the URL -> structurally immune to IDOR.
router.use(authenticate);

router.get('/me', ctrl.me);
router.patch('/me', updateProfileRules, ctrl.updateMe);
router.get('/me/bookings', bookingCtrl.history);
// Sensitive state-changing actions get a tight per-user limiter (defence in
// depth against a hijacked session), applied before validation so malformed
// requests also count against the budget.
router.post('/me/change-password', sensitiveActionLimiter, changePasswordRules, ctrl.changePassword);
router.post('/me/mfa/setup', ctrl.setupMfa);
router.post('/me/mfa/enable', sensitiveActionLimiter, mfaEnableRules, ctrl.enableMfa);
router.post('/me/mfa/disable', sensitiveActionLimiter, ctrl.disableMfa);
router.get('/me/export', ctrl.exportData);
router.delete('/me', ctrl.deleteAccount);

module.exports = router;
