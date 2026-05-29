-- Audit log enrichment columns (added via add_column_if_not_exists in lib.rs).
-- This file exists for documentation/discoverability; the actual ALTER TABLE
-- statements are emitted in run_migrations() to remain idempotent.
--
-- New columns on audit_log:
--   admin_id  TEXT  -- nullable; admin that triggered the action (if any)
--   user_id   TEXT  -- nullable; user the action applied to (if any)
--   ip        TEXT  -- nullable; IP captured at action time

CREATE INDEX IF NOT EXISTS idx_audit_log_admin ON audit_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user  ON audit_log(user_id);
