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
} from "./types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:3001/api/v1";

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new ApiError(res.status, body.error || `HTTP ${res.status}`);
  }

  return res.json();
}

async function uploadFile<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    body: form,
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

export const api = {
  health: () => request<{ status: string; cluster?: string; version?: string }>("/health"),
  stats: () => request<ApiResponse<DashboardStats>>("/stats"),

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
      metadata_uri?: string;
      creator_wallet_id: string;
    }) =>
      request<ApiResponse<Token & { tx_signature: string }>>("/tokens/mint", {
        method: "POST",
        body: JSON.stringify(params),
      }),
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
    serveAssetUrl: (id: string) => `${BASE_URL}/meme-library/assets/${id}/serve`,

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
    execute: (id: string) =>
      request<ApiResponse<{ distribution_id: string; status: string }>>(`/distributions/${id}/execute`, {
        method: "POST",
      }),
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
};

export { ApiError };
