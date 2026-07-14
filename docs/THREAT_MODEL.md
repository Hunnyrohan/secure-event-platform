# Threat Model — Secure Event Management Platform

Methodology: **STRIDE**, complemented by an assets / actors / attack-surface
inventory and a control mapping. Scope: the web application (React SPA), the
Express API, PostgreSQL, and the supporting Docker infrastructure.

---

## 1. Assets

| # | Asset | Sensitivity | Why it matters |
|---|-------|-------------|----------------|
| A1 | User credentials (password hashes) | Critical | Account takeover, credential reuse |
| A2 | Session tokens (access/refresh cookies) | Critical | Impersonation |
| A3 | MFA TOTP secret & recovery codes | Critical | MFA bypass |
| A4 | PII (name, email, booking history) | High | Privacy / regulatory harm |
| A5 | Event & booking data | Medium | Business integrity, availability |
| A6 | Audit logs | High | Forensics / non-repudiation |
| A7 | Application secrets (JWT keys, AES key, DB creds) | Critical | Full compromise |
| A8 | Admin role / RBAC | Critical | Privilege escalation to full control |

## 2. Threat actors

| Actor | Motivation | Capability |
|-------|-----------|------------|
| Unauthenticated attacker | Data theft, defacement | Network access to the API/SPA |
| Malicious registered user | Privilege escalation, access others' data | Valid low-priv session |
| Malicious organizer | Access other organizers' events/attendees | Valid organizer session |
| Automated bot | Brute force, credential stuffing, scraping | High volume, scripted |
| Insider (curious admin) | Overreach | Elevated but audited access |
| Network attacker (MITM) | Session/credential interception | On-path between client and server |

## 3. Attack surfaces / entry points

- Public endpoints: `/auth/register`, `/auth/login`, `/auth/verify-email`,
  `/auth/mfa/*`, `/events` (GET).
- Authenticated endpoints: `/users/me/*`, `/bookings/*`, `/events` (write).
- Admin endpoints: `/admin/*`.
- Cookies & CSRF token, email channel (account-verification links), authenticator
  app / TOTP enrollment, file/avatar path, DB connection, container network,
  CI/CD pipeline & dependencies.

## 4. Trust boundaries

1. Browser ⇄ API (network / TLS boundary).
2. API ⇄ PostgreSQL (data-store boundary).
3. API ⇄ SMTP (email egress boundary).
4. Public internet ⇄ container network (nginx reverse proxy).
5. Role boundary inside the API (user → organizer → admin).

---

## 5. STRIDE analysis & controls

### S — Spoofing (authenticity)
| Threat | Control |
|--------|---------|
| Guessing/stealing credentials | bcrypt (cost 12), password policy, rate limiting, account lockout, Google reCAPTCHA v2 on login |
| Automated bots (credential stuffing, mass/bot registration) | **Google reCAPTCHA v2** on `/auth/register` + `/auth/login` (server-verified against Google siteverify, fail-closed) layered with the auth rate limiter (10/15 min) and account lockout |
| Session token theft/replay | HTTP-only + Secure + SameSite=strict cookies; short access TTL; refresh rotation + reuse detection |
| Bypassing MFA | Server-issued short-lived `mfaToken` (10 min, purpose-bound) gates step-2; TOTP verified server-side with a ±1 step window; secret stored AES-256-GCM encrypted; recovery codes are single-use and constant-time compared; `/mfa/verify` is rate-limited |
| Account enumeration | Uniform "invalid email or password"; equalized timing (dummy bcrypt on unknown user) |

### T — Tampering (integrity)
| Threat | Control |
|--------|---------|
| SQL injection | Parameterized queries only (`pg` `$1..`); `express-validator` input validation + UUID checks |
| Stored XSS (persisting a script payload in events/profile) | **`sanitize-html`** allow-list sanitization at the storage boundary (`utils/sanitize.js`): strips `<script>`/`<style>`, non-allow-listed tags, `on*` handlers and `javascript:` URLs *before* the value is written to the DB |
| Malformed / oversized input | Field-level type + length validation (`express-validator`); 100 kb JSON body cap |
| Mass assignment (elevating own role) | Whitelisted update columns in `userModel.updateProfile`; role/status unreachable from profile path |
| Request parameter pollution | `hpp` middleware |
| Tampered TOTP-secret / recovery-code ciphertext | AES-256-**GCM** auth tag rejects modified ciphertext |
| Race to oversell seats | `SELECT … FOR UPDATE` in a transaction + `CHECK` + unique constraint; rollback on failure |

