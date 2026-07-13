'use strict';

const dotenv = require('dotenv');

dotenv.config();

/**
 * Central, validated configuration object.
 * Fails fast at boot if a required secret is missing so the app never runs
 * in an insecure half-configured state.
 */
function required(name) {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    // In test mode we allow sensible fallbacks (set in tests/setup).
    if (process.env.NODE_ENV === 'test') return value;
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const config = {
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: parseInt(process.env.PORT || '4000', 10),
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  db: {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432', 10),
    database: process.env.PGDATABASE || 'event_platform',
    user: process.env.PGUSER || 'event_app',
    password: process.env.PGPASSWORD || '',
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: true } : false,
  },

  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET'),
    refreshSecret: required('JWT_REFRESH_SECRET'),
    accessTtl: process.env.JWT_ACCESS_TTL || '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL || '7d',
  },

  encryptionKeyHex: required('DATA_ENCRYPTION_KEY'),

  otp: {
    ttlSeconds: parseInt(process.env.OTP_TTL_SECONDS || '300', 10),
    length: parseInt(process.env.OTP_LENGTH || '6', 10),
    maxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS || '5', 10),
  },

  lockout: {
    maxAttempts: parseInt(process.env.LOGIN_MAX_ATTEMPTS || '5', 10),
    lockMinutes: parseInt(process.env.LOGIN_LOCK_MINUTES || '15', 10),
  },

  smtp: {
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '1025', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || undefined,
    pass: process.env.SMTP_PASS || undefined,
    from: process.env.MAIL_FROM || 'no-reply@secure-events.local',
  },

  // Mail delivery driver: 'smtp' sends via the SMTP server above; 'log' writes
  // the message (incl. verification links) to the app log instead of sending.
  // Defaults to real SMTP in production and to 'log' in dev so the app is
  // usable without a mail server. Override with MAIL_DRIVER.
  mailDriver: process.env.MAIL_DRIVER
    || (process.env.NODE_ENV === 'production' ? 'smtp' : 'log'),

  captcha: {
    // Enabled when explicitly turned on OR when a reCAPTCHA secret is present.
    enabled: process.env.CAPTCHA_ENABLED === 'true' || !!process.env.RECAPTCHA_SECRET_KEY,
    siteKey: process.env.RECAPTCHA_SITE_KEY || '',
    secret: process.env.RECAPTCHA_SECRET_KEY || process.env.CAPTCHA_SECRET || '',
    provider: 'recaptcha',
  },

  bcryptRounds: 12,
};

module.exports = config;
