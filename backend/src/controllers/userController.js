'use strict';

const profileService = require('../services/profileService');
const authService = require('../services/authService');
const asyncHandler = require('../utils/asyncHandler');

const me = asyncHandler(async (req, res) => {
  res.json({ user: await profileService.getMe(req.user.id) });
});

const updateMe = asyncHandler(async (req, res) => {
  res.json({ user: await profileService.updateMe(req.user.id, req.body) });
});

const changePassword = asyncHandler(async (req, res) => {
  await authService.changePassword(req.user.id, req.body, req);
  res.json({ message: 'Password changed. Please sign in again.' });
});

const setupMfa = asyncHandler(async (req, res) => {
  const data = await profileService.setupMfa(req.user.id);
  res.json(data); // { otpauthUrl, qrDataUrl, manualKey }
});

const enableMfa = asyncHandler(async (req, res) => {
  const recoveryCodes = await profileService.enableMfa(req.user.id, req.body.token, req);
  res.json({ message: 'MFA enabled.', recoveryCodes });
});

const disableMfa = asyncHandler(async (req, res) => {
  await profileService.disableMfa(req.user.id, req);
  res.json({ message: 'MFA disabled.' });
});

const exportData = asyncHandler(async (req, res) => {
  const data = await profileService.exportData(req.user.id, req);
  res.setHeader('Content-Disposition', 'attachment; filename="my-data.json"');
  res.json(data);
});

const deleteAccount = asyncHandler(async (req, res) => {
  await profileService.deleteAccount(req.user.id, req);
  res.json({ message: 'Account deleted.' });
});

module.exports = {
  me, updateMe, changePassword, setupMfa, enableMfa, disableMfa, exportData, deleteAccount,
};
