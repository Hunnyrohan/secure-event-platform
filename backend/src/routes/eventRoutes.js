'use strict';

const express = require('express');
const ctrl = require('../controllers/eventController');
const authenticate = require('../middleware/authenticate');
const { requireRole } = require('../middleware/authorize');
const { eventRules, uuidParam, validate, listQueryRules } = require('../validators');

const router = express.Router();

// Public browsing
router.get('/', listQueryRules, ctrl.list);
router.get('/:id', validate([uuidParam('id')]), ctrl.getOne);

// Organizer/admin management (RBAC + per-row ownership in the service).
router.post('/', authenticate, requireRole('organizer'), eventRules, ctrl.create);
router.put('/:id', authenticate, requireRole('organizer'),
  validate([uuidParam('id')]), eventRules, ctrl.update);
router.delete('/:id', authenticate, requireRole('organizer'),
  validate([uuidParam('id')]), ctrl.remove);
router.get('/:id/attendees', authenticate, requireRole('organizer'),
  validate([uuidParam('id')]), ctrl.attendees);

module.exports = router;
