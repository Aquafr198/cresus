"use client";

import { useMemo } from "react";
import { Coins, TrendingUp } from "lucide-react";
import { api, ApiError, userApi } from "@/lib/api";
import { useSWR } from "@/lib/swr";
import { GreetingCard } from "@/components/dashboard/GreetingCard";
import { ReportCard } from "@/components/dashboard/ReportCard";
import { EarningsCard } from "@/components/dashboard/EarningsCard";
import { MintHistoryCard } from "@/components/dashboard/MintHistoryCard";

// ─── Helpers ──────────────────────────────────────────────────────────────

// Dashboard copy is brand-locked English regardless of the user's browser
// locale (Solana ecosystem convention — "5:42 PM" not "17:42", "2,578.77" not
// "2 578,77"). The user's timezone is still honored automatically by the
// `toLocale*` family.
function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/// "2578.77" → "2,578.77" (US-style with thousands separator).
function formatSol(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ─── Dashboard page ───────────────────────────────────────────────────────

export default function Dashboard() {
  // Fetched in parallel by SWR (independent cache keys). Stale-while-
  // revalidate: subsequent visits render instantly from cache, then refresh
  // in the background. `/user/me` failure is non-fatal — the dashboard
  // degrades to a generic greeting without a subscription pill.
  const history = useSWR(
    "stats.history?period=30",
    () => api.statsHistory(30).then((r) => r.data),
  );
  const me = useSWR(
    "user.me",
    () => userApi.me().then((r) => r.data),
    {
      shouldRetryOnError: (err: unknown) =>
        !(err instanceof ApiError && (err.status === 401 || err.status === 402)),
    },
  );

  const loading = history.isLoading;
  const error =
    history.error instanceof Error
      ? history.error.message
      : history.error
        ? "Failed to load dashboard"
        : null;

  // Lock the "last updated" timestamp to the moment the data was fetched so
  // the cards don't tick every render.
  const lastUpdated = useMemo(
    () => (history.data ? formatTime(new Date()) : ""),
    [history.data],
  );

  // Defaults so the layout renders immediately on first paint without
  // optional chaining everywhere. Zero-filled.
  const coin = history.data?.coin_report ?? { current: 0, previous: 0, delta_pct: 0, sparkline: [] };
  const volume = history.data?.volume_report ?? { current: 0, previous: 0, delta_pct: 0, sparkline: [] };
  const earnings = history.data?.earnings ?? { last_30d_cents: 0, today_cents: 0, sparkline: [] };
  const mintHist = history.data?.mint_history ?? [];

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg border border-red-800 bg-red-900/30 px-4 py-3 text-sm text-red-300">
          {error}
          <button
            onClick={() => history.mutate()}
            className="ml-3 underline hover:text-red-200"
          >
            Retry
          </button>
        </div>
      )}

      {/* Top row: greeting + 2 report cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <GreetingCard subscription={me.data?.subscription ?? null} />
        </div>

        <ReportCard
          title="Coin Report"
          icon={<Coins size={14} strokeWidth={1.75} aria-hidden />}
          value={loading ? "—" : String(Math.round(coin.current))}
          deltaPct={coin.delta_pct}
          lastUpdated={lastUpdated}
          tags={["Pump", "Raydium"]}
          sparkline={coin.sparkline}
          color="#B070FF"
        />

        <ReportCard
          title="Volume Report"
          icon={<TrendingUp size={14} strokeWidth={1.75} aria-hidden />}
          value={loading ? "—" : `◎ ${formatSol(volume.current)}`}
          deltaPct={volume.delta_pct}
          lastUpdated={lastUpdated}
          tags={["Pump", "Raydium"]}
          sparkline={volume.sparkline}
          color="#14F195"
        />
      </div>

      {/* Bottom row: earnings + mint history */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <EarningsCard
          last30dCents={earnings.last_30d_cents}
          todayCents={earnings.today_cents}
          sparkline={earnings.sparkline}
        />
        <MintHistoryCard data={mintHist} />
      </div>
    </div>
  );
}

