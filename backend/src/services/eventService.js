'use strict';

const eventModel = require('../models/eventModel');
const audit = require('./auditService');
const { notFound, forbidden } = require('../utils/httpError');
const { sanitizePlain, sanitizeRich } = require('../utils/sanitize');

/**
 * Sanitize user-generated event content before it is persisted (stored-XSS
 * defence). Short fields are reduced to plain text; the longer description is
 * run through the restrictive rich allow-list. Only fields that are present
 * are touched, so partial updates (COALESCE) keep working.
 */
function sanitizeEventData(data) {
  const out = { ...data };
  if (out.title !== undefined) out.title = sanitizePlain(out.title);
  if (out.location !== undefined) out.location = sanitizePlain(out.location);
  if (out.category !== undefined) out.category = sanitizePlain(out.category);
  if (out.description !== undefined) out.description = sanitizeRich(out.description);
  return out;
}

/**
 * Ownership / access-control helper. Organizers may act only on their OWN
 * events (horizontal access control); admins may act on any (vertical).
 * This is the server-side authorization that IDOR attacks try to bypass.
 */
function assertCanManage(eventRow, user) {
  if (!eventRow) throw notFound('Event not found');
  if (user.role === 'admin') return;
  if (eventRow.organizer_id !== user.id) throw forbidden('You do not own this event');
}

async function create(user, data, req) {
  const event = await eventModel.create(user.id, sanitizeEventData(data));
  await audit.record({
    actorId: user.id, action: audit.ACTIONS.EVENT_CREATE,
    targetType: 'event', targetId: event.id, req,
  });
  return event;
}

async function update(user, id, data, req) {
  const existing = await eventModel.findById(id);
  assertCanManage(existing, user);
  const event = await eventModel.update(id, sanitizeEventData(data));
  await audit.record({
    actorId: user.id, action: audit.ACTIONS.EVENT_UPDATE,
    targetType: 'event', targetId: id, req,
  });
  return event;
}

async function remove(user, id, req) {
  const existing = await eventModel.findById(id);
  assertCanManage(existing, user);
  await eventModel.remove(id);
  await audit.record({
    actorId: user.id, action: audit.ACTIONS.EVENT_DELETE,
    targetType: 'event', targetId: id, req,
  });
}

async function getAttendees(user, id) {
  const existing = await eventModel.findById(id);
  assertCanManage(existing, user);
  return eventModel.attendees(id);
}

async function getById(id) {
  const row = await eventModel.findById(id);
  if (!row) throw notFound('Event not found');
  return eventModel.view(row);
}

const list = (opts) => eventModel.list(opts);

module.exports = { create, update, remove, getAttendees, getById, list, assertCanManage };
