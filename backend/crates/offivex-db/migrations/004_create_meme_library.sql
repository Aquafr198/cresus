CREATE TABLE IF NOT EXISTS meme_assets (
    id         TEXT PRIMARY KEY,
    filename   TEXT NOT NULL,
    mime_type  TEXT NOT NULL,
    local_path TEXT NOT NULL,
    ipfs_cid   TEXT,
    arweave_id TEXT,
    pinned_uri TEXT,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS meme_metadata (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    symbol         TEXT NOT NULL,
    description    TEXT,
    image_asset_id TEXT REFERENCES meme_assets(id) ON DELETE SET NULL,
    extra_json     TEXT,
    created_at     INTEGER NOT NULL
);
