# Step-by-Step Implementation Plan

A phased plan you can follow (and cite in your report). Each phase lists the
goal, the concrete tasks, and the security controls introduced.

## Phase 0 — Project setup (Day 1)
- Initialize monorepo (`backend/`, `frontend/`, `docs/`), `.gitignore`, licenses.
- Backend `package.json`, ESLint (airbnb-base + `eslint-plugin-security`).
- `.env.example` with all secrets documented; env validation that fails fast.
- **Controls:** secrets never committed; fail-closed config.

## Phase 1 — Database & data layer (Day 1–2)
- Author `migrations/001_init.sql`: users, tokens, MFA, events, bookings,
  notifications, audit_logs; enums, constraints, indexes, `updated_at` triggers.
  `002_totp_mfa_username.sql` adds `username` + the encrypted TOTP secret.
- Migration runner; parameterized `pg` pool + `withTransaction` helper.
- **Controls:** UUID keys, unique/check constraints, cascade FKs.

## Phase 2 — Core security utilities (Day 2)
- AES-256-GCM `crypto.js` (encrypt/decrypt, sha256, secure random tokens, timing-safe compare).
- `password.js` (bcrypt cost 12, policy + strength score).
- Redacting `logger.js`; `httpError.js`; `asyncHandler.js`; cookie helpers.
- **Controls:** encryption at rest, strong hashing, log redaction.

## Phase 3 — Security middleware (Day 3)
- Helmet (CSP/HSTS/frameguard/referrer), strict CORS allow-list, `hpp`.
- Rate limiters (global/auth/MFA-verify); CSRF double-submit; central error handler.
- **Controls:** headers, CORS, rate limiting, CSRF, no stack leakage.

## Phase 4 — Authentication & MFA (Day 3–5)
- Registration (policy + email verification), login with lockout & enumeration
  resistance, JWT access + refresh **rotation with reuse detection**.
- Google Authenticator TOTP MFA (speakeasy/qrcode): QR enrollment, AES-encrypted
  secret, single-use recovery codes, rate-limited verification; CAPTCHA hook.
- **Controls:** MFA, lockout, rotation, suspicious-login audit.

## Phase 5 — RBAC & authorization (Day 5)
- `authenticate` (cookie/bearer), `authorize` (`requireRole`, hierarchy).
- Apply least privilege to all routes.
- **Controls:** vertical access control, zero-trust per request.

## Phase 6 — Domain modules (Day 6–8)
- Profile (self-scoped, whitelisted updates, change-password reuse prevention,
  export, delete), Events (ownership), Bookings (transactional, race-safe).
- Audit logging across all sensitive actions.
- **Controls:** IDOR & mass-assignment defenses, concurrency safety, accountability.

## Phase 7 — Frontend (Day 8–11)
- Vite + React + Tailwind; Axios client (CSRF + auto-refresh interceptors).
- Auth context, protected routes, pages (Home, Register + username + strength
  meter, Login + TOTP step, Events, Profile + QR MFA enrollment, Admin dashboard).
- **Controls:** text-only rendering (no `dangerouslySetInnerHTML`), server-authoritative authz.

## Phase 8 — Testing (Day 11–12)
- Jest unit tests (crypto, password, RBAC), Supertest smoke/integration.
- Coverage thresholds in CI.

## Phase 9 — Containerization & CI/CD (Day 12–13)
- Multi-stage Dockerfiles (non-root backend, nginx frontend), `docker-compose`
  (db, mailhog, backend, frontend), healthchecks.
- GitHub Actions: lint, test (with Postgres service), `npm audit`, CodeQL, image build.

## Phase 10 — Threat modeling & pen testing (Day 13–15)
- STRIDE threat model; internal pentest of auth/authz/input/session/API.
- Document ≥2 vulns (IDOR + Stored XSS) with before/after and retest.
- **Controls:** verify mitigations, capture evidence.

## Phase 11 — Hardening & report (Day 15–16)
- Address `npm audit`/CodeQL findings; finalize residual-risk register.
- Assemble coursework report using `COURSEWORK_MAPPING.md`.

### Definition of done
- All routes authn/authz-enforced; tests + lint + audit green in CI;
  Docker stack boots and migrates; two documented vulns fixed & retested;
  threat model and report complete.
