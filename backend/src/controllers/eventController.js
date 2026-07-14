'use strict';

const eventService = require('../services/eventService');
const asyncHandler = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const events = await eventService.list({
    limit: req.query.limit, offset: req.query.offset, category: req.query.category,
  });
  res.json({ events });
});

const getOne = asyncHandler(async (req, res) => {
  res.json({ event: await eventService.getById(req.params.id) });
});

const create = asyncHandler(async (req, res) => {
  const event = await eventService.create(req.user, req.body, req);
  res.status(201).json({ event });
});

const update = asyncHandler(async (req, res) => {
  const event = await eventService.update(req.user, req.params.id, req.body, req);
  res.json({ event });
});

const remove = asyncHandler(async (req, res) => {
  await eventService.remove(req.user, req.params.id, req);
  res.status(204).send();
});

const attendees = asyncHandler(async (req, res) => {
  res.json({ attendees: await eventService.getAttendees(req.user, req.params.id) });
});

module.exports = { list, getOne, create, update, remove, attendees };
