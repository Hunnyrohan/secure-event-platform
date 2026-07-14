# Frontend Page & Component Structure

React 18 + React Router + Tailwind. Source: [`frontend/src`](../frontend/src).

## Routing map (`App.jsx`)

| Path | Page | Access | Notes |
|------|------|--------|-------|
| `/` | `Home` | Public | Landing / CTA |
| `/register` | `Register` | Public | Username + email, strength meter, server-enforced policy |
| `/login` | `Login` | Public | Two-step: password → TOTP code (or recovery code) |
| `/events` | `Events` | Public (book requires login) | Text-only render (XSS-safe) |
| `/profile` | `Profile` | Authenticated | Bookings, TOTP MFA enrollment (QR + recovery codes), export |
| `/admin` | `AdminDashboard` | Admin only | Users, roles, suspend, audit logs |

Guards: `ProtectedRoute` (optionally `roles={['admin']}`) — **UX only**; the API
independently enforces authn/authz on every request (zero-trust).

## Component inventory

| Component | Responsibility |
|-----------|----------------|
| `context/AuthContext.jsx` | Session state, `login`/`verifyMfa`/`logout`, `/users/me` bootstrap |
| `api/client.js` | Axios instance: `withCredentials`, CSRF header injection, silent refresh-and-retry on 401 |
| `components/ProtectedRoute.jsx` | Client route guard |
| `components/PasswordStrengthMeter.jsx` | Live policy feedback mirroring server rules |
| `pages/Home.jsx` | Marketing/landing |
| `pages/Register.jsx` | Registration form (username + email) + strength meter |
| `pages/Login.jsx` | Password step + TOTP/recovery-code step |
| `pages/Events.jsx` | Event list + booking action |
| `pages/Profile.jsx` | Profile, booking history, TOTP MFA setup (scan QR → confirm → recovery codes), data export |
| `pages/AdminDashboard.jsx` | User table (role/suspend) + security event feed |

## Security conventions on the client

- **Never** use `dangerouslySetInnerHTML`; all user content rendered as JSX text
  (React auto-escapes) → prevents stored/reflected XSS.
- Tokens live in **HTTP-only cookies**; JS never reads them (only the CSRF token
  cookie is readable, by design, to echo in the `X-CSRF-Token` header).
- Errors from the API are shown as text, never interpolated as HTML.
- The SPA shell is served by nginx with a strict CSP (`default-src 'self'`).

## Data-flow (login example)

```
Login.jsx --login()--> AuthContext --POST /auth/login--> API
   └─ if mfaRequired: render TOTP-code form; POST /auth/mfa/verify
      (code read from Google Authenticator / Authy, or a recovery code)
   └─ on success: cookies set by server; AuthContext.user populated
Subsequent calls: client.js attaches CSRF token; on 401 -> POST /auth/refresh -> retry
```
