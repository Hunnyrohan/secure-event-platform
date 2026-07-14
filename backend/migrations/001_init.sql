-- ==========================================================================
-- Secure Event Management Platform - initial schema
-- PostgreSQL 15+
-- Design notes:
--   * UUID surrogate keys everywhere -> IDOR-resistant (non-enumerable).
--   * Ownership columns (organizer_id / user_id) drive row-level authz.
--   * OTP secrets & recovery codes stored as AES-256-GCM ciphertext.
--   * Passwords stored only as bcrypt hashes; last N hashes kept to block reuse.
-- ==========================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";      -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";         -- case-insensitive email

-- ---- Enumerated types ----------------------------------------------------
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'organizer', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE account_status AS ENUM ('active', 'suspended', 'pending_verification');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE booking_status AS ENUM ('confirmed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---- Users ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email               CITEXT UNIQUE NOT NULL,
  password_hash       TEXT NOT NULL,
  full_name           VARCHAR(120) NOT NULL,
  role                user_role NOT NULL DEFAULT 'user',
  status              account_status NOT NULL DEFAULT 'pending_verification',
  email_verified      BOOLEAN NOT NULL DEFAULT FALSE,
  avatar_path         TEXT,

  -- MFA
  mfa_enabled         BOOLEAN NOT NULL DEFAULT FALSE,

  -- Account-protection counters
  failed_login_count  INTEGER NOT NULL DEFAULT 0,
  locked_until        TIMESTAMPTZ,
  last_login_at       TIMESTAMPTZ,
  last_login_ip       INET,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Previous bcrypt hashes to enforce password-history / reuse prevention.
CREATE TABLE IF NOT EXISTS password_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_password_history_user ON password_history(user_id);

-- Email verification + password-reset one-time tokens (store only a hash).
CREATE TABLE IF NOT EXISTS user_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     VARCHAR(30) NOT NULL,               -- 'email_verify' | 'password_reset'
  token_hash  TEXT NOT NULL,                       -- sha-256 of the raw token
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_tokens_lookup ON user_tokens(user_id, purpose);

-- Email OTP codes for MFA (ciphertext, never plaintext).
CREATE TABLE IF NOT EXISTS mfa_otps (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  otp_cipher    TEXT NOT NULL,                     -- AES-256-GCM of the 6-digit code
  attempts      INTEGER NOT NULL DEFAULT 0,
  expires_at    TIMESTAMPTZ NOT NULL,
  consumed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mfa_otps_user ON mfa_otps(user_id);

-- Encrypted recovery codes (backup MFA).
CREATE TABLE IF NOT EXISTS recovery_codes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_cipher  TEXT NOT NULL,                      -- AES-256-GCM
  used_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Refresh-token store enabling rotation + revocation (store only a hash).
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL,                      -- sha-256 of the JWT
  family_id    UUID NOT NULL,                      -- rotation lineage; reuse => revoke family
  user_agent   TEXT,
  ip_address   INET,
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens(family_id);

-- ---- Events --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         VARCHAR(160) NOT NULL,
  description   TEXT NOT NULL,
  location      VARCHAR(200) NOT NULL,
  category      VARCHAR(60) NOT NULL,
  starts_at     TIMESTAMPTZ NOT NULL,
  capacity      INTEGER NOT NULL CHECK (capacity > 0),
  seats_taken   INTEGER NOT NULL DEFAULT 0 CHECK (seats_taken >= 0),
  ticket_price  NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (ticket_price >= 0),
  is_published  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT seats_within_capacity CHECK (seats_taken <= capacity)
);
CREATE INDEX IF NOT EXISTS idx_events_organizer ON events(organizer_id);
CREATE INDEX IF NOT EXISTS idx_events_starts_at ON events(starts_at);

-- ---- Bookings ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bookings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       booking_status NOT NULL DEFAULT 'confirmed',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at TIMESTAMPTZ,
  -- One active booking per user per event => blocks duplicate bookings.
  CONSTRAINT uniq_active_booking UNIQUE (event_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_event ON bookings(event_id);

-- ---- Notifications -------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       VARCHAR(160) NOT NULL,
  body        TEXT NOT NULL,
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);

-- ---- Audit log -----------------------------------------------------------
-- Append-only. No plaintext secrets/passwords ever written here.
CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  action      VARCHAR(60) NOT NULL,         -- e.g. LOGIN_SUCCESS, ROLE_CHANGE
  target_type VARCHAR(40),                  -- e.g. 'event','user','booking'
  target_id   UUID,
  outcome     VARCHAR(20) NOT NULL,         -- 'success' | 'failure' | 'alert'
  ip_address  INET,
  user_agent  TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

-- ---- updated_at trigger --------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated ON users;
CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_events_updated ON events;
CREATE TRIGGER trg_events_updated BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
