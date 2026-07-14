'use strict';

const express = require('express');
const ctrl = require('../controllers/bookingController');
const authenticate = require('../middleware/authenticate');
const { validate, uuidParam } = require('../validators');

const router = express.Router();

// All booking actions require an authenticated user; ownership is enforced
// inside the service so no user can touch another user's booking (IDOR-safe).
router.use(authenticate);

router.get('/me', ctrl.history);
router.post('/events/:eventId', validate([uuidParam('eventId')]), ctrl.book);
router.post('/:id/cancel', validate([uuidParam('id')]), ctrl.cancel);

module.exports = router;
