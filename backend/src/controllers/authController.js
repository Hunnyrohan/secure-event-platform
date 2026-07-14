'use strict';

const authService = require('../services/authService');
const { setAuthCookies, clearAuthCookies, REFRESH_COOKIE } = require('../utils/cookies');
const asyncHandler = require('../utils/asyncHandler');

const register = asyncHandler(async (req, res) => {
  const user = await authService.register(req.body, req);
  res.status(201).json({
    message: 'Registration successful. Check your email to verify your account.',
    user,
  });
});

const verifyEmail = asyncHandler(async (req, res) => {
  await authService.verifyEmail({ userId: req.body.uid, token: req.body.token });
  res.json({ message: 'Email verified. You can now sign in.' });
});

const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body, req);
  if (result.mfaRequired) {
    return res.json({ mfaRequired: true, mfaToken: result.mfaToken });
  }
  setAuthCookies(res, result.tokens);
  return res.json({ mfaRequired: false, user: result.user });
});

const verifyMfa = asyncHandler(async (req, res) => {
  const result = await authService.verifyMfa(req.body, req);
  setAuthCookies(res, result.tokens);
  res.json({ user: result.user });
});

const refresh = asyncHandler(async (req, res) => {
  const presented = req.cookies?.[REFRESH_COOKIE];
  const result = await authService.refresh(presented, req);
  setAuthCookies(res, { accessToken: result.accessToken, refreshToken: result.refreshToken });
  res.json({ message: 'Session refreshed' });
});

const logout = asyncHandler(async (req, res) => {
  const presented = req.cookies?.[REFRESH_COOKIE];
  await authService.logout(presented, req.user?.id, req);
  clearAuthCookies(res);
  res.json({ message: 'Logged out' });
});

module.exports = {
  register, verifyEmail, login, verifyMfa, refresh, logout,
};
