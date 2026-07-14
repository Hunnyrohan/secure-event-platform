# Secure Event Management Platform

A production-oriented, **secure-by-design** event management platform built for a
university cybersecurity coursework on secure web application development and
internal penetration testing.

Users register (with a username + email verification and optional Google
Authenticator TOTP MFA), browse and book events, manage their profile, export
their data, and delete their account. Organizers create and manage events;
admins manage users, roles, and review audit logs.

> **Security posture:** OWASP Top 10 mitigations, defense-in-depth, least
> privilege / zero-trust authorization, parameterized queries everywhere,
> `sanitize-html` on all stored user content (stored-XSS defense), Google
> reCAPTCHA on register/login (automated-abuse defense), AES-256-GCM for secrets
> at rest, bcrypt (cost 12) for passwords, HTTP-only + SameSite=strict session
> cookies, CSRF double-submit tokens, strict CSP, refresh-token rotation with
> reuse detection, rate limiting, and account lockout.

---

## Tech stack

| Layer      | Technology |
|------------|------------|
| Frontend   | React 18, React Router, Tailwind CSS, Axios, Vite |
| Backend    | Node.js, Express |
| Database   | PostgreSQL 16 |
| Auth       | JWT access + rotating refresh tokens, Google Authenticator TOTP MFA (speakeasy + qrcode) |
| Security   | bcrypt, helmet, cors, express-rate-limit, express-validator, **sanitize-html**, csurf, cookie-parser, hpp, speakeasy, **Google reCAPTCHA** |
| Infra      | Docker, Docker Compose, GitHub Actions (CI + CodeQL) |
| Testing    | Jest, Supertest |

## Repository structure

```
secure-event-platform/
├── backend/
│   ├── migrations/001_init.sql        # DB schema
│   ├── src/
│   │   ├── config/                    # env, db pool, migration runner
│   │   ├── middleware/                # security, rate limits, csrf, authn, authz, captcha, errors
│   │   ├── validators/                # express-validator chains
│   │   ├── models/                    # parameterized data access
│   │   ├── services/                  # auth, token, mfa, event, booking, profile, audit, mailer
│   │   ├── controllers/               # thin HTTP handlers
│   │   ├── routes/                    # route + middleware wiring
│   │   ├── utils/                     # crypto (AES-256-GCM), password policy, logger, cookies
│   │   ├── app.js                     # express app assembly
│   │   └── server.js                  # bootstrap + graceful shutdown
│   ├── tests/                         # jest + supertest
│   └── Dockerfile
├── frontend/
│   ├── src/{api,components,context,pages}
│   ├── nginx.conf                     # static serving + security headers + API proxy
│   └── Dockerfile
├── docs/                              # DATABASE, API, THREAT_MODEL, PENTEST_REPORT, plan, mapping
├── .github/workflows/ci.yml
├── docker-compose.yml
└── README.md
```

## Quick start (Docker)

```bash
cp backend/.env.example .env
# generate secrets:
node -e "console.log('JWT_ACCESS_SECRET='+require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log('JWT_REFRESH_SECRET='+require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log('DATA_ENCRYPTION_KEY='+require('crypto').randomBytes(32).toString('hex'))"
# paste the three values into .env, then:
docker compose up --build
```

- App:      http://localhost:8080
- API:      http://localhost:8080/api  (proxied to backend)
- Mailhog:  http://localhost:8025  (read account-verification emails in dev; TOTP MFA needs no email)

## Local development (without Docker)

```bash
# 1. Postgres running locally; create DB and user matching .env
# 2. Backend
cd backend && npm install
cp .env.example .env      # fill in secrets
npm run migrate
npm run dev               # http://localhost:4000

# 3. Frontend
cd frontend && npm install
npm run dev               # http://localhost:5173 (proxies /api -> :4000)
```

## Tests & security checks

```bash
cd backend
npm test                  # jest + supertest
npm run lint              # eslint (airbnb-base + eslint-plugin-security)
npm run audit:security    # npm audit --audit-level=high
```

## Documentation index (coursework deliverables)

