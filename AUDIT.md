# Repository Compliance Audit — Secure Event Management Platform

**Audit date:** 2026-07-23
**Method:** Full manual source read (backend `src/`, `migrations/`, `tests/`, frontend `src/`, `docker-compose.yml`, both `Dockerfile`s, `.github/workflows/ci.yml`, all of `docs/`), `git log`/`git show` history inspection, `npm audit` against both installed dependency trees, and targeted greps for secrets/XSS/SQL-injection patterns. This is a read-only audit; no files other than this report were modified.

**Bottom line up front:** the codebase is a genuinely well-built, security-conscious Node/Express + React application — parameterized queries, real IDOR/mass-assignment guards, working TOTP MFA, working CSRF/session hardening, and a race-safe booking transaction are all real and correctly wired, not just claimed. But two of the supporting deliverables are not honest representations of what happened: the penetration-test report documents two vulnerabilities being "found" and "fixed" that never existed as actual code — verified below — and the entire 58-commit history was produced in one ~10-hour sitting on a single day rather than incrementally. If a marker checks git blame/timestamps or asks "walk me through when you found the IDOR bug," this will not hold up. Fixing the report framing and being ready to explain the commit pattern honestly is more urgent than any code change.

---

## Step 1 — Orientation

**Stack:** Node.js ≥18 (CI uses Node 20) / Express 4.19 backend (`backend/`, CommonJS). React 18 + Vite 5 + Tailwind 3 frontend (`frontend/`). PostgreSQL 16. Docker + Docker Compose for orchestration. Jest + Supertest for backend tests. GitHub Actions for CI.

**Run it:**
- Docker: `docker compose up --build` → app on `http://localhost:8080`, API proxied at `/api`, Mailhog UI on `:8025` ([docker-compose.yml](docker-compose.yml)).
- Local: `cd backend && npm install && npm run migrate && npm run dev` (port 4000, entry [backend/src/server.js](backend/src/server.js)); `cd frontend && npm install && npm run dev` (port 5173, proxies `/api`).

**Directory layout (significant folders):**
| Path | Contents |
|---|---|
| `backend/src/config` | env loader (fail-fast), DB pool, migration runner |
| `backend/src/middleware` | helmet/CORS/hpp, rate limiters, CSRF, authenticate, authorize (RBAC), captcha, error handler |
| `backend/src/validators` | express-validator chains (single source of truth, `validators/index.js`) |
| `backend/src/models` | parameterized data access (`userModel.js`, `eventModel.js`) |
| `backend/src/services` | business logic: auth, token, mfa, event, booking, profile, audit, mailer |
| `backend/src/controllers` / `routes` | thin HTTP handlers + route/middleware wiring |
| `backend/migrations` | 3 additive SQL migrations (schema, TOTP+username, bio) |
| `backend/tests` | 8 Jest/Supertest files: RBAC, crypto, password, sanitize, captcha, stored-XSS, health |
| `frontend/src/{pages,components,context,api}` | React SPA — Home, Login, Register, Events, Profile, AdminDashboard |
| `docs/` | API, DATABASE, FRONTEND_PAGES, THREAT_MODEL, PENTEST_REPORT, IMPLEMENTATION_PLAN, COMMIT_ROADMAP, COURSEWORK_MAPPING |

