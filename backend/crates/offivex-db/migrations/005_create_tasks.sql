CREATE TABLE IF NOT EXISTS rpc_endpoints (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    url             TEXT NOT NULL,
    ws_url          TEXT,
    weight          INTEGER NOT NULL DEFAULT 1,
    is_active       INTEGER NOT NULL DEFAULT 1,
    last_latency_ms INTEGER,
    created_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
    id          TEXT PRIMARY KEY,
    task_type   TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'running',
    progress    REAL NOT NULL DEFAULT 0.0,
    result_json TEXT,
    error       TEXT,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(task_type);
