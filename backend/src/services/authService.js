'use strict';

const jwt = require('jsonwebtoken');
const db = require('../config/db');
const config = require('../config/env');
const userModel = require('../models/userModel');
const password = require('../utils/password');
const { sha256, randomToken } = require('../utils/crypto');
const tokenService = require('./tokenService');
const mfaService = require('./mfaService');
const mailer = require('./mailer');
const audit = require('./auditService');
const { sanitizePlain } = require('../utils/sanitize');
const {
  badRequest, unauthorized, conflict, forbidden,
} = require('../utils/httpError');

/** Short-lived token proving a user passed password auth and now owes MFA. */
function signMfaChallenge(user) {
  return jwt.sign({ sub: user.id, purpose: 'mfa' }, config.jwt.accessSecret,
    { expiresIn: '10m', algorithm: 'HS256' });
}
function verifyMfaChallenge(token) {
  const p = jwt.verify(token, config.jwt.accessSecret, { algorithms: ['HS256'] });
  if (p.purpose !== 'mfa') throw new Error('wrong token purpose');
  return p;
}

// ---- Registration --------------------------------------------------------
async function register({
  email, username, fullName, password: pwd,
}, req) {
  const policy = password.evaluate(pwd);
  if (!policy.ok) throw badRequest('Password does not meet policy', { missing: policy.missing });

  // Duplicate-account prevention is enforced by the UNIQUE(email)/UNIQUE(username)
  // constraints; we check first for clean messages but rely on the DB as the
  // source of truth (the INSERT still fails safely on a race).
  if (await userModel.findByEmail(email)) throw conflict('An account with that email already exists');
  if (await userModel.findByUsername(username)) throw conflict('That username is already taken');

  const hash = await password.hash(pwd);
  const user = await userModel.create({
    email, username, passwordHash: hash, fullName: sanitizePlain(fullName),
  });

  // Email-verification token: store only the hash, email the raw value.
  const raw = randomToken(32);
  await db.query(
    `INSERT INTO user_tokens (user_id, purpose, token_hash, expires_at)
     VALUES ($1,'email_verify',$2, now() + interval '1 day')`,
    [user.id, sha256(raw)],
  );
  const link = `${config.clientOrigins[0]}/verify-email?token=${raw}&uid=${user.id}`;
  await mailer.sendVerification(user.email, link);

  await audit.record({ actorId: user.id, action: audit.ACTIONS.REGISTER, req });
  return userModel.publicView(user);
}

