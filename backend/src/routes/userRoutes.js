'use strict';

const express = require('express');
const ctrl = require('../controllers/userController');
const bookingCtrl = require('../controllers/bookingController');
const authenticate = require('../middleware/authenticate');
const { changePasswordRules, updateProfileRules, mfaEnableRules } = require('../validators');

const router = express.Router();

// Every route here is self-scoped: it acts on req.user.id, never on an id
// taken from the URL -> structurally immune to IDOR.
router.use(authenticate);

router.get('/me', ctrl.me);
router.patch('/me', updateProfileRules, ctrl.updateMe);
router.get('/me/bookings', bookingCtrl.history);
router.post('/me/change-password', changePasswordRules, ctrl.changePassword);
router.post('/me/mfa/setup', ctrl.setupMfa);
router.post('/me/mfa/enable', mfaEnableRules, ctrl.enableMfa);
router.post('/me/mfa/disable', ctrl.disableMfa);
router.get('/me/export', ctrl.exportData);
router.delete('/me', ctrl.deleteAccount);

module.exports = router;
