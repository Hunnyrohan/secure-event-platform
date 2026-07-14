'use strict';

const csurf = require('csurf');

/**
 * CSRF protection using the double-submit cookie pattern.
 * Because auth state lives in HTTP-only cookies, state-changing requests
 * must also present the CSRF token (read from a readable cookie by the SPA
 * and echoed in the X-CSRF-Token header). SameSite=strict on the auth
 * cookies is the first line of defence; csurf is defence-in-depth.
 */
const csrfProtection = csurf({
  cookie: {
    key: '_csrf',
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
  },
  value: (req) => req.headers['x-csrf-token'],
});

/** Endpoint the SPA calls to obtain a token to place in a readable cookie. */
function issueToken(req, res) {
  res.cookie('XSRF-TOKEN', req.csrfToken(), {
    httpOnly: false, // must be readable by JS to be echoed back in the header
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
  });
  res.json({ csrfToken: req.csrfToken() });
}

module.exports = { csrfProtection, issueToken };
