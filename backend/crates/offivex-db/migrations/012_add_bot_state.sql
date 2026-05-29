-- Add runtime state persistence for trading bots and wallet warmer
-- This allows bots to resume from where they left off after server restarts
--
-- NOTE: The ALTER TABLE statements are executed conditionally in Rust
-- (see run_migrations in lib.rs) because SQLite does not support
-- ALTER TABLE … ADD COLUMN IF NOT EXISTS.

-- Update indexes to improve state loading performance
CREATE INDEX IF NOT EXISTS idx_volume_tasks_status_updated
    ON volume_tasks(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_bumper_tasks_status_updated
    ON bumper_tasks(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_warmer_tasks_status_updated
    ON warmer_tasks(status, updated_at DESC);
