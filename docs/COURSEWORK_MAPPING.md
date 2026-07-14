# Coursework Report Structure & Requirement Mapping

Use this as the skeleton for your written report. Each section maps a coursework
requirement to the concrete artefact/evidence in this repository.

## Suggested report outline

1. **Introduction & objectives** — problem statement, scope, roles.
2. **Requirements analysis** — functional + security requirements.
3. **System architecture** — SPA/API/DB, trust boundaries, data-flow diagram
   (see `THREAT_MODEL.md` §7 and `README.md`).
4. **Database design** — schema, ER description, constraints (`DATABASE.md`).
5. **Secure design & implementation** — controls per OWASP Top 10 (table below).
6. **Authentication & MFA** — flows, lockout, rotation (`API.md`, `authService.js`).
7. **Access control (RBAC)** — least privilege, ownership (`authorize.js`, services).
8. **Threat model (STRIDE)** — `THREAT_MODEL.md`.
9. **Testing** — unit/integration + CI (`backend/tests`, `ci.yml`).
10. **Internal penetration test** — `PENTEST_REPORT.md` (IDOR + Stored XSS).
11. **Deployment** — Docker/Compose/CI (`docker-compose.yml`, `ci.yml`).
12. **Evaluation, residual risks & future work** — `THREAT_MODEL.md` §6.
13. **Conclusion**, references, appendices (screenshots, logs).

## Requirement → evidence matrix

| Coursework requirement | Where it's implemented / documented |
|------------------------|-------------------------------------|
| Secure registration (username + email) + strength meter + email verification | `authService.register`, `PasswordStrengthMeter.jsx`, `user_tokens` |
| Duplicate account prevention | `UNIQUE(email)` + `UNIQUE(username)` + pre-checks in `authService` |
| JWT + refresh + HttpOnly cookies + session expiry | `tokenService.js`, `utils/cookies.js` |
| Refresh-token rotation | `tokenService.rotate` (family + reuse detection) |
| MFA — Google Authenticator TOTP (QR enrollment, encrypted secret, single-use recovery codes, verify rate limit) | `mfaService.js` (speakeasy/qrcode), `authRoutes` MFA-verify limiter |
| Account lockout after repeated failures | `userModel.registerFailedLogin`, `authService.login` |
| CAPTCHA integration (register + login) | Google reCAPTCHA v2 — `middleware/captcha.js` (server-side siteverify, fail-closed), `frontend/src/components/Captcha.jsx`; keys via `RECAPTCHA_SITE_KEY`/`RECAPTCHA_SECRET_KEY` |
| Brute-force / credential-stuffing / bot protection | reCAPTCHA + auth rate limiter (`rateLimiters.js`) + account lockout (`userModel.registerFailedLogin`) |
| Suspicious login detection | `authService.login` (new-IP audit alert) |
| Prevent IDOR | UUID keys + ownership guards (`bookingService`, `eventService`), self-scoped `/users/me/*` |
| Prevent mass assignment | `userModel.updateProfile` whitelist |
| Input validation (all inputs) | `validators/index.js` (express-validator: type/length/format, UUID checks) |
| Stored-XSS mitigation / content sanitization | `sanitize-html` — `utils/sanitize.js` (`sanitizePlain`/`sanitizeRich`) applied in `eventService`, `profileService`, `authService.register`; tests in `sanitize.test.js`, `storedXss.test.js` |
| RBAC + least privilege + route protection | `authorize.js`, route files |
| bcrypt ≥12 + complexity + history + feedback | `utils/password.js`, `authService.changePassword` |
| Session security (Secure/SameSite/rotation) | `utils/cookies.js`, `tokenService` |
| SQLi / XSS / CSRF / Command / Path / Open-redirect | parameterized SQL; `sanitize-html` at storage + React text render + strict CSP; csurf; no shell exec; no user-controlled fs paths / redirects |
| AES-256 for sensitive data + key mgmt | `utils/crypto.js`, `mfaService.js` |
| Security headers (CSP/HSTS/XFO/XCTO/Referrer) | `middleware/security.js`, `nginx.conf` |
| Audit logging (no secrets) + searchable | `auditService.js`, `logger.js`, `/admin/audit-logs` |
| Data export + account deletion | `profileService.exportData` / `deleteAccount` |
| Booking integrity / race / rollback | `bookingService.book` (tx + `FOR UPDATE` + unique) |
| Threat modeling (STRIDE) | `THREAT_MODEL.md` |
| Pen test report (IDOR + Stored XSS, before/after) | `PENTEST_REPORT.md` |
| Vulnerability doc fields (OWASP/CVSS/steps/remediation/retest) | `PENTEST_REPORT.md` §3–4 |
| 40+ commit roadmap | `COMMIT_ROADMAP.md` (55) |
| Dockerfile + docker-compose (fe/be/db) | `backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml` |
| GitHub Actions (tests/lint/security/build) | `.github/workflows/ci.yml` |
| Folder structure / API docs / FE structure | `README.md`, `API.md`, `FRONTEND_PAGES.md` |
| Implementation plan | `IMPLEMENTATION_PLAN.md` |

## OWASP Top 10 (2021) coverage

| Risk | Mitigation in this project |
|------|----------------------------|
| A01 Broken Access Control | RBAC + ownership checks + self-scoped routes; session revocation on priv change |
| A02 Cryptographic Failures | bcrypt(12), AES-256-GCM, SHA-256 token hashing, TLS/HSTS, Secure cookies |
| A03 Injection | Parameterized queries, input validation, `sanitize-html` on stored UGC, React output encoding, strict CSP |
| A04 Insecure Design | Threat model, secure defaults, fail-closed config, least privilege |
| A05 Security Misconfiguration | Helmet, disabled `x-powered-by`, non-root container, strict CORS |
| A06 Vulnerable Components | `npm audit` + CodeQL in CI, pinned base images |
| A07 Auth Failures | MFA, lockout, rotation, enumeration resistance, rate limiting |
| A08 Software & Data Integrity | Refresh reuse detection, CI build, image healthchecks |
| A09 Logging & Monitoring Failures | Append-only audit log, redaction, admin review UI, alerts |
| A10 SSRF | No user-controlled outbound URLs; egress limited to configured SMTP/CAPTCHA |
