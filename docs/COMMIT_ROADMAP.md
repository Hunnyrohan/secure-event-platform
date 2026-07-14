# Git Commit Roadmap (48 meaningful commits)

A suggested, incremental commit history. Each line is a self-contained,
reviewable change with a conventional-commit message. Use it to structure real
work (and to demonstrate progression in your coursework submission).

### Setup & infrastructure
1. `chore: initialize monorepo structure and root .gitignore`
2. `chore(backend): add package.json, eslint (security plugin) and scripts`
3. `chore(backend): add .env.example and fail-fast env config`
4. `feat(db): add PostgreSQL pool with parameterized query + transaction helper`

### Database
5. `feat(db): initial schema — users, roles, status enums`
6. `feat(db): add password_history and user_tokens tables`
7. `feat(db): add recovery_codes (encrypted) + MFA secret columns`
8. `feat(db): add refresh_tokens with family lineage for rotation`
9. `feat(db): add events, bookings with capacity/unique constraints`
10. `feat(db): add notifications and append-only audit_logs`
11. `feat(db): add updated_at triggers and indexes`
12. `feat(db): add dependency-free migration runner`

### Security utilities
13. `feat(security): AES-256-GCM crypto util with key-management notes`
14. `feat(security): bcrypt password hashing + policy + strength score`
15. `feat(security): redacting structured logger (no secrets in logs)`
16. `feat(core): HttpError types, asyncHandler, cookie helpers`

### Security middleware
17. `feat(security): helmet CSP/HSTS/headers configuration`
18. `feat(security): strict CORS allow-list + hpp`
19. `feat(security): layered rate limiters (global/auth/mfa-verify)`
20. `feat(security): CSRF double-submit protection + token endpoint`
21. `feat(security): central error handler (no stack leakage) + 404`

### Authentication
22. `feat(auth): secure registration (username + email) with policy + verification`
23. `feat(auth): audit logging service with action taxonomy`
24. `feat(auth): JWT access tokens + authenticate middleware`
25. `feat(auth): refresh-token rotation with reuse detection`
26. `feat(auth): login with account lockout + enumeration resistance`
27. `feat(auth): Google Authenticator TOTP MFA (speakeasy/qrcode, AES-encrypted secret)`
28. `feat(auth): single-use TOTP recovery codes + CAPTCHA verification hook`
29. `feat(auth): suspicious-login detection (new IP) audit alert`
30. `feat(auth): logout with refresh-token revocation`

### RBAC & profile
31. `feat(authz): RBAC middleware (requireRole, hierarchy, least privilege)`
32. `feat(profile): self-scoped profile read/update (mass-assignment safe)`
33. `feat(profile): change password with history/reuse prevention`
34. `feat(profile): TOTP MFA enrollment (QR setup → confirm → recovery codes) + disable`
35. `feat(profile): personal-data export (GDPR) + account deletion`

### Events & bookings
36. `feat(events): CRUD with ownership enforcement (IDOR-safe)`
37. `feat(events): attendee listing for owners/admins`
38. `feat(bookings): transactional, race-safe booking (row lock + unique)`
39. `feat(bookings): cancellation with ownership guard + booking history`

### Admin
40. `feat(admin): user management, role change, suspend (audited)`
41. `feat(admin): searchable audit-log endpoint`

### Frontend
42. `feat(web): Vite+React+Tailwind scaffold and Axios client with CSRF/refresh`
43. `feat(web): auth context, protected routes, login + TOTP step, register (username) + strength meter`
44. `feat(web): events browsing/booking, profile, admin dashboard (XSS-safe render)`

### Testing, infra, hardening
45. `test(backend): jest unit tests (crypto, password, RBAC) + supertest smoke`
46. `build: multi-stage Dockerfiles (non-root) + docker-compose (db, mailhog)`
47. `ci: GitHub Actions — lint, test, npm audit, CodeQL, image build`
48. `docs+fix: threat model, pentest report; remediate IDOR and Stored XSS`

### MFA upgrade & hardening (post-review)
49. `fix(security): remove duplicate helmet X-Content-Type-Options header`
50. `fix(web): stop unauthenticated /users/me redirect loop flooding the API`
51. `chore(deps): bump bcrypt→6 and nodemailer→9; clear high-severity audit`
52. `feat(db): migration 002 — add username + encrypted TOTP secret to users`
53. `feat(auth): switch MFA from email-OTP to Google Authenticator TOTP (speakeasy/qrcode)`
54. `feat(mail): MAIL_DRIVER=log for dev so verification works without SMTP`
55. `docs: update API, DATABASE, threat model & guides for TOTP MFA + username`
