-- ==========================================================================
-- Migration 002 - Google Authenticator (TOTP) MFA + username
-- Additive & idempotent (safe to re-run):
--   * users.username           -> unique login/display handle
--   * users.mfa_secret_cipher  -> AES-256-GCM ciphertext of the TOTP base32
--                                 secret (never stored in plaintext).
-- The pre-existing recovery_codes table is reused for TOTP backup codes.
-- The legacy mfa_otps table is left in place but is no longer written to.
-- ==========================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS username CITEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret_cipher TEXT;

-- Case-insensitive uniqueness for usernames (NULLs allowed so the migration
-- never fails on legacy rows; the application layer enforces NOT NULL on
-- registration).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_users_username ON users (username);