### R — Repudiation (accountability)
| Threat | Control |
|--------|---------|
| User denies an action | Append-only `audit_logs` with actor, IP, UA, action, outcome |
| Secrets leaking into logs | Logger redaction deny-list; audit metadata redacted before write |

### I — Information disclosure (confidentiality)
| Threat | Control |
|--------|---------|
| Leaking password hashes / internal fields | `publicView` projection; hashes never serialized |
| Verbose error/stack leakage | Central error handler returns generic 500 in prod |
| Secrets at rest | AES-256-GCM for the TOTP secret & recovery codes; SHA-256 for tokens; bcrypt for passwords |
| MITM interception | HSTS, Secure cookies, TLS termination at proxy |
| Stored/Reflected/DOM XSS stealing in-page data | Defense-in-depth: `sanitize-html` at storage + React text rendering (auto-escape, no `dangerouslySetInnerHTML`) + strict CSP (`script-src 'self'` + reCAPTCHA origins) |
| IDOR (reading others' resources) | UUID keys + ownership checks (`user_id`/`organizer_id`) on every write/sensitive read |

### D — Denial of service (availability)
| Threat | Control |
|--------|---------|
| Brute force / floods | Global + auth + MFA-verify rate limiters; body-size cap (100 kb) |
| MFA code brute force | `/auth/mfa/verify` limiter (5 / 10 min) caps guesses against the 6-digit TOTP window |
| Connection exhaustion | Bounded PG pool, connection timeouts |
| Runaway queries | Pagination caps (`LIMIT` clamps) |

### E — Elevation of privilege (authorization)
| Threat | Control |
|--------|---------|
| Vertical escalation (user→admin) | RBAC middleware `requireRole`; role changes only via audited admin route; admin cannot self-mutate role |
| Horizontal access (user↔user, organizer↔organizer) | Ownership assertions in services; self-scoped `/users/me/*` |
| Privilege persistence after demotion | Role/suspend/password-change revoke all refresh tokens |
| Forged JWT | HS256 verification with strong secret; algorithm pinned (`algorithms:['HS256']`) |

---

## 5a. Defense-in-depth: automated-abuse & XSS mitigation

Two layered controls added in the security-hardening phase:

**Bot / automated-attack mitigation (CAPTCHA).** `/auth/register` and
`/auth/login` require a Google reCAPTCHA v2 token. The backend
(`middleware/captcha.js`) verifies it server-side against Google's siteverify
API and **fails closed** (network error → request rejected). This composes with
the existing per-IP rate limiters and account lockout so brute-force /
credential-stuffing / mass-registration bots are stopped at multiple layers.
Disabled automatically when no key is configured (dev), so it never weakens the
core auth flows locally.

**Stored-XSS mitigation (content sanitization).** User-generated content is
defended at three layers:
1. **Input validation** — `express-validator` enforces type/length and rejects
   malformed input.
2. **Sanitization before storage** — `sanitize-html` (`utils/sanitize.js`) runs
   on every UGC write path (event `title`/`description`/`location`/`category`,
   profile `fullName`/`bio`). Short fields become plain text; long fields use a
   restrictive tag allow-list. Scripts, `on*` handlers and `javascript:`/unsafe
   schemes are removed, so a payload can never be persisted.
3. **Output & transport** — React renders everything as auto-escaped text (no
   `dangerouslySetInnerHTML`), and a strict CSP blocks inline script as a
   backstop.

---

## 6. Residual risks & recommendations

| Residual risk | Recommendation |
|---------------|----------------|
| In-memory rate-limit store doesn't span replicas | Use Redis-backed store in production |
| TOTP shared-secret can be phished in real time | Offer phishing-resistant WebAuthn / passkeys as an additional option |
| AES key from env | Source from KMS/Vault with rotation in production |
| No WAF | Front with a managed WAF for L7 protection |
| Avatar upload path | Validate MIME/size, store outside webroot, randomize names (see Path Traversal control) |

## 7. Data-flow summary (textual DFD)

```
[Browser SPA] --HTTPS--> [nginx reverse proxy] --HTTP(internal)--> [Express API]
     |  (HttpOnly cookies + X-CSRF-Token)                              |
     |                                                                 +--> [PostgreSQL] (parameterized)
     |                                                                 +--> [SMTP] (account-verification email; TOTP MFA needs no email)
     |                                                                 +--> [audit_logs] (append-only)
Trust boundaries crossed: 1 (browser⇄proxy), 4 (internet⇄containers), 2 (API⇄DB), 3 (API⇄SMTP)
```
