'use strict';

const config = require('../src/config/env');
const verifyCaptcha = require('../src/middleware/captcha');

// Drive the middleware and resolve with whatever it passes to next().
function runMiddleware(req) {
  return new Promise((resolve) => {
    verifyCaptcha(req, {}, (err) => resolve(err));
  });
}

describe('CAPTCHA middleware (Google reCAPTCHA)', () => {
  const savedFetch = global.fetch;
  const savedEnabled = config.captcha.enabled;
  const savedSecret = config.captcha.secret;

  afterEach(() => {
    global.fetch = savedFetch;
    config.captcha.enabled = savedEnabled;
    config.captcha.secret = savedSecret;
    jest.clearAllMocks();
  });

  test('is skipped (no-op) when CAPTCHA is disabled', async () => {
    config.captcha.enabled = false;
    const err = await runMiddleware({ headers: {}, body: {} });
    expect(err).toBeUndefined();
  });

  test('rejects a MISSING token with a 400', async () => {
    config.captcha.enabled = true;
    config.captcha.secret = 'test-secret';
    const err = await runMiddleware({ headers: {}, body: {} });
    expect(err).toBeDefined();
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/captcha/i);
  });

  test('rejects an INVALID token (Google says success:false)', async () => {
    config.captcha.enabled = true;
    config.captcha.secret = 'test-secret';
    global.fetch = jest.fn().mockResolvedValue({ json: async () => ({ success: false }) });

    const err = await runMiddleware({ headers: { 'x-captcha-token': 'bad-token' }, body: {}, ip: '127.0.0.1' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(err).toBeDefined();
    expect(err.status).toBe(400);
  });

  test('accepts a VALID token (Google says success:true)', async () => {
    config.captcha.enabled = true;
    config.captcha.secret = 'test-secret';
    global.fetch = jest.fn().mockResolvedValue({ json: async () => ({ success: true }) });

    const err = await runMiddleware({ headers: { 'x-captcha-token': 'good-token' }, body: {}, ip: '127.0.0.1' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(err).toBeUndefined();
  });

  test('accepts the token from the request body as well as the header', async () => {
    config.captcha.enabled = true;
    config.captcha.secret = 'test-secret';
    global.fetch = jest.fn().mockResolvedValue({ json: async () => ({ success: true }) });

    const err = await runMiddleware({ headers: {}, body: { captchaToken: 'good-token' }, ip: '127.0.0.1' });
    expect(err).toBeUndefined();
  });

  test('fails closed if Google is unreachable', async () => {
    config.captcha.enabled = true;
    config.captcha.secret = 'test-secret';
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));

    const err = await runMiddleware({ headers: { 'x-captcha-token': 'x' }, body: {}, ip: '127.0.0.1' });
    expect(err).toBeDefined();
    expect(err.status).toBe(400);
  });
});
