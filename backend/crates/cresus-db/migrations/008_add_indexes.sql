-- Performance indexes for frequently queried columns

CREATE INDEX IF NOT EXISTS idx_meme_assets_created_at ON meme_assets(created_at);
CREATE INDEX IF NOT EXISTS idx_meme_metadata_created_at ON meme_metadata(created_at);
CREATE INDEX IF NOT EXISTS idx_rpc_endpoints_is_active ON rpc_endpoints(is_active);
CREATE INDEX IF NOT EXISTS idx_distributions_source_wallet_id ON distributions(source_wallet_id);
CREATE INDEX IF NOT EXISTS idx_distributions_status ON distributions(status);
CREATE INDEX IF NOT EXISTS idx_distribution_transfers_distribution_id ON distribution_transfers(distribution_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_wallets_group_id ON wallets(group_id);
CREATE INDEX IF NOT EXISTS idx_wallets_parent_id ON wallets(parent_id);
