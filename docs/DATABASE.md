# Database Schema & ER Diagram Description

PostgreSQL 16. Full DDL:
[`backend/migrations/001_init.sql`](../backend/migrations/001_init.sql) +
[`002_totp_mfa_username.sql`](../backend/migrations/002_totp_mfa_username.sql)
(adds `users.username` and `users.mfa_secret_cipher` for Google Authenticator TOTP MFA).

## Design principles

- **UUID surrogate keys** on all user-facing entities → identifiers are
  non-sequential and non-guessable, structurally reducing IDOR/enumeration risk.
- **Ownership columns** (`events.organizer_id`, `bookings.user_id`) drive
  row-level authorization decisions in the service layer.
- **Secrets never stored in plaintext**: passwords → bcrypt hash; TOTP MFA
  secret (`users.mfa_secret_cipher`) & recovery codes → AES-256-GCM ciphertext;
  verification/refresh tokens → SHA-256 hash.
- **Referential integrity** via foreign keys with `ON DELETE CASCADE` so account
  deletion cleanly removes owned data (privacy / right-to-erasure).
- **Constraints enforce invariants** at the DB level (capacity ≥ seats,
  unique active booking) so integrity holds even under concurrency.

## Entities (tables)

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `users` | Accounts, roles, status, MFA flag + encrypted TOTP secret, lockout counters | `id`, `email` (unique, citext), `username` (unique, citext), `role`, `status`, `mfa_enabled`, `mfa_secret_cipher` |
| `password_history` | Last-N bcrypt hashes for reuse prevention | `user_id → users` |
| `user_tokens` | Email-verify / password-reset one-time tokens (hashed) | `user_id → users`, `purpose` |
| `recovery_codes` | Single-use TOTP backup codes (AES-256-GCM) | `user_id → users` |
| `mfa_otps` | *Legacy* email-OTP table — retained by migration but unused since MFA moved to TOTP | `user_id → users` |
| `refresh_tokens` | Rotating refresh tokens (hashed) + family lineage | `user_id → users`, `family_id` |
| `events` | Events with capacity & seat counter | `id`, `organizer_id → users` |
| `bookings` | User↔event bookings, status | `event_id → events`, `user_id → users` |
| `notifications` | Per-user notifications | `user_id → users` |
| `audit_logs` | Append-only security/audit trail | `actor_id → users`, `action`, `outcome` |

## Relationships (ER description)

```
                 ┌──────────────────────────────┐
                 │            users             │
                 │  id (PK, UUID)               │
                 │  email (UNIQUE), username (U)│
                 │  role, status, mfa_enabled   │
                 │  mfa_secret_cipher (AES-GCM) │
                 └──────────────────────────────┘
                    │ 1        │ 1        │ 1        │ 1        │ 1
       ┌────────────┘          │          │          │          └───────────────┐
       │ *                     │ *        │ *        │ *                          │ *
┌──────────────┐   ┌───────────────┐ ┌──────────┐ ┌────────────────┐   ┌──────────────────┐
│password_      │   │refresh_tokens │ │recovery_ │ │user_tokens     │   │ notifications    │
│history        │   │(family_id)    │ │codes     │ │(email_verify / │   │                  │
│               │   │               │ │(TOTP)    │ │ password_reset)│   │                  │
└──────────────┘   └───────────────┘ └──────────┘ └────────────────┘   └──────────────────┘

   users (1) ────< (many) events            [users.id = events.organizer_id]
   users (1) ────< (many) bookings          [users.id = bookings.user_id]
   events (1) ───< (many) bookings          [events.id = bookings.event_id]
   users (1) ────< (many) audit_logs        [users.id = audit_logs.actor_id, nullable]
```

Cardinalities:

- **users → events**: one-to-many (an organizer owns many events).
- **users → bookings** and **events → bookings**: bookings is the associative
  entity between users and events (many-to-many resolved), with
  `UNIQUE(event_id, user_id)` guaranteeing at most one active booking per pair.
- **users → {password_history, refresh_tokens, recovery_codes,
  user_tokens, notifications}**: one-to-many, all `ON DELETE CASCADE`
  (the TOTP secret itself lives inline on `users.mfa_secret_cipher`).
- **users → audit_logs**: one-to-many; `actor_id` is `ON DELETE SET NULL` so the
  audit trail survives account deletion.

## Integrity & concurrency constraints

| Constraint | Table | Protects against |
|------------|-------|------------------|
| `UNIQUE(email)`, `UNIQUE(username)` | users | Duplicate accounts |
| `CHECK (capacity > 0)`, `CHECK (seats_taken <= capacity)` | events | Overselling / bad data |
| `UNIQUE(event_id, user_id)` | bookings | Duplicate bookings |
| `SELECT … FOR UPDATE` (app layer) | events row during booking | Race condition / double-spend of last seat |
| FKs `ON DELETE CASCADE` | child tables | Orphaned rows after account deletion |

## Indexes

Indexes exist on all foreign keys and on high-selectivity query columns:
`events(starts_at)`, `refresh_tokens(token_hash)`, `refresh_tokens(family_id)`,
`audit_logs(action)`, `audit_logs(actor_id)`, `audit_logs(created_at)`.
