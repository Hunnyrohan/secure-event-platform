'use strict';

const { requireRole, requireAtLeast } = require('../src/middleware/authorize');

function run(mw, role) {
  return new Promise((resolve) => {
    const req = { user: role ? { role } : undefined };
    const res = {};
    mw(req, res, (err) => resolve(err));
  });
}

describe('RBAC middleware', () => {
  test('admin passes any requireRole check', async () => {
    expect(await run(requireRole('organizer'), 'admin')).toBeUndefined();
  });

  test('user is blocked from organizer-only routes', async () => {
    const err = await run(requireRole('organizer'), 'user');
    expect(err).toBeDefined();
    expect(err.status).toBe(403);
  });

  test('missing role is forbidden', async () => {
    const err = await run(requireRole('user'), undefined);
    expect(err.status).toBe(403);
  });

  test('requireAtLeast respects the hierarchy', async () => {
    expect(await run(requireAtLeast('organizer'), 'admin')).toBeUndefined();
    expect((await run(requireAtLeast('admin'), 'organizer')).status).toBe(403);
  });
});