**Database / query layer:** raw `pg` `Pool`, no ORM. All queries use `$1..` placeholders ([backend/src/config/db.js:33-35](backend/src/config/db.js#L33-L35)). A `withTransaction` helper wraps BEGIN/COMMIT/ROLLBACK for the booking flow.

**Full route inventory:**

| Method | Path | Access | File |
|---|---|---|---|
| POST | `/api/auth/register` | 🔓 public (rate-limited, CAPTCHA) | [authRoutes.js:15](backend/src/routes/authRoutes.js#L15) |
| POST | `/api/auth/verify-email` | 🔓 public (rate-limited) | [authRoutes.js:16](backend/src/routes/authRoutes.js#L16) |
| POST | `/api/auth/login` | 🔓 public (rate-limited, CAPTCHA) | [authRoutes.js:19](backend/src/routes/authRoutes.js#L19) |
| POST | `/api/auth/mfa/verify` | 🔓 public, MFA-token-scoped (rate-limited) | [authRoutes.js:22](backend/src/routes/authRoutes.js#L22) |
| POST | `/api/auth/refresh` | cookie-scoped | [authRoutes.js:25](backend/src/routes/authRoutes.js#L25) |
| POST | `/api/auth/logout` | 🔑 authenticated | [authRoutes.js:26](backend/src/routes/authRoutes.js#L26) |
| GET | `/api/users/me` | 🔑 self | [userRoutes.js:15](backend/src/routes/userRoutes.js#L15) |
| PATCH | `/api/users/me` | 🔑 self | [userRoutes.js:16](backend/src/routes/userRoutes.js#L16) |
| GET | `/api/users/me/bookings` | 🔑 self | [userRoutes.js:17](backend/src/routes/userRoutes.js#L17) |
| POST | `/api/users/me/change-password` | 🔑 self | [userRoutes.js:18](backend/src/routes/userRoutes.js#L18) |
| POST | `/api/users/me/mfa/setup` \| `/enable` \| `/disable` | 🔑 self | [userRoutes.js:19-21](backend/src/routes/userRoutes.js#L19-L21) |
| GET | `/api/users/me/export` | 🔑 self | [userRoutes.js:22](backend/src/routes/userRoutes.js#L22) |
| DELETE | `/api/users/me` | 🔑 self | [userRoutes.js:23](backend/src/routes/userRoutes.js#L23) |
| GET | `/api/events`, `/api/events/:id` | 🔓 public | [eventRoutes.js:12-13](backend/src/routes/eventRoutes.js#L12-L13) |
| POST/PUT/DELETE | `/api/events`, `/api/events/:id` | 🎫 organizer/admin + ownership | [eventRoutes.js:16-20](backend/src/routes/eventRoutes.js#L16-L20) |
| GET | `/api/events/:id/attendees` | 🎫 organizer/admin + ownership | [eventRoutes.js:21-22](backend/src/routes/eventRoutes.js#L21-L22) |
| GET | `/api/bookings/me` | 🔑 self | [bookingRoutes.js:14](backend/src/routes/bookingRoutes.js#L14) |
| POST | `/api/bookings/events/:eventId` | 🔑 self | [bookingRoutes.js:15](backend/src/routes/bookingRoutes.js#L15) |
| POST | `/api/bookings/:id/cancel` | 🔑 self/admin ownership | [bookingRoutes.js:16](backend/src/routes/bookingRoutes.js#L16) |
| GET/PATCH/POST | `/api/admin/*` | 🛡️ admin only, whole surface | [adminRoutes.js:12](backend/src/routes/adminRoutes.js#L12) |
| GET | `/api/health`, `/api/csrf-token` | 🔓 public | [app.js:35,40](backend/src/app.js#L35) |

---

## Step 2 — Compliance matrix

### A. Core functional features

| # | Requirement | Status | Evidence | Notes / Gap |
|---|---|---|---|---|
| 1 | Intuitive, accessible UI | Partial | [frontend/src/App.jsx](frontend/src/App.jsx), Tailwind throughout | Clean, functional Tailwind UI. No accessibility audit evidence (axe/Lighthouse) exists in the repo. |
| 2 | Ease of navigation across roles | Implemented | [App.jsx:11-33](frontend/src/App.jsx#L11-L33) shows/hides Admin link by role; [ProtectedRoute.jsx](frontend/src/components/ProtectedRoute.jsx) role-gates routes | Client-side gating only, correctly backed by server RBAC (see #27). |
| 3 | Accessibility (semantic HTML, ARIA, labels, contrast, keyboard, focus) | **Missing/Partial** | [Login.jsx:52-55](frontend/src/pages/Login.jsx#L52-L55), [Register.jsx:39-47](frontend/src/pages/Register.jsx#L39-L47) | Login/Register inputs have **no `<label>`**, rely on placeholder text only (fails WCAG 1.3.1/4.1.2). [AdminDashboard.jsx:34-38](frontend/src/pages/AdminDashboard.jsx#L34-L38) role `<select>` and suspend button have no `aria-label`. No skip-to-content link, no visible-focus styling defined ([index.css](frontend/src/index.css) is bare Tailwind directives — relies entirely on browser defaults). Profile.jsx *does* correctly label its two fields ([Profile.jsx:139,142](frontend/src/pages/Profile.jsx#L139-L142)) — inconsistent, not absent. |
| 4 | Secure registration and login | Implemented, with a gap | [authService.js:30-59,78-130](backend/src/services/authService.js#L30-L130) | Real: bcrypt, uniqueness checks, email verification, enumeration-safe login, lockout, MFA challenge. **Gap:** no password-reset ("forgot password") flow exists anywhere — `grep -rn "reset-password\|forgot"` across both `src/` trees returns nothing, despite `user_tokens.purpose` explicitly supporting `'password_reset'` ([001_init.sql:64](backend/migrations/001_init.sql#L64)) and being documented as if used ([DATABASE.md:28](docs/DATABASE.md#L28)). A user who forgets their password has no self-service recovery path. |
| 5 | MFA (TOTP) — enrollment, verification, recovery codes | Implemented | [mfaService.js:41-121](backend/src/services/mfaService.js#L41-L121) | speakeasy TOTP, QR + manual key, secret AES-256-GCM encrypted at rest, 10 single-use recovery codes, constant-time compare ([safeEqual](backend/src/utils/crypto.js#L73-L78)), ±1 step window. |
| 6 | Brute-force protection (rate limit, lockout, CAPTCHA) | Implemented | [rateLimiters.js](backend/src/middleware/rateLimiters.js), [userModel.js:106-118](backend/src/models/userModel.js#L106-L118), [captcha.js](backend/src/middleware/captcha.js) | Layered: authLimiter (10/15min) + lockout (5 attempts/15min) + reCAPTCHA v2, fail-closed on Google unreachability. |
| 7 | Custom auth logic, zero-trust aligned | Implemented | [authenticate.js](backend/src/middleware/authenticate.js), [authorize.js](backend/src/middleware/authorize.js) | Every request re-verifies the JWT and re-derives role server-side; no implicit trust from prior requests. |
| 8 | Secure profile personalisation | Implemented | [profileService.js:24-31](backend/src/services/profileService.js#L24-L31) | Whitelisted fields + sanitize-html. |
| 9 | IDOR protection | Implemented | [bookingService.js:69-72](backend/src/services/bookingService.js#L69-L72), [eventService.js:28-32](backend/src/services/eventService.js#L28-L32), userRoutes self-scoping | Traced every ID-taking route: bookings check `user_id` ownership, events check `organizer_id`, `/users/*` never take a foreign id. |
| 10 | Mass-assignment protection | Implemented | [userModel.js:62-73](backend/src/models/userModel.js#L62-L73) | `updateProfile` only ever writes `full_name`/`bio`/`avatar_path`; role/status/email_verified columns are structurally unreachable from that function. |
| 11 | Privilege-escalation protection | Implemented | [adminController.js:13-25](backend/src/controllers/adminController.js#L13-L25) | Role is settable only via `PATCH /admin/users/:id/role`, admin-gated, and explicitly blocks self-change. No route lets a user set their own `role`. |
| 12 | Secure handling of profile data | Implemented | [userModel.js:10-26](backend/src/models/userModel.js#L10-L26) | `publicView` projection excludes `password_hash`, `mfa_secret_cipher`, counters. |
| 13 | Data export **and import**, privacy-aligned | Partial | [profileService.js:64-83](backend/src/services/profileService.js#L64-L83) (export); no import found | Export is a real GDPR-style JSON dump excluding secrets. **No data-import feature exists at all** — the requirement is only half-satisfied. |
| 14 | Transaction/payment processing | **Missing** | `grep -rniE "stripe\|paypal\|braintree\|payment"` across `backend/src` and `frontend/src` returns nothing | `events.ticket_price` is modeled and displayed ([Events.jsx:36](frontend/src/pages/Events.jsx#L36)) but never charged — booking a paid event is functionally identical to booking a free one. No payment gateway, no checkout flow, no justification documented for its absence. |
| 15 | Transaction integrity & confidentiality | N/A (justify) | — | No payment processing exists (#14), so there is no financial transaction to secure. The *booking* transaction's integrity is covered under #16. |
| 16 | Error handling & rollback (real DB transactions) | Implemented | [bookingService.js:20-60,62-89](backend/src/services/bookingService.js#L20-L89), [db.js:42-55](backend/src/config/db.js#L42-L55) | Genuine `BEGIN`/`COMMIT`/`ROLLBACK` via `withTransaction`, `SELECT … FOR UPDATE` row lock, thrown errors roll back. |
| 17 | Supply-chain risk (3rd-party APIs/deps) | Partial | [ci.yml:48-49](.github/workflows/ci.yml#L48-L49); `npm audit` run live (below) | `npm audit --audit-level=high` runs in CI but is piped to `|| true` — **it can never fail the build regardless of findings**. `csurf` (used for CSRF) is an unmaintained/deprecated package (last major release years ago); live audit found it pulls a vulnerable `cookie` sub-dependency (low). No Dependabot/Renovate config present. Frontend CI job never runs `npm audit` at all ([ci.yml:51-66](.github/workflows/ci.yml#L51-L66)). |
| 18 | Meaningful user activity logging | Implemented | [auditService.js:11-36](backend/src/services/auditService.js#L11-L36) | 22 distinct audit actions (login, MFA, role change, bookings, exports, etc.). |
| 19 | Logging supports audit/IR/security review | Implemented | [adminController.js:45-52](backend/src/controllers/adminController.js#L45-L52), [AdminDashboard.jsx:51-61](frontend/src/pages/AdminDashboard.jsx#L51-L61) | Filterable `/admin/audit-logs` endpoint + UI surfacing `alert`-outcome events. |
| 20 | No sensitive data in logs | Implemented | [logger.js:10-31](backend/src/utils/logger.js#L10-L31) | Deny-list redaction (`password`, `token`, `secret`, `otp`, `cookie`, etc.) applied recursively before any `emit()`. Verified no raw password/token is passed to `logger.*` anywhere in `backend/src`. |
| 21 | Real-time monitoring & alerting | Partial | Admin dashboard "Recent security events" panel ([AdminDashboard.jsx:51-61](frontend/src/pages/AdminDashboard.jsx#L51-L61)) | Alerts (`TOKEN_REUSE_ALERT`, `SUSPICIOUS_LOGIN`, `USER_SUSPEND`) are recorded and visible, but only if an admin proactively opens the dashboard and refreshes — there is no push channel (email/webhook/Slack) and no polling/websocket, so nothing is "real-time." |

### B. Security features

| # | Requirement | Status | Evidence | Notes / Gap |
|---|---|---|---|---|
| 22 | Password policy: length, complexity, reuse, expiry, feedback | Partial | [password.js:15-41](backend/src/utils/password.js#L15-L41), [authService.js:167-186](backend/src/services/authService.js#L167-L186), [PasswordStrengthMeter.jsx](frontend/src/components/PasswordStrengthMeter.jsx) | 12+ chars, upper/lower/digit/symbol, common-password deny-list, last-5-hash reuse prevention, live client meter mirroring the server policy — all real. **No expiry** is implemented (arguably correct per modern NIST guidance, but the literal brief item is unmet — call this out explicitly if a marker asks). |
| 23 | Passwordless authentication (optional) | Missing (acknowledged optional) | — | Not implemented; no WebAuthn/magic-link. Reasonable to omit for an MVP but should be stated as a known gap rather than silently absent. |
| 24 | Rate limiting / throttling, system-wide | Implemented | [app.js:32](backend/src/app.js#L32), [rateLimiters.js:16-22](backend/src/middleware/rateLimiters.js#L16-L22) | `globalLimiter` (300/15min) applied ahead of every route. |
| 25 | IP-based blocking and allow-listing | **Missing** | — | Only CORS *origin* allow-listing exists ([security.js:38-49](backend/src/middleware/security.js#L38-L49)), which is not the same control. No mechanism to block or allow-list by client IP. |
| 26 | Consistent brute-force protection across **all** auth/sensitive endpoints | Partial | [authRoutes.js](backend/src/routes/authRoutes.js) vs [userRoutes.js](backend/src/routes/userRoutes.js) | `register`/`login` get `authLimiter` (10/15min); `mfa/verify` gets `otpLimiter` (5/10min). But `POST /users/me/change-password`, `/me/mfa/setup`, `/me/mfa/enable`, `/me/mfa/disable` have **only** the 300/15min global limiter — a stolen/valid session can hammer MFA-disable or password-change far faster than the auth endpoints allow. |
| 27 | RBAC with least privilege | Implemented | [authorize.js:12-31](backend/src/middleware/authorize.js#L12-L31) | Hierarchical (`admin>organizer>user`) + explicit `requireRole`. |
| 28 | Access restrictions enforced app-wide, incl. API | Implemented | All route files reviewed | Every non-public route carries `authenticate` (+ `requireRole` where relevant); verified end-to-end for admin, events, bookings, users. |
| 29 | Evidence access-control logic is tested | Implemented | [authorize.test.js](backend/tests/authorize.test.js) | 4 unit tests covering `requireRole`/`requireAtLeast` including the admin-superset case. Coverage is middleware-only — no integration test drives a real 403 through a live route with Supertest. |
| 30 | Secure cookie attributes | Implemented | [cookies.js:9-25](backend/src/utils/cookies.js#L9-L25) | `HttpOnly`, `Secure` in prod, `SameSite=strict`, sensible `maxAge` (15min access / 7d refresh), refresh cookie path-scoped to `/api/auth`. |
| 31 | Session expiration & invalidation (logout, password change) | Implemented | [authService.js:184](backend/src/services/authService.js#L184) (`revokeAllForUser` on password change), [adminController.js:18,31](backend/src/controllers/adminController.js#L18) (on role change/suspend), [tokenService.js:108-112](backend/src/services/tokenService.js#L108-L112) (logout) | Comprehensive. |
| 32 | CSRF, session fixation, hijacking protection | Implemented | [csrf.js](backend/src/middleware/csrf.js) (double-submit), [tokenService.js:56-61](backend/src/services/tokenService.js#L56-L61) (fresh family per login = fixation defence), HttpOnly/Secure/SameSite cookies (hijacking) | |
| 33 | Session binding to UA/device (optional) | Missing | [tokenService.js:47-53](backend/src/services/tokenService.js#L47-L53) | `user_agent`/`ip_address` are stored on `refresh_tokens` for forensics but **never compared** on `rotate()` — a stolen refresh token works from any device/IP. Optional item, but worth noting since the data needed is already captured and unused. |
| 34 | Secure password hashing | Implemented | [password.js:43-45](backend/src/utils/password.js#L43-L45), [env.js:84](backend/src/config/env.js#L84) | bcrypt, cost factor 12. |
| 35 | Encryption of sensitive data at rest | Implemented | [crypto.js:22-50](backend/src/utils/crypto.js#L22-L50) | AES-256-GCM (auth-tag verified, tamper-evident — confirmed by [crypto.test.js:16-21](backend/tests/crypto.test.js#L16-L21)) for TOTP secret and recovery codes. |
| 36 | Key management practices; no hardcoded secrets | Implemented | [env.js:12-20](backend/src/config/env.js#L12-L20) (fail-fast `required()`), `.gitignore:6-7` | Confirmed via `git ls-files \| grep env` that only `.env.example` files are tracked, never `.env`. Full `git log -p` secret-pattern scan (below) found no committed credentials. `.env.example` documents Google's own *public* reCAPTCHA test keys in a comment, which are not secrets. |

### C. Secure development practice

| # | Requirement | Status | Evidence | Notes / Gap |
|---|---|---|---|---|
| 37 | GitHub-hosted with meaningful history | Implemented | `git remote -v` → `https://github.com/Hunnyrohan/secure-event-platform.git` | Remote confirmed configured; could not verify push status/visibility from a local clone alone. |
| 38 | ≥40 meaningful commits | Implemented (count), Partial (spirit) | `git log --oneline \| wc -l` → **58** | Exceeds the 40 minimum. See Step 3 for why the *pattern* of these commits is a bigger problem than the count. |
| 39 | Evidence of incremental security improvements | Partial | commit sequence in Step 3 | Commits are logically layered (schema → crypto → middleware → auth → RBAC → features → docs), which *reads* as incremental engineering. But see Step 3: they were not made incrementally in real time. |
| 40 | Vulnerability fixes visible in commit history | **Missing** | `git log --oneline --follow -- backend/src/services/bookingService.js` → **one commit, ever** (`e1b9009`); same for `frontend/src/pages/Events.jsx` (`e56f406`) | The two "before/after" vulnerabilities documented in `PENTEST_REPORT.md` (IDOR on booking cancel, stored XSS in event description) **do not correspond to any real commit history**. The file that supposedly had the IDOR bug fixed has existed as exactly one commit since the repository's creation, and that one commit already contains the ownership check. Same for the file that supposedly had `dangerouslySetInnerHTML`. See Step 3 for full detail — this is the single most important finding in this audit. |
| 41 | Containerization, no bad practices | Implemented (structurally); build **not verified** | [backend/Dockerfile](backend/Dockerfile) (multi-stage, `USER app` non-root, healthcheck), [frontend/Dockerfile](frontend/Dockerfile) (multi-stage nginx) | No secrets baked into layers (env vars injected at `docker compose` runtime, not `ARG`/`ENV` in the Dockerfile). Backend correctly drops root. **Not verified:** Docker CLI is present in this environment but the daemon was not running, so `docker build` could not be executed as part of this audit — run it yourself before submission. |
| 42 | CI/CD with automated security checks | Partial | [ci.yml](.github/workflows/ci.yml) | Real: ESLint with `eslint-plugin-security` (SAST-lite, [backend/.eslintrc.json](backend/.eslintrc.json)), CodeQL job, `npm audit` job, Docker build job. Gaps: `npm audit` is non-blocking (`\|\| true`), frontend has no audit step, no secret-scanning tool (gitleaks/trufflehog/git-secrets) is configured despite Step 5's brief calling for exactly that. |

### D. Supporting deliverables

| # | Requirement | Status | Evidence | Notes / Gap |
|---|---|---|---|---|
| 43 | Pentest doc: scope, assumptions, ethics | Partial | [PENTEST_REPORT.md:1-13](docs/PENTEST_REPORT.md#L1-L13) | Scope, out-of-scope, and rules-of-engagement sections are present and well-formed. But the document is unfinished: retest dates are literal placeholders `_<fill in>_` ([PENTEST_REPORT.md:236-237](docs/PENTEST_REPORT.md#L236-L237)), tester name is `_<name>_`, and every screenshot is a `[SCREENSHOT: …]` placeholder, not an actual image. |
| 44 | Vulnerability write-ups: CVSS v3.1, exploitation, remediation | Partial, credibility issue | [PENTEST_REPORT.md:56-221](docs/PENTEST_REPORT.md#L56-L221) | Mechanically excellent — correct CVSS vectors, clear exploitation steps, before/after code. But as established under #40, neither "before" state ever existed in this repository's git history. The report presents a fictionalized narrative as if it were a real internal pentest with real findings; it reads as a template/writing exercise rather than a genuine test log. This will not survive a marker asking "show me the commit where you found this." |
| 45 | Formal report document | **Missing** | `docs/COURSEWORK_MAPPING.md` | This file is explicitly a *skeleton to write the report from* ("Use this as the skeleton for your written report" — [COURSEWORK_MAPPING.md:3](docs/COURSEWORK_MAPPING.md#L3)), not the report itself. No consolidated formal report exists anywhere in the repo. |
| 46 | References list (≥15 academic/professional sources) | **Missing** | `grep -n -i "reference\|bibliography"` across `README.md` and every `docs/*.md` | Zero hits. No bibliography/references section exists anywhere in the repository. |

---

## Step 3 — Commit history analysis

```
$ git log --oneline | wc -l
58
```

**Timestamps** (`git log --pretty=format:'%ad' --date=iso-strict`): every single commit — all 58 — carries the date **2026-07-14**, spanning **01:29:36 to 11:33:23** on that one day (≈10 hours wall-clock, `+05:45` timezone offset). `git log --pretty=format:'%ad' --date=short | sort | uniq -c` confirms: `58 2026-07-14`, one line, one date.

Within that window the commits arrive in tight bursts, frequently multiple commits per **second**: e.g. commits `dc40a9b` through `2ab4157` (the final 7, docs + CI + Docker) all land within `11:33:22`–`11:33:23`; a block of 9 commits (`db36511`…`6220b8d`) lands within `11:29:01`–`11:29:03`. This is not how a person types and reviews 58 separate commits — it is the signature of a script or agent generating and committing files programmatically in sequence.

**Single author, throughout:** `git log --pretty=format:'%an <%ae>' | sort -u` returns exactly one identity, `Rohan <yadavroohan4545@gmail.com>`, for all 58 commits.

**Assessment against the brief's own authenticity check:** this is a textbook case of the "bulk-dumped in one sitting" pattern the brief explicitly asks to flag. It is not disqualifying by itself, but it is exactly the kind of pattern a marker doing minimal diligence (`git log --format=%ad`) will notice in under 10 seconds.

**Are messages meaningful, or generic filler?** Meaningful — every message follows conventional-commit style (`feat(scope): specific description`) and accurately describes its diff (spot-checked `bookingService.js`, `Events.jsx`, `mfaService.js` against their commit messages — all accurate). This is a genuine strength; the messages are not `update`/`fix`/`asdf` filler.

**The smoking gun — `docs/COMMIT_ROADMAP.md`:** this file, added in the *very last* commit (`2ab4157`, `11:33:23`), is titled "Git Commit Roadmap (48 meaningful commits)" and opens with: *"A suggested, incremental commit history… Use it to structure real work."* Its 55 numbered entries map almost 1:1, in the same order, with near-identical wording, onto the 58 real commits that preceded it. In other words: **the plan describing how commits should incrementally unfold was itself committed only after every commit it describes had already been made.** The most plausible read is that this roadmap (or an equivalent prompt) was used to generate the commit sequence mechanically in one automated pass, and the roadmap doc was added at the end as an artifact of that process — not written first and followed over time. State this plainly if a marker asks; a well-prepared "yes, I used an AI-assisted workflow to scaffold this and then reviewed/understood every file" answer is far safer than pretending the timestamps mean something else.

**Vulnerability-fix commits (the brief's "gold" requirement):** none exist. Checked specifically:
- `git log --oneline --follow -- backend/src/services/bookingService.js` → **1 commit total** (`e1b9009`, "add transactional booking service"), and `git show e1b9009:backend/src/services/bookingService.js` shows the ownership check (`booking.user_id !== user.id && user.role !== 'admin'`) was present from that first and only commit.
- `git log --oneline --follow -- frontend/src/pages/Events.jsx` → **1 commit total** (`e56f406`).
- Therefore the IDOR (VULN-01) and Stored-XSS (VULN-02) findings in `PENTEST_REPORT.md`, which are written as genuine before/after fixes, are **not evidenced by the commit history at all**. This directly contradicts item #40 of the brief and undermines the credibility of item #44.

**Committed secrets scan:**
```
git log -p -- ':!*/node_modules/*' | grep -iE "(api[_-]?key|secret|password|token)\s*="
```
Every hit inspected (60 lines) is either: a variable/function *name* containing "token"/"secret"/"password" (e.g. `const token = ...`, `const secret = decrypt(...)`), a placeholder in `.env.example` (`JWT_ACCESS_SECRET=replace_with_64_char_random_hex`), a deterministic **test-only** value in `backend/tests/setup.js` (`process.env.JWT_ACCESS_SECRET = 'test_access_secret_at_least_32_chars_long_padding'`), or Google's own publicly-documented reCAPTCHA *test* site/secret keys, quoted in a comment for developer convenience. **No real secret is committed anywhere in this repository's history.** `git ls-files | grep env` confirms only `.env.example` files are tracked; `backend/.env` exists on disk but is untracked (`.gitignore:6-7`).

---

## Step 4 — Independent security review

Beyond the checklist, targeted hunting for real vulnerabilities:

### Finding 1 — No password-reset (account-recovery) flow
- **OWASP category:** A07:2021 – Identification and Authentication Failures (missing control, not a broken one)
- **Severity:** Low (availability/UX, not exploitable)
- **Evidence:** `user_tokens.purpose` supports `'password_reset'` ([001_init.sql:64](backend/migrations/001_init.sql#L64)); no route, controller, or service implements it. `grep -rn "forgot\|reset-password\|password_reset"` across both `src/` trees returns nothing outside the schema comment and docs.
- **Impact:** Any user who forgets their password is permanently locked out with no self-service path; only an admin manually resetting the DB row could recover the account.
- **Fix:** Implement `POST /auth/forgot-password` (issue a `user_tokens` row of purpose `password_reset`, email a link, rate-limit hard) and `POST /auth/reset-password` (validate token hash + expiry, set new password, revoke all sessions) — the schema and `mailer.js` plumbing already support this; it's a genuinely small addition.

### Finding 2 — Inconsistent rate limiting on session-sensitive self-service endpoints
- **OWASP category:** A07:2021 – Identification and Authentication Failures
- **Severity:** Low–Medium
- **Vulnerable code:** [backend/src/routes/userRoutes.js:18-21](backend/src/routes/userRoutes.js#L18-L21) — `change-password`, `mfa/setup`, `mfa/enable`, `mfa/disable` carry no route-specific limiter, only the blanket `globalLimiter` (300 requests/15 min, shared across the whole API).
- **Exploitation path:** An attacker who has obtained a valid session (e.g. via an XSS gap elsewhere, or a shared/unlocked device) can attempt hundreds of MFA-disable or password-change requests far faster than the dedicated `authLimiter` (10/15min) or `otpLimiter` (5/10min) would allow on the equivalent auth-flow endpoints.
- **Fix:** Apply `otpLimiter` (or a dedicated, tighter limiter) to `mfa/enable` (brute-forcing the 6-digit confirmation code) and a moderate limiter to `change-password`/`mfa/disable`.

### Finding 3 — Non-blocking dependency audit in CI
- **OWASP category:** A06:2021 – Vulnerable and Outdated Components
- **Severity:** Low (process gap, not a live vulnerability)
- **Evidence:** [ci.yml:49](.github/workflows/ci.yml#L49): `npm audit --audit-level=high || true`. Live run in this audit found: backend — `csurf`/`cookie` (low, `csurf` itself deprecated upstream) and `uuid` <11.1.1 (moderate, CVSS 7.5, GHSA-w5hq-g745-h8pq — buffer bounds check issue); frontend — `vite`/`esbuild` (high, dev-server-only exposure). None are currently high-severity in a way that changes the app's risk posture materially (the `uuid` issue needs `buf` misuse this codebase doesn't do; `vite`'s issue is dev-server-only), but the `|| true` means **CI would report the same result whether it were critical or clean** — the gate does nothing.
- **Fix:** Drop `|| true`, pin an acceptable severity threshold the team actually wants enforced, and add the same `npm audit` step to the frontend CI job (currently absent entirely).

### Finding 4 — Session/device binding data captured but unused
- Already covered under checklist item #33. Listed here because it's a real, fixable gap: the `refresh_tokens.user_agent`/`ip_address` columns are populated on every issuance ([tokenService.js:47-53](backend/src/services/tokenService.js#L47-L53)) but `rotate()` never reads them back for comparison, so the data collected for exactly this purpose sits unused.

**Areas checked and found clean:** SQL injection (100% parameterized, confirmed by reading every `db.query`/`client.query` call site — no string concatenation into SQL anywhere), reflected/DOM XSS (React text rendering throughout, zero `dangerouslySetInnerHTML` in the codebase), CSRF (double-submit cookie correctly wired, correctly exempted only on pre-session endpoints), business-logic booking race (genuinely fixed with `SELECT … FOR UPDATE` + `UNIQUE(event_id,user_id)` + `CHECK` constraints — verified this isn't just claimed), CORS (strict allow-list, not a wildcard-with-credentials mistake), security headers (Helmet CSP is `default-src 'none'` on the API — appropriately strict for a JSON-only backend), file upload (no file upload endpoint exists at all — `avatarPath` is a plain string field the client would have to populate out-of-band; there is no upload handler to attack), command/template injection (no `eval`, `child_process`, or template-engine usage found), hardcoded credentials (none, see Step 3).

---

## Step 5 — Output

### 1. Completion estimate

**≈70–75% of the brief's literal requirements are implemented and enforced**, with the *code quality* of what exists being genuinely strong (this is well above typical coursework baseline for the security fundamentals: MFA, RBAC, IDOR, mass assignment, CSRF, session handling, encryption at rest are all real and correctly wired). The shortfall is concentrated in three places: (a) a handful of concrete features are simply absent — payment processing, data import, password reset, IP allow/block-listing; (b) supporting deliverables are incomplete — no formal report, no references list, pentest report has unfilled placeholders; and (c) the pentest report's two headline findings are not backed by the actual commit history, which is a credibility problem more than a coding problem.

### 2. Prioritised action list (Missing/Partial items, ranked by marks-at-risk × effort)

| Priority | Item | Est. effort | Why it's ranked here |
|---|---|---|---|
| 1 | Rewrite `PENTEST_REPORT.md` VULN-01/02 to be honest — either genuinely re-introduce and re-fix the bugs as real commits and re-test them, or reframe the report as "illustrative walkthroughs of controls implemented" rather than "we found these in testing" | 2–4 hrs | Highest credibility risk in the whole repo; directly contradicts checklist items #40/#44 if checked |
| 2 | Write the formal consolidated report document (item #45) using `COURSEWORK_MAPPING.md` as the skeleton it's meant to be | 4–8 hrs | Explicitly required deliverable, currently just a template |
| 3 | Add a references/bibliography list, ≥15 sources (item #46) | 1–2 hrs | Explicitly required, zero present |
| 4 | Implement password-reset flow (Finding 1) | 2–3 hrs | Real functional gap; schema already supports it |
| 5 | Decide on and either implement or explicitly justify-as-N/A: payment processing (#14), data import (#13) | 3–6 hrs (implement) / 30 min (justify) | Explicit brief items currently silently absent |
| 6 | Fix accessibility gaps: add `<label>`s to Login/Register, `aria-label`s on AdminDashboard controls, visible focus styles (#3) | 1–2 hrs | Explicit brief item, concrete and fast to fix |
| 7 | Tighten rate limiting on `change-password`/`mfa/enable`/`mfa/disable` (Finding 2, #26) | 30 min | Small code change, closes a real gap |
| 8 | Make `npm audit` actually gate CI and add it to the frontend job (Finding 3, #17/#42) | 30 min | Small config change |
| 9 | Add IP allow/block-listing, even a minimal implementation (#25) | 1–2 hrs | Explicit brief item, currently fully absent |
| 10 | Be ready to explain the commit timestamp pattern honestly if asked (Step 3) | 0 min (prep only) | Can't be "fixed" retroactively without rewriting history, which is riskier than owning it |

### 3. Quick wins (< 30 minutes each)

- Add `aria-label`s to the AdminDashboard role `<select>` and Suspend button, and wrap Login/Register inputs in `<label>` elements.
- Remove `|| true` from the backend `npm audit` CI step; add an equivalent `npm audit` step to the frontend job.
- Add `otpLimiter` to `POST /users/me/mfa/enable`.
- Add a `docs/REFERENCES.md` stub and start filling it in as sources are used (doesn't need to be done in one sitting).
- Run `docker compose up --build` once locally/on a machine with Docker running and paste the successful output into the report as evidence — this audit could not verify the build (daemon wasn't running in this environment).

### 4. Critical blockers (would risk section invalidation)

- **The pentest report's fictional before/after narrative**, if a marker cross-references it against `git log` — this is the one item that reads as academic-integrity risk rather than "incomplete work," and it is trivially checkable in under a minute (`git log --follow -- <file>`).
- **Missing formal report** (#45) — if the brief treats this as a hard deliverable rather than optional, its absence alone could invalidate the submission regardless of code quality.
- **Missing references list** (#46) — same category, explicit minimum-count requirement, currently zero.

### 5. Two vulnerabilities best suited for the before/after video demo

1. **Booking-cancellation IDOR remediation, demonstrated live rather than narrated.** The control genuinely exists and works ([bookingService.js:69-72](backend/src/services/bookingService.js#L69-L72)), so this is the safest of the two "vulnerabilities" to demo: instead of claiming a historical fix, film it as a **live red-team check** — log in as user A, book an event, log in as user B, attempt `POST /api/bookings/:A's-booking-id/cancel`, show the `403 Forbidden`. This is visually clean, easy to narrate ("here's the ownership check, here's it being enforced"), and — crucially — doesn't require the fictional before-state, sidestepping Critical Blocker #1 entirely.
2. **Stored-XSS sanitization, demonstrated live.** Submit `<img src=x onerror=alert(1)>Hello` as an event description via the UI or `curl`, then show the stored/rendered value is `Hello` with the payload stripped (backed by real passing tests in [storedXss.test.js](backend/tests/storedXss.test.js)). Same advantage: genuinely real, easy to explain in one breath ("sanitize-html strips it before it ever reaches the database"), and doesn't rely on a "before" state that never existed in the repo.

Both demos sidestep the commit-history problem by testing the *live, current* application rather than narrating a historical vulnerability-and-fix that the git log can't back up — which is the honest and lower-risk way to satisfy the video requirement given what this audit found.
