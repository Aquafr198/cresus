-- Migration 029 — Task templates (Mint Task, Bundle Task, Pump-Fun Task)
--
-- Adds `config_blob` to the existing `tasks` table so we can store the
-- full launch configuration the user prepared, then re-execute it later
-- with a single click. Closes the Kinesis "Mint Task / Pump Task
-- préparables" gap.
--
-- The blob is a serde-serialized JSON string of the launch payload (form
-- state, snipe wallet list, slippage, etc.) — schema varies per `task_type`,
-- documented in code at `offivex_api::tasks` request types.
--
-- Idempotent via the IF NOT EXISTS pragma (SQLite 3.35+).

ALTER TABLE tasks ADD COLUMN config_blob TEXT;
