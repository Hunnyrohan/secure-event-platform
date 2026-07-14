'use strict';

const password = require('../src/utils/password');

describe('password policy', () => {
  test('rejects short / weak passwords', () => {
    expect(password.evaluate('short').ok).toBe(false);
    expect(password.evaluate('password123').ok).toBe(false); // common + no symbol/upper
  });

  test('accepts a strong password', () => {
    const res = password.evaluate('Str0ng&Passw0rd!2026');
    expect(res.ok).toBe(true);
    expect(res.score).toBeGreaterThanOrEqual(4);
  });

  test('hash + verify round-trips and rejects wrong password', async () => {
    const hash = await password.hash('Str0ng&Passw0rd!2026');
    expect(await password.verify('Str0ng&Passw0rd!2026', hash)).toBe(true);
    expect(await password.verify('wrong', hash)).toBe(false);
  });
});
