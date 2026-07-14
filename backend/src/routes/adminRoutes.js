'use strict';

const express = require('express');
const ctrl = require('../controllers/adminController');
const authenticate = require('../middleware/authenticate');
const { requireRole } = require('../middleware/authorize');
const { roleChangeRules, uuidParam, validate, listQueryRules } = require('../validators');

const router = express.Router();

// Vertical access control: the entire admin surface requires the admin role.
router.use(authenticate, requireRole('admin'));

router.get('/users', listQueryRules, ctrl.listUsers);
router.patch('/users/:id/role', roleChangeRules, ctrl.changeRole);
router.post('/users/:id/suspend', validate([uuidParam('id')]), ctrl.suspendUser);
router.post('/users/:id/reactivate', validate([uuidParam('id')]), ctrl.reactivateUser);
router.get('/audit-logs', listQueryRules, ctrl.auditLogs);

module.exports = router;
