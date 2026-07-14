-- ==========================================================================
-- Migration 003 - user profile bio
-- Additive & idempotent. `bio` is free-text user-generated content and is a
-- classic stored-XSS sink, so every write path runs it through sanitize-html
-- (utils/sanitize.js) before persistence.
-- ==========================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
