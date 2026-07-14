'use strict';

const bookingService = require('../services/bookingService');
const asyncHandler = require('../utils/asyncHandler');

const book = asyncHandler(async (req, res) => {
  const booking = await bookingService.book(req.user, req.params.eventId, req);
  res.status(201).json({ booking });
});

const cancel = asyncHandler(async (req, res) => {
  const booking = await bookingService.cancel(req.user, req.params.id, req);
  res.json({ booking });
});

const history = asyncHandler(async (req, res) => {
  res.json({ bookings: await bookingService.history(req.user.id) });
});

module.exports = { book, cancel, history };
