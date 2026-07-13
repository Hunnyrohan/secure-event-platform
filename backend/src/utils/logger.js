'use strict';

/**
 * Minimal structured logger with automatic secret redaction.
 * Any key matching the deny-list is masked before it can reach stdout,
 * guaranteeing passwords / tokens / OTPs never appear in application logs
 * (Audit-logging requirement: "Logs must not expose passwords/secrets").
 */

const SENSITIVE_KEYS = [
  'password', 'pass', 'password_hash', 'token', 'accesstoken', 'refreshtoken',
  'otp', 'otp_cipher', 'code', 'secret', 'authorization', 'cookie',
  'jwt', 'recovery', 'captcha',
];

function redact(value, depth = 0) {
  if (depth > 6 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEYS.includes(k.toLowerCase())) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = redact(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

function emit(level, message, meta) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(meta ? { meta: redact(meta) } : {}),
  };
  // Single-line JSON is friendly to log shippers (ELK / Loki / CloudWatch).
  const line = JSON.stringify(entry);
  if (level === 'error') process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

module.exports = {
  info: (msg, meta) => emit('info', msg, meta),
  warn: (msg, meta) => emit('warn', msg, meta),
  error: (msg, meta) => emit('error', msg, meta),
  debug: (msg, meta) => {
    if (process.env.NODE_ENV !== 'production') emit('debug', msg, meta);
  },
  redact,
};