async function verifyEmail({ userId, token }) {
  const { rows } = await db.query(
    `SELECT * FROM user_tokens
      WHERE user_id = $1 AND purpose = 'email_verify' AND used_at IS NULL
      ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  const row = rows[0];
  if (!row || row.token_hash !== sha256(token) || new Date(row.expires_at) < new Date()) {
    throw badRequest('Invalid or expired verification link');
  }
  await db.query('UPDATE user_tokens SET used_at = now() WHERE id = $1', [row.id]);
  await userModel.markEmailVerified(userId);
  await audit.record({ actorId: userId, action: audit.ACTIONS.EMAIL_VERIFY });
}

// ---- Login (step 1: password) -------------------------------------------
async function login({ email, password: pwd }, req) {
  const user = await userModel.findByEmail(email);

  // Uniform failure response prevents user enumeration & timing differences.
  const genericFail = () => unauthorized('Invalid email or password');

  if (!user) {
    // Still run a hash to equalise timing between existing/non-existing users.
    await password.verify(pwd, '$2b$12$0000000000000000000000000000000000000000000000000000');
    await audit.record({ action: audit.ACTIONS.LOGIN_FAILURE, outcome: 'failure', req, metadata: { email } });
    throw genericFail();
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    await audit.record({ actorId: user.id, action: audit.ACTIONS.LOGIN_LOCKED, outcome: 'failure', req });
    throw forbidden('Account temporarily locked due to failed attempts. Try again later.');
  }
  if (user.status === 'suspended') throw forbidden('This account has been suspended.');
  if (!user.email_verified) throw forbidden('Please verify your email before signing in.');

  const ok = await password.verify(pwd, user.password_hash);
  if (!ok) {
    const state = await userModel.registerFailedLogin(
      user.id, config.lockout.maxAttempts, config.lockout.lockMinutes,
    );
    await audit.record({
      actorId: user.id, action: audit.ACTIONS.LOGIN_FAILURE, outcome: 'failure', req,
      metadata: { failedCount: state.failed_login_count },
    });
    throw genericFail();
  }

  // Suspicious-login heuristic: new IP compared to last successful login.
  if (user.last_login_ip && req?.ip && user.last_login_ip !== req.ip) {
    await audit.record({
      actorId: user.id, action: audit.ACTIONS.SUSPICIOUS_LOGIN, outcome: 'alert', req,
      metadata: { previousIp: user.last_login_ip, newIp: req.ip },
    });
  }

  // Password correct. If MFA is on, issue a short-lived challenge instead of a
  // session. With TOTP there is nothing to send — the user reads the current
  // code straight from their authenticator app.
  if (user.mfa_enabled) {
    await audit.record({ actorId: user.id, action: audit.ACTIONS.MFA_CHALLENGE, req });
    return { mfaRequired: true, mfaToken: signMfaChallenge(user) };
  }

  await userModel.resetFailedLogins(user.id, req?.ip);
  const tokens = await tokenService.startSession(user, req);
  await audit.record({ actorId: user.id, action: audit.ACTIONS.LOGIN_SUCCESS, req });
  return { mfaRequired: false, user: userModel.publicView(user), tokens };
}

// ---- Login (step 2: MFA) -------------------------------------------------
async function verifyMfa({ mfaToken, otp }, req) {
  let payload;
  try { payload = verifyMfaChallenge(mfaToken); } catch (e) {
    throw unauthorized('MFA session expired. Please sign in again.');
  }
  const user = await userModel.findById(payload.sub);
  if (!user) throw unauthorized('Account not found');

  try {
    await mfaService.verify(user, otp);
  } catch (e) {
    await audit.record({ actorId: user.id, action: audit.ACTIONS.MFA_FAILURE, outcome: 'failure', req });
    throw e;
  }

  await userModel.resetFailedLogins(user.id, req?.ip);
  const tokens = await tokenService.startSession(user, req);
  await audit.record({ actorId: user.id, action: audit.ACTIONS.MFA_SUCCESS, req });
  return { user: userModel.publicView(user), tokens };
}

// ---- Refresh / logout ----------------------------------------------------
async function refresh(presentedToken, req) {
  const result = await tokenService.rotate(presentedToken, req, userModel.findById);
  await audit.record({ actorId: result.user.id, action: audit.ACTIONS.TOKEN_REFRESH, req });
  return result;
}

async function logout(presentedToken, actorId, req) {
  await tokenService.revoke(presentedToken);
  if (actorId) await audit.record({ actorId, action: audit.ACTIONS.LOGOUT, req });
}

// ---- Change password (with history/reuse prevention) --------------------
async function changePassword(userId, { currentPassword, newPassword }, req) {
  const user = await userModel.findById(userId);
  if (!user) throw unauthorized();
  if (!(await password.verify(currentPassword, user.password_hash))) {
    throw badRequest('Current password is incorrect');
  }
  const policy = password.evaluate(newPassword);
  if (!policy.ok) throw badRequest('Password does not meet policy', { missing: policy.missing });

  // Reuse prevention: reject if it matches any of the last 5 hashes.
  const recent = await userModel.recentPasswordHashes(userId, 5);
  for (const h of recent) {
    // eslint-disable-next-line no-await-in-loop
    if (await password.verify(newPassword, h)) throw badRequest('Do not reuse a recent password');
  }

  await userModel.setPassword(userId, await password.hash(newPassword));
  await tokenService.revokeAllForUser(userId); // force re-login everywhere
  await audit.record({ actorId: userId, action: audit.ACTIONS.PASSWORD_CHANGE, req });
}

module.exports = {
  register, verifyEmail, login, verifyMfa,
  refresh, logout, changePassword,
};
