# Backend API Documentation

Base URL: `/api`. All responses are JSON. Authentication uses **HTTP-only
cookies** (`access_token`, `refresh_token`); the SPA also sends an
`X-CSRF-Token` header (double-submit) on state-changing requests.

Error shape (uniform):

```json
{ "error": { "message": "human readable", "details": { "...": "optional" } } }
```

Common status codes: `400` validation, `401` unauthenticated, `403`
forbidden/CSRF/locked, `404` not found, `409` conflict, `429` rate limited.

Legend: 🔓 public · 🔑 authenticated · 🎫 organizer · 🛡️ admin

---

## Auth — `/api/auth`

| Method | Path | Auth | Body | Notes |
|--------|------|------|------|-------|
| POST | `/register` | 🔓 | `{ fullName, username, email, password, captchaToken? }` | Password policy enforced; unique email + username. `fullName` is sanitized (sanitize-html) before storage. Sends a verification link (in dev, `MAIL_DRIVER=log` writes it to the app log). Rate-limited + reCAPTCHA. |
| POST | `/verify-email` | 🔓 | `{ uid, token }` | Activates account. |
| POST | `/login` | 🔓 | `{ email, password, captchaToken? }` | Returns `{ mfaRequired:false, user }` **or** `{ mfaRequired:true, mfaToken }`. Sets cookies when no MFA. Rate-limited + reCAPTCHA. |
| POST | `/mfa/verify` | 🔓 | `{ mfaToken, otp }` | Completes MFA. `otp` is a 6-digit **TOTP code from the authenticator app** or a one-time recovery code. Sets session cookies. |
| POST | `/refresh` | cookie | — | Rotates refresh token, re-issues access cookie. Reuse ⇒ family revoked. |
| POST | `/logout` | 🔑 | — | Revokes refresh token, clears cookies. |

### Example — login → MFA (Google Authenticator TOTP)

```http
POST /api/auth/login
Content-Type: application/json

{ "email": "user@example.com", "password": "Str0ng&Passw0rd!2026" }
```
```json
{ "mfaRequired": true, "mfaToken": "eyJhbGci..." }
```
The user opens Google Authenticator / Authy and reads the current 6-digit code
(nothing is emailed for the second factor), then:
```http
POST /api/auth/mfa/verify
{ "mfaToken": "eyJhbGci...", "otp": "418923" }
```
```json
{ "user": { "id": "…", "email": "…", "username": "…", "role": "user", "mfaEnabled": true } }
```

---

## Current user — `/api/users` (🔑, all self-scoped → IDOR-safe)

| Method | Path | Body | Notes |
|--------|------|------|-------|
| GET | `/me` | — | Current profile (no secrets). |
| PATCH | `/me` | `{ fullName?, bio?, avatarPath? }` | Whitelisted → mass-assignment safe. `fullName`/`bio` sanitized (sanitize-html) before storage → stored-XSS safe. |
| GET | `/me/bookings` | — | Booking history. |
| POST | `/me/change-password` | `{ currentPassword, newPassword }` | Reuse prevention; revokes all sessions. |
| POST | `/me/mfa/setup` | — | Starts TOTP enrollment. Returns `{ otpauthUrl, qrDataUrl, manualKey }` — the QR is scanned into an authenticator app. Secret is stored AES-256-GCM encrypted (inactive until confirmed). |
| POST | `/me/mfa/enable` | `{ token }` | Confirms enrollment with a 6-digit TOTP code, activates MFA, and returns `{ recoveryCodes }` (10 single-use codes, shown once). |
| POST | `/me/mfa/disable` | — | Disables MFA; destroys the secret + recovery codes. |
| GET | `/me/export` | — | Downloads personal data as JSON. |
| DELETE | `/me` | — | Deletes account + cascaded data. |

---

## Events — `/api/events`

| Method | Path | Auth | Body | Notes |
|--------|------|------|------|-------|
| GET | `/` | 🔓 | — | List published events (`?limit&offset&category`). |
| GET | `/:id` | 🔓 | — | Event detail. |
| POST | `/` | 🎫 | event fields | Create (organizer/admin). |
| PUT | `/:id` | 🎫 | event fields | Update — **ownership enforced** (own event or admin). |
| DELETE | `/:id` | 🎫 | — | Delete — ownership enforced. |
| GET | `/:id/attendees` | 🎫 | — | Attendee list — ownership enforced. |

Event body: `{ title, description, location, category, startsAt (ISO-8601), capacity (int), ticketPrice (number) }`.

---

## Bookings — `/api/bookings` (🔑)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/me` | Own booking history. |
| POST | `/events/:eventId` | Book — transactional, race-safe, blocks duplicates & overselling. |
| POST | `/:id/cancel` | Cancel — **ownership enforced** (own booking or admin). |

---

## Admin — `/api/admin` (🛡️ vertical access control on the whole surface)

| Method | Path | Body | Notes |
|--------|------|------|-------|
| GET | `/users` | — | List users (`?limit&offset`). |
| PATCH | `/users/:id/role` | `{ role }` | Change role; revokes target's sessions. Cannot change own role. |
| POST | `/users/:id/suspend` | — | Suspend; revokes sessions; logged as `alert`. |
| POST | `/users/:id/reactivate` | — | Reactivate. |
| GET | `/audit-logs` | — | Search logs (`?action&actorId&outcome&from&to&limit&offset`). |

---

## Misc

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/health` | Liveness probe. |
| GET | `/api/csrf-token` | Issues CSRF token + sets `XSRF-TOKEN` cookie (non-test envs). |

## Security controls applied per request (middleware order)

`helmet` → `cors (allow-list)` → JSON body cap (100 kb) → `cookie-parser` →
`hpp` → global rate limiter → (`csrf` on state-changing groups) → route-specific
`rate limiter` / `reCAPTCHA` / `authenticate` / `requireRole` / `validator chain`
→ controller → service (**sanitize-html** on UGC + ownership + business rules) →
central error handler (no stack leaks).

### CAPTCHA (Google reCAPTCHA v2)

`/auth/register` and `/auth/login` are protected by reCAPTCHA. The SPA renders
the checkbox widget (`VITE_RECAPTCHA_SITE_KEY`) and sends the solved token in the
`X-Captcha-Token` header **or** a `captchaToken` body field. The backend
(`middleware/captcha.js`) verifies it against Google's siteverify API using
`RECAPTCHA_SECRET_KEY` and **fails closed**. When no key is configured (default in
dev/test) the check is skipped so the flows remain usable locally.

### Content sanitization (stored-XSS defense)

All user-generated text (event `title`/`description`/`location`/`category`,
profile `fullName`/`bio`) is run through `sanitize-html` (`utils/sanitize.js`)
**before storage**: short fields → plain text, long fields → a restrictive tag
allow-list. Scripts, `on*` handlers and `javascript:` URLs are removed, so a
payload can never be persisted or later reflected as executable HTML.
