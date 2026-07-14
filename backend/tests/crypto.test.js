'use strict';

const {
  encrypt, decrypt, generateOtp, safeEqual, sha256,
} = require('../src/utils/crypto');

describe('AES-256-GCM crypto util', () => {
  test('encrypt -> decrypt round-trips the plaintext', () => {
    const secret = 'super-secret-otp-123456';
    const cipher = encrypt(secret);
    expect(cipher).not.toContain(secret);       // ciphertext must not leak plaintext
    expect(cipher.split(':')).toHaveLength(3);   // iv:tag:data
    expect(decrypt(cipher)).toBe(secret);
  });

  test('tampered ciphertext fails the GCM auth check', () => {
    const cipher = encrypt('hello');
    const [iv, tag, data] = cipher.split(':');
    const tampered = `${iv}:${tag}:${data.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a'))}`;
    expect(() => decrypt(tampered)).toThrow();
  });

  test('generateOtp returns a numeric string of the requested length', () => {
    const otp = generateOtp(6);
    expect(otp).toMatch(/^\d{6}$/);
  });

  test('safeEqual is true only for identical strings', () => {
    expect(safeEqual('123456', '123456')).toBe(true);
    expect(safeEqual('123456', '654321')).toBe(false);
    expect(safeEqual('123456', '12345')).toBe(false);
  });

  test('sha256 is deterministic and hex', () => {
    expect(sha256('token')).toBe(sha256('token'));
    expect(sha256('token')).toMatch(/^[0-9a-f]{64}$/);
  });
});
