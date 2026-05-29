export interface Wallet {
  id: string;
  name: string | null;
  public_key: string;
  group_id: string | null;
  parent_id: string | null;
  created_at: number;
}

export interface WalletGroup {
  id: string;
  name: string;
  created_at: number;
}

export interface Token {
  id: string;
  mint_address: string;
  name: string | null;
  symbol: string | null;
  decimals: number;
  supply: string;
  metadata_uri: string | null;
  created_at: number;
}

export interface Bundle {
  id: string;
  token_id: string | null;
  status: "configured" | "simulated" | "submitted" | "confirmed" | "failed";
  market_address: string | null;
  pool_address: string | null;
  error_message: string | null;
  created_at: number;
  executed_at: number | null;
}

export interface RpcEndpoint {
  id: string;
  name: string;
  url: string;
  ws_url: string | null;
  weight: number;
  is_active: boolean;
  last_latency_ms: number | null;
  created_at: number;
}

export interface MemeAsset {
  id: string;
  filename: string;
  mime_type: string;
  ipfs_cid: string | null;
  pinned_uri: string | null;
  created_at: number;
}

export interface MemeMetadataTemplate {
  id: string;
  name: string;
  symbol: string;
  description: string | null;
  image_asset_id: string | null;
  extra_json: string | null;
  created_at: number;
}

export interface Distribution {
  id: string;
  source_wallet_id: string;
  strategy: string;
  status: "planned" | "executing" | "completed" | "partial" | "failed";
  total_sol: number;
  total_lamports: number;
  error_message: string | null;
  result_json: { completed: number; failed: number; total: number } | null;
  created_at: number;
  executed_at: number | null;
}

export interface DistributionTransfer {
  id: string;
  from_wallet_id: string;
  to_wallet_id: string;
  amount_lamports: number;
  amount_sol: number;
  hop_index: number;
  delay_ms: number;
  status: string;
  tx_signature: string | null;
  error_message: string | null;
  executed_at: number | null;
}

export interface WalletProfile {
  id: string;
  wallet_id: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  twitter: string | null;
  telegram: string | null;
  website: string | null;
  created_at: number;
  updated_at: number;
}

export interface VanityTask {
  task_id: string;
  status: "running" | "completed" | "failed";
  progress: number;
  result: {
    public_key: string;
    secret_key_bs58: string;
    attempts: number;
  } | null;
  error: string | null;
  created_at: number;
  updated_at: number;
}

export interface MonitorEvent {
  signature: string;
  mint_address: string;
  event_type: string;
  direction: string | null;
  wallet: string;
  amount_token: string | null;
  amount_sol: string | null;
  timestamp: number;
  slot: number;
}

// ── Launch dashboard payload (mirrors backend `LaunchDashboardResponse`) ──
export interface LaunchTokenDetails {
  mint_address: string;
  name: string | null;
  symbol: string | null;
  decimals: number;
  supply: string;
  metadata_uri: string | null;
  creator_wallet_id: string | null;
  created_at: number;
}

export interface LaunchHolder {
  wallet_id: string;
  label: string;
  public_key: string;
  balance_raw: number;
  percent_of_supply: number;
}

export interface LaunchVolumeTask {
  id: string;
  wallet_ids: string[];
  status: string;
  min_sol: number;
  max_sol: number;
  sell_percent: number;
  trades_count: number;
  total_volume_sol: number;
}

export interface LaunchBumperTask {
  id: string;
  wallet_ids: string[];
  status: string;
  price_threshold: number;
  buy_amount: number;
  max_buys_hour: number;
  buys_count: number;
  total_spent_sol: number;
}

export interface LaunchBondingCurveState {
  fill_pct: number;
  sol_in_curve: number;
  tokens_remaining: number;
  graduated: boolean;
}

export interface LaunchDashboardData {
  mint: string;
  details: LaunchTokenDetails;
  holders: LaunchHolder[];
  tasks: {
    volume: LaunchVolumeTask[];
    bumper: LaunchBumperTask[];
  };
  curve: LaunchBondingCurveState | null;
  activity: MonitorEvent[];
  fetched_at_ms: number;
}
