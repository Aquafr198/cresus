import type {
  Wallet,
  WalletGroup,
  Token,
  Bundle,
  RpcEndpoint,
  MemeAsset,
  MemeMetadataTemplate,
  Distribution,
  DistributionTransfer,
  WalletProfile,
  VanityTask,
  LaunchDashboardData,
} from "./types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:3001/api/v1";

/// localStorage slot for the user API key. Promoted to the top of the file
/// (was buried in the "Phase 6 minimal" section) because EVERY data-plane
/// fetch needs it — the backend's `require_api_key` middleware rejects any
/// `/api/v1/*` call without `Authorization: Bearer ofx_live_...`.
export const USER_API_KEY_STORAGE = "offivex_api_key";

function getUserApiKey(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(USER_API_KEY_STORAGE);
}

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const apiKey = getUserApiKey();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options?.headers) Object.assign(headers, options.headers as Record<string, string>);
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new ApiError(res.status, body.error || `HTTP ${res.status}`);
  }

  return res.json();
}

async function uploadFile<T>(path: string, file: File): Promise<T> {
  const apiKey = getUserApiKey();
  const form = new FormData();
  form.append("file", file);
  const headers: Record<string, string> = {};
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    body: form,
    headers,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new ApiError(res.status, body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export interface AuthStatus {
  success: boolean;
  data: {
    password_set: boolean;
    unlocked: boolean;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export interface DashboardStats {
  wallets: number;
  tokens: number;
  bundles: number;
  bundles_confirmed: number;
  distributions: number;
  profiles: number;
  rpc_endpoints_active: number;
  meme_assets: number;
}

export interface ReferralReferee {
  id: string;
  telegram: string;
  plan: "Monthly" | "Yearly";
  status: "active" | "expired" | "pending";
  earnedPerCycle: number;
  joinedAt: string;
}

export interface ReferralStats {
  code: string;
  activeReferees: number;
  earningsThisMonth: number;
  earningsTotal: number;
  pendingCredit: number;
  nextBillCalc: {
    dueAmount: number;
    appliedCredit: number;
    netAmount: number;
    carryForward: number;
  };
  referees: ReferralReferee[];
}

// Mock for Sprint 1 — replaced by real GET /api/v1/referral/stats in Sprint 2.
const MOCK_REFERRAL: ReferralStats = {
  code: "OFX-A3B7C9",
  activeReferees: 5,
  earningsThisMonth: 850,
  earningsTotal: 4200,
  pendingCredit: 1250,
  nextBillCalc: { dueAmount: 1000, appliedCredit: 1000, netAmount: 0, carryForward: 250 },
  referees: [
    { id: "1", telegram: "@memecaster_sol", plan: "Yearly",  status: "active", earnedPerCycle: 700, joinedAt: "2026-04-12" },
    { id: "2", telegram: "@0xLaunchPad",    plan: "Monthly", status: "active", earnedPerCycle: 100, joinedAt: "2026-04-22" },
    { id: "3", telegram: "@solana_chad",    plan: "Monthly", status: "active", earnedPerCycle: 100, joinedAt: "2026-05-03" },
    { id: "4", telegram: "@nft_alpha",      plan: "Yearly",  status: "active", earnedPerCycle: 700, joinedAt: "2026-05-10" },
    { id: "5", telegram: "@pump_dev",       plan: "Monthly", status: "active", earnedPerCycle: 100, joinedAt: "2026-05-18" },
  ],
};

// ─── Stats history (Bloc B — Kinesis dashboard) ──────────────────────────

export interface StatsReport {
  current: number;
  previous: number;
  delta_pct: number;
  sparkline: number[];
}

export interface MintHistoryPoint {
  day: string;
  count: number;
}

export interface EarningsReport {
  last_30d_cents: number;
  today_cents: number;
  sparkline: number[];
}

export interface StatsHistoryView {
  period_days: number;
  coin_report: StatsReport;
  volume_report: StatsReport;
  earnings: EarningsReport;
  mint_history: MintHistoryPoint[];
}

export const api = {
  health: () => request<{ status: string; cluster?: string; version?: string }>("/health"),
  stats: () => request<ApiResponse<DashboardStats>>("/stats"),
  statsHistory: (period: number = 30) =>
    request<ApiResponse<StatsHistoryView>>(`/stats/history?period=${period}`),

  auth: {
    status: () => request<AuthStatus>("/auth/status"),
    setup: (password: string) =>
      request<{ success: boolean; data: { mnemonic: string } }>("/auth/setup", {
        method: "POST",
        body: JSON.stringify({ password }),
      }),
    unlock: (password: string) =>
      request<{ success: boolean }>("/auth/unlock", {
        method: "POST",
        body: JSON.stringify({ password }),
      }),
    lock: () =>
      request<{ success: boolean }>("/auth/lock", { method: "POST" }),
    seedPhrase: () =>
      request<ApiResponse<{ mnemonic: string }>>("/auth/seed-phrase"),
  },

  wallets: {
    list: () =>
      request<ApiResponse<Wallet[]>>("/wallets"),
    create: (name?: string, group_id?: string) =>
      request<ApiResponse<Wallet>>("/wallets", {
        method: "POST",
        body: JSON.stringify({ name, group_id }),
      }),
    get: (id: string) =>
      request<ApiResponse<Wallet>>(`/wallets/${id}`),
    delete: (id: string) =>
      request<ApiResponse<boolean>>(`/wallets/${id}`, { method: "DELETE" }),
    createSubwallets: (id: string, count: number) =>
      request<ApiResponse<Wallet[]>>(
        `/wallets/${id}/subwallets`,
        {
          method: "POST",
          body: JSON.stringify({ count }),
        }
      ),
    export: (id: string, exportPassword: string) =>
      request<{ success: boolean; data: { encrypted_key: { version: number; salt: string; nonce: string; ciphertext: string } } }>(
        `/wallets/${id}/export`,
        {
          method: "POST",
          body: JSON.stringify({ export_password: exportPassword }),
        }
      ),
    balance: (id: string) =>
      request<{ success: boolean; data: { lamports: number; sol: number; tokens: Array<{ mint: string; amount: number; account: string }> } }>(
        `/wallets/${id}/balance`
      ),
    send: (id: string, to_address: string, amount: number, mint_address?: string) =>
      request<{ success: boolean; data: { signature: string } }>(
        `/wallets/${id}/send`,
        {
          method: "POST",
          body: JSON.stringify({ to_address, amount, mint_address }),
        }
      ),
  },

  walletGroups: {
    list: () =>
      request<{ success: boolean; data: WalletGroup[] }>(
        "/wallet-groups"
      ),
    create: (name: string) =>
      request<{
        success: boolean;
        data: WalletGroup;
      }>("/wallet-groups", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
  },

  rpc: {
    list: () =>
      request<ApiResponse<RpcEndpoint[]>>("/rpc"),
    add: (name: string, url: string, ws_url?: string, weight?: number) =>
      request<ApiResponse<RpcEndpoint>>("/rpc", {
        method: "POST",
        body: JSON.stringify({ name, url, ws_url, weight }),
      }),
    delete: (id: string) =>
      request<ApiResponse<boolean>>(`/rpc/${id}`, { method: "DELETE" }),
    setActive: (id: string, active: boolean) =>
      request<{ success: boolean }>(`/rpc/${id}/active`, {
        method: "PUT",
        body: JSON.stringify({ active }),
      }),
    healthCheck: () =>
      request<ApiResponse<Array<{ id: string; name: string; healthy: boolean; latency_ms: number | null }>>>("/rpc/health", {
        method: "POST",
      }),
  },

  tokens: {
    list: () =>
      request<ApiResponse<Token[]>>("/tokens"),
    mint: (params: {
      name: string;
      symbol: string;
      decimals?: number;
      supply: number;
      /// Use this OR the inline social fields below, never both.
      metadata_uri?: string;
      creator_wallet_id: string;
      // ── Inline metadata (auto-pinned to IPFS) ──
      description?: string;
      image_uri?: string;
      twitter?: string;
      telegram?: string;
      website?: string;
      /// Opt-in: keep the freeze authority on the creator wallet. Default
      /// `false` — RugCheck/DEXTools flag unrevoked freeze authority as a
      /// critical anti-rug signal.
      keep_freeze_authority?: boolean;
      /// Default `true`: append a `SetAuthority(None)` instruction at the
      /// end of the mint tx so the supply is locked atomically with the
      /// initial mint. Set `false` for a mutable supply (rare).
      revoke_mint_authority?: boolean;
    }) =>
      request<ApiResponse<Token & { tx_signature: string }>>("/tokens/mint", {
        method: "POST",
        body: JSON.stringify(params),
      }),
    /// Revoke the mint authority on an already-minted token. Used after
    /// the fact (vs `revoke_mint_authority: true` on `mint`, which does
    /// it atomically during initial mint). Requires the creator wallet's
    /// keypair to still be in the vault.
    revokeMintAuthority: (mint: string) =>
      request<ApiResponse<{ mint: string; signature: string }>>(
        `/tokens/${encodeURIComponent(mint)}/revoke-mint-authority`,
        { method: "POST" },
      ),
    cloneInfo: (mint_address: string) =>
      request<ApiResponse<{
        mint_address: string;
        name: string;
        symbol: string;
        decimals: number;
        supply: number;
        uri: string;
      }>>("/tokens/clone-info", {
        method: "POST",
        body: JSON.stringify({ mint_address }),
      }),
    vanityStart: (params: {
      prefix?: string;
      suffix?: string;
      case_insensitive?: boolean;
      threads?: number;
    }) =>
      request<ApiResponse<{ task_id: string; estimated_difficulty: number }>>("/tokens/vanity/start", {
        method: "POST",
        body: JSON.stringify(params),
      }),
    vanityStatus: (taskId: string) =>
      request<ApiResponse<VanityTask>>(`/tokens/vanity/${taskId}`),
  },

  memeLibrary: {
    listAssets: () =>
      request<ApiResponse<MemeAsset[]>>("/meme-library/assets"),
    uploadAsset: (file: File) =>
      uploadFile<ApiResponse<MemeAsset>>("/meme-library/assets", file),
    deleteAsset: (id: string) =>
      request<ApiResponse<boolean>>(`/meme-library/assets/${id}`, { method: "DELETE" }),
    pinAsset: (id: string) =>
      request<ApiResponse<{ id: string; ipfs_cid: string; pinned_uri: string }>>(`/meme-library/assets/${id}/pin`, {
        method: "POST",
      }),
    /// Returns a same-origin path (NOT the absolute BASE_URL) so the browser
    /// treats this as a first-party resource. `<img src>` doesn't send the
    /// Authorization header, so the asset endpoint is unauthenticated by
    /// design — but the absolute `http://127.0.0.1:3001/...` URL was also
    /// being blocked by our img-src CSP (`'self' data: blob: https:` —
    /// no `http:` allowance). Routing through Next.js's `/api/v1/*` rewrite
    /// fixes both at once: same-origin from the browser's POV, proxied to
    /// the Rust backend transparently.
    serveAssetUrl: (id: string) => `/api/v1/meme-library/assets/${id}/serve`,

    listMetadata: () =>
      request<ApiResponse<MemeMetadataTemplate[]>>("/meme-library/metadata"),
    createMetadata: (params: {
      name: string;
      symbol: string;
      description?: string;
      image_asset_id?: string;
      extra_json?: string;
    }) =>
      request<ApiResponse<MemeMetadataTemplate>>("/meme-library/metadata", {
        method: "POST",
        body: JSON.stringify(params),
      }),
    deleteMetadata: (id: string) =>
      request<ApiResponse<boolean>>(`/meme-library/metadata/${id}`, { method: "DELETE" }),
    generateJson: (id: string) =>
      request<ApiResponse<Record<string, unknown>>>(`/meme-library/metadata/${id}/json`),
    pinMetadataJson: (id: string) =>
      request<ApiResponse<{ cid: string; uri: string }>>(`/meme-library/metadata/${id}/pin`, {
        method: "POST",
      }),
  },

  bundles: {
    list: () =>
      request<ApiResponse<Bundle[]>>("/bundles"),
    get: (id: string) =>
      request<ApiResponse<Bundle & { config_json: string; tx_signatures: string | null }>>(`/bundles/${id}`),
    launch: (params: {
      token_mint: string;
      creator_wallet_id: string;
      sol_liquidity: number;
      token_liquidity: number;
      jito_tip_lamports: number;
      base_lot_size?: number;
      quote_lot_size?: number;
      snipe_buys: Array<{ wallet_id: string; sol_amount: number }>;
      creator_reserve_tokens?: number;
      /// `burn` (default, anti-rug — passes DEXTools/RugCheck "LP Locked"
      /// audit) or `keep` (legacy — creator keeps LP tokens, can later
      /// lock/migrate them off-platform).
      lp_disposition?: "burn" | "keep";
    }) =>
      request<ApiResponse<{
        bundle_id: string;
        market_address: string;
        pool_address: string;
        status: string;
      }>>("/bundles/launch", {
        method: "POST",
        body: JSON.stringify({ ...params, confirmed: true }),
      }),
    collectFees: (params: { pool_address: string; creator_wallet_id: string }) =>
      request<ApiResponse<{ signature: string }>>("/bundles/collect-fees", {
        method: "POST",
        body: JSON.stringify(params),
      }),
  },

  distributions: {
    list: () =>
      request<ApiResponse<Distribution[]>>("/distributions"),
    get: (id: string) =>
      request<ApiResponse<Distribution & { transfers: DistributionTransfer[]; config: Record<string, unknown> }>>(`/distributions/${id}`),
    plan: (params: {
      source_wallet_id: string;
      target_wallet_ids: string[];
      total_sol: number;
      strategy?: string;
      hops?: number;
      batch_size?: number;
      batch_delay_ms?: number;
      vary_amounts?: boolean;
      amount_deviation?: number;
      vary_timing?: boolean;
      min_delay_ms?: number;
      max_delay_ms?: number;
    }) =>
      request<ApiResponse<{
        distribution_id: string;
        strategy: string;
        total_lamports: number;
        num_transfers: number;
        transfers: Array<{
          from_wallet_id: string;
          to_wallet_id: string;
          amount_lamports: number;
          amount_sol: number;
          hop_index: number;
          delay_ms: number;
        }>;
      }>>("/distributions/plan", {
        method: "POST",
        body: JSON.stringify(params),
      }),
    /** Trigger execution. Optional `chain_buy` config orchestrates a
     *  coordinated Jupiter buy on every target wallet right after the SOL
     *  distribution lands — closing the Kinesis-style "fonds ET achats"
     *  flow in one server-side step. Results land in the distribution row's
     *  `result_json.chain_buy` block, polled via `.get(id)`.
     *
     *  `buy_pattern` controls the anti-bubble shape of the buys:
     *    - parallel   : all at once (fast, NOT anti-bubble)
     *    - staggered  : random delay between each (default, recommended)
     *    - batched    : Layered-style groups with inter-batch delay
     *
     *  `percent_variance` (0–50) adds ±N points of randomness on each
     *  wallet's % spend so the "buy size fingerprint" doesn't repeat. */
    execute: (
      id: string,
      chain_buy?: {
        mint: string;
        percent: number;
        slippage_bps: number;
        buy_pattern?:
          | { mode: "parallel" }
          | { mode: "staggered"; min_delay_ms: number; max_delay_ms: number }
          | { mode: "batched"; batch_size: number; batch_delay_ms: number };
        percent_variance?: number;
      },
    ) =>
      request<ApiResponse<{ distribution_id: string; status: string; chain_buy: boolean }>>(
        `/distributions/${id}/execute`,
        {
          method: "POST",
          body: JSON.stringify(chain_buy ? { chain_buy } : {}),
        },
      ),
    resume: (id: string, retryFailed = false) =>
      request<ApiResponse<{ distribution_id: string; status: string }>>(`/distributions/${id}/resume`, {
        method: "POST",
        body: JSON.stringify({ retry_failed: retryFailed }),
      }),
  },

  profiles: {
    list: () =>
      request<ApiResponse<WalletProfile[]>>("/profiles"),
    get: (walletId: string) =>
      request<ApiResponse<WalletProfile>>(`/profiles/${walletId}`),
    preview: () =>
      request<ApiResponse<{ display_name: string; avatar_url: string; bio: string; twitter: string | null; telegram: string | null; website: string | null }>>("/profiles/preview"),
    randomize: (walletId: string) =>
      request<ApiResponse<WalletProfile>>("/profiles/randomize", {
        method: "POST",
        body: JSON.stringify({ wallet_id: walletId }),
      }),
    randomizeBatch: (walletIds: string[]) =>
      request<ApiResponse<WalletProfile[]>>("/profiles/randomize-batch", {
        method: "POST",
        body: JSON.stringify({ wallet_ids: walletIds }),
      }),
    update: (walletId: string, data: {
      display_name?: string;
      avatar_url?: string;
      bio?: string;
      twitter?: string;
      telegram?: string;
      website?: string;
    }) =>
      request<ApiResponse<WalletProfile>>(`/profiles/${walletId}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    delete: (walletId: string) =>
      request<ApiResponse<boolean>>(`/profiles/${walletId}`, { method: "DELETE" }),
  },

  trading: {
    swap: (data: {
      wallet_id: string;
      token_mint: string;
      direction: "buy" | "sell";
      amount: number;
      slippage_bps: number;
    }) =>
      request<ApiResponse<{ signature: string }>>("/trading/swap", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    quickSell: (data: {
      mint: string;
      percent: number; // 1–100
      slippage_bps: number;
      /** Optional whitelist of wallet IDs to sell from. Omit for "all
       *  holders" (the legacy F4/F5 keybind behaviour). */
      wallet_ids?: string[];
    }) =>
      request<
        ApiResponse<{
          mint: string;
          percent: number;
          total_wallets: number;
          successful: number;
          failed: number;
          elapsed_ms: number;
          results: Array<{
            wallet_id: string;
            public_key: string;
            token_amount: number;
            signature: string | null;
            error: string | null;
          }>;
        }>
      >("/trading/quick-sell", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    volume: {
      list: () =>
        request<ApiResponse<Array<{ id: string; token_mint: string; wallet_ids: string[]; status: "stopped" | "running" | "paused"; created_at: number; min_sol: number; max_sol: number; sell_percent: number; min_delay_sec: number; max_delay_sec: number; trades_count: number; total_volume_sol: number }>>>("/trading/volume"),
      create: (data: {
        token_mint: string;
        wallet_ids: string[];
        min_sol: number;
        max_sol: number;
        sell_percent: number;
        min_delay_sec: number;
        max_delay_sec: number;
      }) =>
        request<ApiResponse<{ id: string; status: string }>>("/trading/volume", {
          method: "POST",
          body: JSON.stringify(data),
        }),
      start: (id: string) =>
        request<ApiResponse<{ status: string }>>(`/trading/volume/${id}/start`, {
          method: "POST",
        }),
      stop: (id: string) =>
        request<ApiResponse<{ status: string }>>(`/trading/volume/${id}/stop`, {
          method: "POST",
        }),
      stats: (id: string) =>
        request<ApiResponse<{ task: { id: string; token_mint: string; wallet_ids: string[]; status: "stopped" | "running" | "paused"; created_at: number; min_sol: number; max_sol: number; sell_percent: number; min_delay_sec: number; max_delay_sec: number; trades_count: number; total_volume_sol: number }; recent_trades: Array<{ wallet_id: string; direction: string; sol_amount: number; token_amount: number; tx_signature: string | null; executed_at: number }> }>>(`/trading/volume/${id}/stats`),
    },

    bumper: {
      list: () =>
        request<ApiResponse<Array<{ id: string; token_mint: string; wallet_ids: string[]; status: "stopped" | "running" | "paused"; created_at: number; price_threshold: number; buy_amount: number; max_buys_hour: number; buys_count: number; total_spent_sol: number }>>>("/trading/bumper"),
      create: (data: {
        token_mint: string;
        wallet_ids: string[];
        price_threshold: number;
        buy_amount: number;
        max_buys_hour: number;
      }) =>
        request<ApiResponse<{ id: string; status: string }>>("/trading/bumper", {
          method: "POST",
          body: JSON.stringify(data),
        }),
      start: (id: string) =>
        request<ApiResponse<{ status: string }>>(`/trading/bumper/${id}/start`, {
          method: "POST",
        }),
      stop: (id: string) =>
        request<ApiResponse<{ status: string }>>(`/trading/bumper/${id}/stop`, {
          method: "POST",
        }),
    },

    warmer: {
      list: () =>
        request<ApiResponse<Array<{ id: string; wallet_ids: string[]; status: "pending" | "running" | "completed" | "stopped"; created_at: number; actions_count: number; actions_completed: number; min_delay_hours: number; max_delay_hours: number }>>>("/trading/warmer"),
      create: (data: {
        wallet_ids: string[];
        actions_count: number;
        min_delay_hours: number;
        max_delay_hours: number;
      }) =>
        request<ApiResponse<{ id: string; status: string }>>("/trading/warmer", {
          method: "POST",
          body: JSON.stringify(data),
        }),
      start: (id: string) =>
        request<ApiResponse<{ status: string }>>(`/trading/warmer/${id}/start`, {
          method: "POST",
        }),
      stop: (id: string) =>
        request<ApiResponse<{ status: string }>>(`/trading/warmer/${id}/stop`, {
          method: "POST",
        }),
    },

    pumpFun: {
      list: () =>
        request<ApiResponse<Array<{
          id: string;
          token_name: string;
          token_symbol: string;
          token_description: string;
          image_url: string;
          token_mint: string | null;
          creator_wallet_id: string;
          initial_buy_sol: number;
          status: string;
          tx_signature: string | null;
          bonding_curve: string | null;
          metadata_uri: string | null;
          created_at: number;
          updated_at: number;
        }>>>("/trading/pump-fun"),
      create: (data: {
        token_name: string;
        token_symbol: string;
        token_description?: string;
        image_url?: string;
        creator_wallet_id: string;
        initial_buy_sol?: number;
        slippage_bps?: number;
        twitter?: string;
        telegram?: string;
        website?: string;
      }) =>
        request<ApiResponse<{ id: string; status: string }>>("/trading/pump-fun", {
          method: "POST",
          body: JSON.stringify(data),
        }),
      launch: (id: string) =>
        request<ApiResponse<{
          launch_id: string;
          token_mint: string;
          bonding_curve: string;
          tx_signature: string;
          metadata_uri: string;
          status: string;
        }>>(`/trading/pump-fun/${id}/launch`, {
          method: "POST",
          body: JSON.stringify({ confirmed: true }),
        }),
      buy: (data: {
        wallet_id: string;
        token_mint: string;
        amount_sol: number;
        slippage_bps?: number;
      }) =>
        request<ApiResponse<{ signature: string }>>("/trading/pump-fun/buy", {
          method: "POST",
          body: JSON.stringify(data),
        }),
      sell: (data: {
        wallet_id: string;
        token_mint: string;
        amount_tokens: number;
        slippage_bps?: number;
      }) =>
        request<ApiResponse<{ signature: string }>>("/trading/pump-fun/sell", {
          method: "POST",
          body: JSON.stringify(data),
        }),
    },
  },

  monitor: {
    subscribe: (mintAddress: string) =>
      request<ApiResponse<{ mint_address: string; status: string }>>("/monitor/subscribe", {
        method: "POST",
        body: JSON.stringify({ mint_address: mintAddress }),
      }),
    unsubscribe: (mintAddress: string) =>
      request<ApiResponse<{ mint_address: string; status: string }>>("/monitor/unsubscribe", {
        method: "POST",
        body: JSON.stringify({ mint_address: mintAddress }),
      }),
    subscriptions: () =>
      request<ApiResponse<string[]>>("/monitor/subscriptions"),
  },

  launches: {
    /** Bundled "Viewing mint" payload — token details, per-wallet holders,
     *  tasks filtered by mint, bonding curve (if PF), recent activity. One
     *  HTTP round-trip; server-side parallel fan-out. */
    dashboard: (mint: string) =>
      request<ApiResponse<LaunchDashboardData>>(
        `/launches/${encodeURIComponent(mint)}/dashboard`,
      ),
  },

  /** Launch task templates — Kinesis-style "save now, execute later" for
   *  Mint Task / Bundle Task / Pump-Fun Task. The `config_blob` is opaque
   *  JSON owned by the caller (the launch page that saved it). The
   *  /execute endpoint just returns the blob — the calling page is
   *  responsible for re-injecting it into the canonical launch endpoint. */
  tasks: {
    list: () =>
      request<
        ApiResponse<
          Array<{
            id: string;
            task_type: string;
            status: string;
            config_blob: Record<string, unknown>;
            created_at: number;
            updated_at: number;
          }>
        >
      >("/tasks"),
    create: (data: {
      task_type: "mint_template" | "bundle_template" | "pump_fun_template";
      config_blob: Record<string, unknown>;
      label?: string;
    }) =>
      request<
        ApiResponse<{
          id: string;
          task_type: string;
          status: string;
          config_blob: Record<string, unknown>;
          created_at: number;
          updated_at: number;
        }>
      >("/tasks", { method: "POST", body: JSON.stringify(data) }),
    get: (id: string) =>
      request<
        ApiResponse<{
          id: string;
          task_type: string;
          status: string;
          config_blob: Record<string, unknown>;
          created_at: number;
          updated_at: number;
        }>
      >(`/tasks/${encodeURIComponent(id)}`),
    execute: (id: string) =>
      request<
        ApiResponse<{
          task_id: string;
          task_type: string;
          config_blob: Record<string, unknown>;
        }>
      >(`/tasks/${encodeURIComponent(id)}/execute`, { method: "POST" }),
    delete: (id: string) =>
      request<ApiResponse<{ deleted: boolean }>>(
        `/tasks/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      ),
  },

  audit: {
    list: (limit = 50, offset = 0) =>
      request<ApiResponse<Array<{
        id: number;
        action: string;
        detail: string;
        wallet_id: string | null;
        tx_signature: string | null;
        created_at: number;
      }>>>(`/audit?limit=${limit}&offset=${offset}`),
  },

  // Referral program — mock for Sprint 1.
  // Sprint 2 will swap this implementation for a real `request<ApiResponse<ReferralStats>>("/referral/stats")` call.
  referral: {
    stats: async (): Promise<ApiResponse<ReferralStats>> => {
      // Simulate a network round-trip so the loading UX is testable.
      await new Promise((r) => setTimeout(r, 150));
      return { success: true, data: MOCK_REFERRAL };
    },
  },

  // Admin panel (Phase 4 user-management)
  admin: adminApi(),
};

// ─── Admin API namespace ────────────────────────────────────────────────
// Auth via Bearer token in `localStorage.offivex_admin_token`.
// `login()` is unauthenticated; everything else requires the token.

export const ADMIN_TOKEN_KEY = "offivex_admin_token";

function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ADMIN_TOKEN_KEY);
}

async function adminRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getAdminToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options?.headers) Object.assign(headers, options.headers as Record<string, string>);
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new ApiError(res.status, body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export interface AdminApplyView {
  id: string;
  telegram: string;
  email: string;
  project: string;
  plan_pref: string | null;
  status: "pending" | "approved" | "rejected";
  submitted_at: number;
  decided_at: number | null;
  decided_by_admin_id: string | null;
  user_id_after_approval: string | null;
  ip: string | null;
  notes: string | null;
}

export interface AdminDashboardStats {
  pending_applies: number;
  active_users: number;
}

export interface AdminLoginResult {
  token: string;
  expires_at: number;
  admin: { id: string; username: string };
}

function adminApi() {
  return {
    login: (username: string, password: string) =>
      adminRequest<ApiResponse<AdminLoginResult>>("/admin/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      }),

    logout: () =>
      adminRequest<{ success: boolean }>("/admin/logout", { method: "POST" }),

    me: () =>
      adminRequest<ApiResponse<{ id: string; username: string }>>("/admin/me"),

    stats: () => adminRequest<ApiResponse<AdminDashboardStats>>("/admin/stats"),

    listApplies: (status: "pending" | "approved" | "rejected" | "all" = "pending") =>
      adminRequest<ApiResponse<AdminApplyView[]>>(
        `/admin/applies?status=${encodeURIComponent(status)}`
      ),

    approveApply: (id: string) =>
      adminRequest<ApiResponse<{ apply_id: string; user_id: string; user_already_existed: boolean }>>(
        `/admin/applies/${encodeURIComponent(id)}/approve`,
        { method: "POST" }
      ),

    rejectApply: (id: string, notes: string) =>
      adminRequest<ApiResponse<{ apply_id: string }>>(
        `/admin/applies/${encodeURIComponent(id)}/reject`,
        {
          method: "POST",
          body: JSON.stringify({ notes }),
        }
      ),

    // Phase 5.5+5.8 — admin creates an invoice for a user (after apply approval)
    createInvoice: (userId: string, planSlug: string) =>
      adminRequest<ApiResponse<InvoiceCreatedView>>(
        `/admin/users/${encodeURIComponent(userId)}/invoices`,
        {
          method: "POST",
          body: JSON.stringify({ plan_slug: planSlug }),
        }
      ),

    // Phase 5.8 — admin payments list (with optional status filter)
    listPayments: (status?: PaymentStatusFilter) =>
      adminRequest<ApiResponse<AdminPaymentView[]>>(
        `/admin/payments${status && status !== "all" ? `?status=${encodeURIComponent(status)}` : ""}`
      ),

    // ─── Section 16 — admin user management A→Z ──────────────────────────
    listUsers: (q?: string, status?: "all" | "active" | "suspended") => {
      const params = new URLSearchParams();
      if (q && q.trim()) params.set("q", q.trim());
      if (status && status !== "all") params.set("status", status);
      const qs = params.toString();
      return adminRequest<ApiResponse<AdminUserListView[]>>(
        `/admin/users${qs ? `?${qs}` : ""}`
      );
    },

    getUserDetail: (userId: string) =>
      adminRequest<ApiResponse<AdminUserDetailView>>(
        `/admin/users/${encodeURIComponent(userId)}`
      ),

    updateUser: (
      userId: string,
      body: { status?: "active" | "suspended"; notes?: string }
    ) =>
      adminRequest<ApiResponse<AdminUserDetailView>>(
        `/admin/users/${encodeURIComponent(userId)}`,
        { method: "PATCH", body: JSON.stringify(body) }
      ),

    grantAccess: (userId: string, planSlug: "monthly" | "yearly") =>
      adminRequest<ApiResponse<GrantAccessResult>>(
        `/admin/users/${encodeURIComponent(userId)}/grant`,
        { method: "POST", body: JSON.stringify({ plan_slug: planSlug }) }
      ),

    rotateKey: (userId: string) =>
      adminRequest<ApiResponse<RotateKeyResult>>(
        `/admin/users/${encodeURIComponent(userId)}/rotate-key`,
        { method: "POST" }
      ),

    revokeKey: (userId: string) =>
      adminRequest<ApiResponse<{ revoked: number }>>(
        `/admin/users/${encodeURIComponent(userId)}/revoke-key`,
        { method: "POST" }
      ),
    /// Rotate the wallet vault master password. Backend re-encrypts the
    /// seed phrase + every wallet secret in a single transaction. Requires
    /// the vault to be currently unlocked.
    changeMasterPassword: (currentPassword: string, newPassword: string) =>
      adminRequest<{ success: boolean }>(
        "/admin/master-password/change",
        {
          method: "POST",
          body: JSON.stringify({
            current_password: currentPassword,
            new_password: newPassword,
          }),
        }
      ),
  };
}

// ─── Section 16 — admin user management types ───────────────────────────

export interface SubSummary {
  plan_slug: string;
  plan_name: string;
  status: string;
  expires_at: number | null;
}

export interface AdminUserListView {
  id: string;
  email: string;
  telegram: string | null;
  status: string;
  created_at: number;
  active_subscription: SubSummary | null;
  active_api_key_prefix: string | null;
}

export interface AdminUserSubView {
  id: string;
  plan_slug: string;
  plan_name: string;
  status: string;
  started_at: number | null;
  expires_at: number | null;
  current_payment_id: string | null;
  created_at: number;
}

export interface AdminUserApiKeyView {
  id: string;
  key_prefix: string;
  status: string;
  created_at: number;
  last_used_at: number | null;
  revoked_at: number | null;
  revoked_by_admin_id: string | null;
}

export interface AdminUserDetailView {
  user: {
    id: string;
    email: string;
    telegram: string | null;
    status: string;
    created_at: number;
    created_from_apply_id: string | null;
    notes: string | null;
  };
  apply_origin: AdminApplyView | null;
  subscriptions: AdminUserSubView[];
  payments: AdminPaymentView[];
  api_keys: AdminUserApiKeyView[];
  audit_log: Array<{
    id: number;
    action: string;
    detail: string;
    wallet_id: string | null;
    tx_signature: string | null;
    created_at: number;
    admin_id: string | null;
    user_id: string | null;
    ip: string | null;
  }>;
}

export interface GrantAccessResult {
  /// Plaintext key returned ONLY if a new key was generated. Null if user
  /// already had an active key (we extend the sub but preserve the existing key).
  api_key_plaintext: string | null;
  key_prefix: string;
  subscription: SubSummary;
  new_key_revealed: boolean;
}

export interface RotateKeyResult {
  api_key_plaintext: string;
  key_prefix: string;
}

// ─── Phase 5.7 — public invoice + status (no auth, invoice_id IS the auth) ─

export interface InvoicePublicView {
  invoice_id: string;
  status: "pending" | "confirming" | "confirmed" | "expired" | "underpaid" | "failed";
  address: string | null;
  amount_lamports: number | null;
  amount_sol_str: string | null;
  amount_usd_cents: number;
  sol_usd_rate_cents: number | null;
  expires_at: number | null;
  plan_slug: string;
  plan_name: string;
}

export interface InvoiceStatusView {
  status: InvoicePublicView["status"];
  confirmed_at: number | null;
  tx_hash: string | null;
  /// Plaintext API key revealed ONCE at first read post-confirm. NULL on
  /// subsequent calls (consumed atomically server-side).
  api_key: string | null;
}

export interface InvoiceCreatedView {
  invoice_id: string;
  address: string;
  amount_lamports: number;
  amount_sol_str: string;
  amount_usd_cents: number;
  sol_usd_rate_cents: number;
  expires_at: number;
  plan_slug: string;
  plan_name: string;
}

async function publicRequest<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new ApiError(res.status, body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── User API surface types ───────────────────────────────────────────────
// (USER_API_KEY_STORAGE + getUserApiKey moved to the top — used by every
// data-plane call, not just /user/me. `userRequest` kept as an alias to
// `request` for backward-compat with existing call sites.)

export interface UserMeSubscription {
  plan_slug: string;
  plan_name: string;
  status: string;
  started_at: number | null;
  expires_at: number | null;
}

export interface UserMeView {
  id: string;
  email: string;
  telegram: string | null;
  status: string;
  api_key_prefix: string;
  subscription: UserMeSubscription | null;
}

/// Legacy alias kept for `userApi.me()` call sites. Now identical to
/// `request` since the auth logic was merged into the main helper.
async function userRequest<T>(path: string, options?: RequestInit): Promise<T> {
  return request<T>(path, options);
}

// ─── Admin payments type used by the namespace declaration above ──────────

export type PaymentStatusFilter =
  | "all"
  | "pending"
  | "confirming"
  | "confirmed"
  | "underpaid"
  | "expired"
  | "failed";

export interface AdminPaymentView {
  id: string;
  user_id: string;
  plan_id: string;
  provider: string;
  amount_usd_cents: number;
  amount_lamports: number | null;
  amount_lamports_received: number | null;
  amount_sol_str: string | null;
  sol_usd_rate_cents: number | null;
  status: string;
  solana_address: string | null;
  tx_hash: string | null;
  created_at: number;
  confirmed_at: number | null;
  expires_at: number | null;
}

// ─── Attach the namespaces to `api` after the function declarations above ─

(api as unknown as {
  invoice: {
    get: (id: string) => Promise<ApiResponse<InvoicePublicView>>;
    status: (id: string) => Promise<ApiResponse<InvoiceStatusView>>;
  };
}).invoice = {
  get: (id: string) =>
    publicRequest<ApiResponse<InvoicePublicView>>(
      `/pay/${encodeURIComponent(id)}`
    ),
  status: (id: string) =>
    publicRequest<ApiResponse<InvoiceStatusView>>(
      `/pay/${encodeURIComponent(id)}/status`
    ),
};

(api as unknown as {
  user: {
    me: () => Promise<ApiResponse<UserMeView>>;
  };
}).user = {
  me: () => userRequest<ApiResponse<UserMeView>>("/user/me"),
};

// Augment the `api` typed object so consumers get autocomplete on the new namespaces.
// (TypeScript module-augment via interface declaration merging would require api to be
// declared with an interface; the runtime attach above does the job at type-erasure
// boundary. Frontend callers use `api.invoice.*` / `api.user.*` cast-free via this typing.)
declare module "./api" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface ApiNs {}
}

// Convenience typed accessors so callers can import these helpers explicitly
// instead of relying on the `api` object augmentation.
export const invoiceApi = {
  get: (id: string) =>
    publicRequest<ApiResponse<InvoicePublicView>>(
      `/pay/${encodeURIComponent(id)}`
    ),
  status: (id: string) =>
    publicRequest<ApiResponse<InvoiceStatusView>>(
      `/pay/${encodeURIComponent(id)}/status`
    ),
};

export const userApi = {
  me: () => userRequest<ApiResponse<UserMeView>>("/user/me"),
  billing: {
    payments: () =>
      userRequest<ApiResponse<UserPaymentView[]>>("/user/billing/payments"),
    subscription: () =>
      userRequest<ApiResponse<UserSubscriptionView | null>>(
        "/user/billing/subscription"
      ),
  },
  referral: {
    code: () =>
      userRequest<ApiResponse<UserReferralCodeView>>("/user/referral/code"),
    stats: () =>
      userRequest<ApiResponse<UserReferralStatsView>>("/user/referral/stats"),
    list: () =>
      userRequest<ApiResponse<UserReferralListItem[]>>("/user/referral/list"),
  },
};

// ─── Billing (Phase 6.5) ──────────────────────────────────────────────────

export interface UserPaymentView {
  id: string;
  plan_slug: string;
  plan_name: string;
  status: string;
  amount_usd_cents: number;
  amount_lamports: number | null;
  amount_sol_str: string | null;
  sol_usd_rate_cents: number | null;
  tx_hash: string | null;
  created_at: number;
  confirmed_at: number | null;
}

export interface UserSubscriptionView {
  status: string;
  plan_slug: string;
  plan_name: string;
  plan_price_usd_cents: number;
  plan_duration_days: number;
  started_at: number | null;
  expires_at: number | null;
  days_remaining: number;
  active: boolean;
}

// ─── Referral (Phase 6.5) ─────────────────────────────────────────────────

export interface UserReferralCodeView {
  code: string;
  share_url: string;
}

export interface UserReferralStatsView {
  total_referees: number;
  active_referees: number;
  total_earnings_cents: number;
}

export interface UserReferralListItem {
  referee_id_masked: string;
  plan_slug: string | null;
  subscription_status: string | null;
  joined_at: number;
  earnings_cents: number;
}

export { ApiError };