| Deliverable | File |
|-------------|------|
| Database schema | [001_init.sql](backend/migrations/001_init.sql) + [002_totp_mfa_username.sql](backend/migrations/002_totp_mfa_username.sql) |
| ER diagram description | [docs/DATABASE.md](docs/DATABASE.md) |
| Backend API documentation | [docs/API.md](docs/API.md) |
| Frontend page structure | [docs/FRONTEND_PAGES.md](docs/FRONTEND_PAGES.md) |
| Threat model (STRIDE) | [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) |
| Penetration testing report | [docs/PENTEST_REPORT.md](docs/PENTEST_REPORT.md) |
| Implementation plan | [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) |
| Commit roadmap (40+) | [docs/COMMIT_ROADMAP.md](docs/COMMIT_ROADMAP.md) |
| Coursework report mapping | [docs/COURSEWORK_MAPPING.md](docs/COURSEWORK_MAPPING.md) |

## Security highlights (where to look)

| Control | Location |
|---------|----------|
| bcrypt (cost 12) + password policy + reuse prevention | `utils/password.js`, `services/authService.js` |
| Google Authenticator TOTP MFA + single-use recovery codes | `services/mfaService.js` (speakeasy/qrcode) |
| AES-256-GCM for the TOTP secret / recovery codes + key strategy | `utils/crypto.js`, `services/mfaService.js` |
| JWT refresh rotation + reuse detection (token family) | `services/tokenService.js` |
| RBAC (least privilege) | `middleware/authorize.js` |
| Stored-XSS defense: `sanitize-html` on all stored UGC | `utils/sanitize.js`, `services/{event,profile,auth}Service.js` |
| Bot / brute-force defense: Google reCAPTCHA on register+login | `middleware/captcha.js`, `frontend/src/components/Captcha.jsx` |
| IDOR / mass-assignment defenses | `models/userModel.js`, `services/*Service.js` |
| Race-safe booking (row lock + unique constraint) | `services/bookingService.js` |
| Helmet CSP/HSTS/headers, CORS allow-list | `middleware/security.js` |
| CSRF double-submit | `middleware/csrf.js`, `api/client.js` |
| Rate limiting + account lockout | `middleware/rateLimiters.js`, `models/userModel.js` |
| Audit logging with secret redaction | `services/auditService.js`, `utils/logger.js` |

## Security hardening: reCAPTCHA & content sanitization

**Google reCAPTCHA (automated-abuse defense).** `/auth/register` and
`/auth/login` are gated by reCAPTCHA v2. The SPA renders the checkbox
(`VITE_RECAPTCHA_SITE_KEY`) and sends the token; the backend verifies it against
Google's siteverify API (`RECAPTCHA_SECRET_KEY`) and **fails closed** on error.
It composes with the auth rate limiter + account lockout as layered brute-force /
credential-stuffing / bot-registration defense. With no key configured (dev
default) the check is skipped so local auth flows are unaffected.

**`sanitize-html` (stored-XSS defense), defense-in-depth in 3 layers.**
1. **Input validation** — `express-validator` enforces type/length/format.
2. **Sanitize before storage** — every user-generated field (event
   `title`/`description`/`location`/`category`, profile `fullName`/`bio`) is run
   through `sanitize-html` (`utils/sanitize.js`) *before* it is written to the
   DB. Short fields are reduced to plain text; long fields use a restrictive tag
   allow-list. `<script>`, `on*` handlers, and `javascript:` URLs are removed, so
   a payload can never be persisted.
3. **Output & transport** — React renders content as auto-escaped text (no
   `dangerouslySetInnerHTML`); a strict CSP blocks inline script as a backstop.

*Rationale:* an allow-list sanitizer at the storage boundary is preferred over
blanket `.escape()` — it removes dangerous markup precisely, permits safe
formatting in long fields, and preserves legitimate quotes/apostrophes. Even if
one layer were bypassed, the others still prevent script execution.

Config: see [`backend/.env.example`](backend/.env.example) (`RECAPTCHA_*`) and
[`frontend/.env.example`](frontend/.env.example) (`VITE_RECAPTCHA_SITE_KEY`).
Google's public test keys pass every challenge for local trials.

## Roles

- **User** — register (username + email), login, enable TOTP MFA, book/cancel events, view history, manage profile, export/delete data.
- **Event Organizer** — everything a user can do, plus create/edit/delete **own** events and view attendees.
- **Admin** — manage all users (roles, suspension), manage all events, review audit logs & security alerts.
