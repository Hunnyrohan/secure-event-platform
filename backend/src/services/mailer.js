'use strict';

const nodemailer = require('nodemailer');
const config = require('../config/env');
const logger = require('../utils/logger');

/**
 * Thin email wrapper. In dev/test it points at Mailhog (no real delivery).
 * Emails carry OTPs and verification links; we never log their contents.
 */
let transporter;
function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  });
  return transporter;
}

async function send({ to, subject, text, html }) {
  if (config.env === 'test') return { messageId: 'test' }; // no-op in tests

  // Dev convenience: with MAIL_DRIVER=log we don't touch SMTP at all. The
  // message body (which carries the verification link / OTP) is written to the
  // app log so a developer can act on it without running a mail server.
  if (config.mailDriver === 'log') {
    logger.info('Email (log driver - not actually sent)', { to, subject, body: text });
    return { messageId: 'logged', driver: 'log' };
  }

  try {
    return await getTransporter().sendMail({
      from: config.smtp.from, to, subject, text, html,
    });
  } catch (err) {
    logger.error('Email send failed', { subject, message: err.message });
    throw err;
  }
}

const sendVerification = (to, link) => send({
  to,
  subject: 'Verify your Secure Events account',
  text: `Confirm your email by opening: ${link}`,
  html: `<p>Confirm your email:</p><p><a href="${link}">Verify my account</a></p>`,
});

const sendOtp = (to, otp, ttlSeconds) => send({
  to,
  subject: 'Your Secure Events login code',
  text: `Your one-time code is ${otp}. It expires in ${Math.round(ttlSeconds / 60)} minutes.`,
  html: `<p>Your one-time code is <strong>${otp}</strong>.</p>
         <p>It expires in ${Math.round(ttlSeconds / 60)} minutes. If you did not try to sign in, ignore this email.</p>`,
});

module.exports = { send, sendVerification, sendOtp };
