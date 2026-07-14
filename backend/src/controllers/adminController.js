'use strict';

const userModel = require('../models/userModel');
const audit = require('../services/auditService');
const tokenService = require('../services/tokenService');
const asyncHandler = require('../utils/asyncHandler');
const { badRequest, notFound } = require('../utils/httpError');

const listUsers = asyncHandler(async (req, res) => {
  res.json({ users: await userModel.list({ limit: req.query.limit, offset: req.query.offset }) });
});

const changeRole = asyncHandler(async (req, res) => {
  // An admin must not accidentally strip their own admin rights while acting.
  if (req.params.id === req.user.id) throw badRequest('You cannot change your own role');
  const updated = await userModel.setRole(req.params.id, req.body.role);
  if (!updated) throw notFound('User not found');
  await tokenService.revokeAllForUser(req.params.id); // privilege change -> re-auth
  await audit.record({
    actorId: req.user.id, action: audit.ACTIONS.ROLE_CHANGE,
    targetType: 'user', targetId: req.params.id, req,
    metadata: { newRole: req.body.role },
  });
  res.json({ user: userModel.publicView(updated) });
});

const suspendUser = asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) throw badRequest('You cannot suspend yourself');
  const updated = await userModel.setStatus(req.params.id, 'suspended');
  if (!updated) throw notFound('User not found');
  await tokenService.revokeAllForUser(req.params.id);
  await audit.record({
    actorId: req.user.id, action: audit.ACTIONS.USER_SUSPEND,
    targetType: 'user', targetId: req.params.id, outcome: 'alert', req,
  });
  res.json({ user: userModel.publicView(updated) });
});

const reactivateUser = asyncHandler(async (req, res) => {
  const updated = await userModel.setStatus(req.params.id, 'active');
  if (!updated) throw notFound('User not found');
  res.json({ user: userModel.publicView(updated) });
});

const auditLogs = asyncHandler(async (req, res) => {
  const logs = await audit.search({
    action: req.query.action, actorId: req.query.actorId, outcome: req.query.outcome,
    from: req.query.from, to: req.query.to,
    limit: req.query.limit, offset: req.query.offset,
  });
  res.json({ logs });
});

module.exports = {
  listUsers, changeRole, suspendUser, reactivateUser, auditLogs,
};
