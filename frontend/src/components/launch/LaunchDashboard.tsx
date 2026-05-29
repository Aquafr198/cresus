"use client";

import { useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";

import type {
  LaunchDashboardData,
  LaunchHolder,
  MonitorEvent,
} from "@/lib/types";
import { useLaunchDashboard } from "@/lib/useLaunchDashboard";
import { SolscanButton } from "@/components/ui/SolscanButton";
import { Sensitive } from "@/components/privacy/Sensitive";
import { SellPercentButtons } from "./SellPercentButtons";
import { TokenAvatar } from "./TokenAvatar";

interface Props {
  mint: string;
  /** "page" = full-width 3-column layout · "mini" = stacked tight layout
   *  for the floating widget (~420×600 px). */
  density?: "page" | "mini";
}

/**
 * Single source of truth for the launch console UI. Used by both the
 * dedicated /launches/[mint] page AND the floating LaunchWidget in
 * `density="mini"` mode. Sharing the component (and the SWR cache key
 * inside `useLaunchDashboard`) means one network call serves both
 * surfaces when they're both visible.
 */
export function LaunchDashboard({ mint, density = "page" }: Props) {
  const { data, activity, isLoading, error, refresh } = useLaunchDashboard(mint);

  if (error) {
    return (
      <ErrorState
        message={
          error instanceof Error ? error.message : "Failed to load dashboard"
        }
        onRetry={refresh}
      />
    );
  }
  if (isLoading || !data) return <SkeletonState density={density} />;

  if (density === "mini") {
    return <MiniLayout data={data} activity={activity} />;
  }
  return <PageLayout data={data} activity={activity} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Page layout — 3 columns (Details | Activity | Tasks)
// ─────────────────────────────────────────────────────────────────────────────

function PageLayout({
  data,
  activity,
}: {
  data: LaunchDashboardData;
  activity: MonitorEvent[];
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_minmax(420px,1.4fr)] gap-4">
      <DetailsPanel data={data} />
      <ActivityPanel data={data} activity={activity} />
      <TasksPanel data={data} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mini layout — used inside the floating widget
// ─────────────────────────────────────────────────────────────────────────────

function MiniLayout({
  data,
  activity,
}: {
  data: LaunchDashboardData;
  activity: MonitorEvent[];
}) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <MiniHeader data={data} />
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 space-y-3">
        <TasksPanel data={data} compact />
        <ActivityPanel data={data} activity={activity} compact />
      </div>
    </div>
  );
}

function MiniHeader({ data }: { data: LaunchDashboardData }) {
  const symbol = data.details.symbol ?? "?";
  return (
    <div className="px-3 py-2 border-b border-white/[0.06] flex items-center gap-2">
      <TokenAvatar
        metadataUri={data.details.metadata_uri}
        symbol={data.details.symbol}
        mint={data.mint}
        size={32}
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-gray-100 truncate">
          ${symbol}
        </div>
        <div className="text-[10px] text-gray-500 font-mono truncate">
          {shortMint(data.mint)}
        </div>
      </div>
      {data.curve && <CurvePill curve={data.curve} compact />}
      <SellPercentButtons mint={data.mint} percents={[100]} label="all" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Details panel
// ─────────────────────────────────────────────────────────────────────────────

function DetailsPanel({ data }: { data: LaunchDashboardData }) {
  const symbol = data.details.symbol ?? "?";
  return (
    <section className="rounded-xl border border-white/[0.06] bg-offivex-bg-surface p-4">
      <h2 className="text-[11px] uppercase tracking-[0.18em] text-offivex-text-muted mb-3">
        Details
      </h2>
      <div className="flex items-start gap-3 mb-4">
        <TokenAvatar
          metadataUri={data.details.metadata_uri}
          symbol={data.details.symbol}
          mint={data.mint}
          size={56}
          className="rounded-lg"
        />
        <div className="min-w-0">
          <div className="text-base font-display font-semibold text-gray-100 truncate">
            {data.details.name || `$${symbol}`}
          </div>
          <div className="text-xs text-gray-500">${symbol}</div>
        </div>
      </div>
      <div className="text-xs space-y-1.5">
        <Row label="Mint" mono>
          <span className="text-offivex-purple-light">
            {shortMint(data.mint)}
          </span>
          <SolscanButton address={data.mint} size={12} />
        </Row>
        <Row label="Decimals">{data.details.decimals}</Row>
        <Row label="Supply">
          <Sensitive>
            {formatSupplyUi(data.details.supply, data.details.decimals)}
          </Sensitive>
        </Row>
      </div>
      {data.curve && (
        <div className="mt-4 pt-3 border-t border-white/[0.06]">
          <CurveBar curve={data.curve} />
        </div>
      )}
    </section>
  );
}

function CurveBar({ curve }: { curve: NonNullable<LaunchDashboardData["curve"]> }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-1.5">
        <span className="text-offivex-text-muted">
          {curve.graduated ? "Graduated → Raydium" : "Bonding curve"}
        </span>
        <span className="text-offivex-purple-light font-mono tabular-nums">
          <Sensitive>{curve.fill_pct.toFixed(1)}%</Sensitive>
        </span>
      </div>
      <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-offivex-purple to-offivex-purple-light"
          initial={false}
          animate={{ width: `${Math.min(curve.fill_pct, 100)}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 25 }}
        />
      </div>
      <div className="text-[10px] text-gray-500 mt-1 font-mono">
        <Sensitive>{curve.sol_in_curve.toFixed(2)} SOL</Sensitive> in curve
      </div>
    </div>
  );
}

function CurvePill({
  curve,
  compact,
}: {
  curve: NonNullable<LaunchDashboardData["curve"]>;
  compact?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-offivex-purple/15 border border-offivex-purple/30 text-offivex-purple-light font-mono tabular-nums ${
        compact ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-0.5"
      }`}
      title={curve.graduated ? "Graduated" : "Bonding curve fill"}
    >
      {curve.graduated ? (
        "Graduated"
      ) : (
        <Sensitive>{`${curve.fill_pct.toFixed(0)}%`}</Sensitive>
      )}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Activity panel
// ─────────────────────────────────────────────────────────────────────────────

function ActivityPanel({
  data,
  activity,
  compact = false,
}: {
  data: LaunchDashboardData;
  activity: MonitorEvent[];
  compact?: boolean;
}) {
  return (
    <section
      className={`rounded-xl border border-white/[0.06] bg-offivex-bg-surface ${
        compact ? "p-3" : "p-4"
      } min-h-0 flex flex-col`}
    >
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-[11px] uppercase tracking-[0.18em] text-offivex-text-muted">
          Activity
        </h2>
        <span className="text-[10px] text-gray-500 font-mono tabular-nums">
          {activity.length}
        </span>
      </div>
      {activity.length === 0 ? (
        <p className="text-xs text-gray-500 italic">
          No events yet. WebSocket will populate this live.
        </p>
      ) : (
        <ul className="flex-1 min-h-0 overflow-y-auto space-y-0.5 scrollbar-thin">
          <AnimatePresence initial={false}>
            {activity.slice(0, compact ? 30 : 80).map((ev) => (
              <motion.li
                key={ev.signature}
                layout
                initial={{ opacity: 0, y: -6, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18 }}
                className="text-[11px] font-mono grid grid-cols-[auto_1fr_auto_auto] gap-2 items-baseline px-1 py-0.5 rounded hover:bg-white/[0.02]"
              >
                <span className="text-gray-600 tabular-nums w-8 text-right">
                  {relativeAge(ev.timestamp)}
                </span>
                <span className="text-gray-400 truncate">
                  <Sensitive>
                    {ev.wallet ? shortMint(ev.wallet) : ev.event_type}
                  </Sensitive>
                </span>
                <EventTypeTag direction={ev.direction} type={ev.event_type} />
                <span className="text-gray-300 tabular-nums">
                  <Sensitive>
                    {ev.amount_sol
                      ? `${parseFloat(ev.amount_sol).toFixed(2)} SOL`
                      : "—"}
                  </Sensitive>
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
      {!compact && data.curve && (
        <div className="pt-2 mt-2 border-t border-white/[0.06]">
          <CurveBar curve={data.curve} />
        </div>
      )}
    </section>
  );
}

function EventTypeTag({
  direction,
  type,
}: {
  direction: string | null;
  type: string;
}) {
  const isBuy = direction === "buy" || type === "buy";
  const isSell = direction === "sell" || type === "sell";
  return (
    <span
      className={`text-[10px] uppercase font-semibold tracking-wider ${
        isBuy
          ? "text-green-400"
          : isSell
            ? "text-red-400"
            : "text-gray-500"
      }`}
    >
      {direction ?? type}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tasks panel — grouped Buy/Volume/Bumper + per-wallet rows + sell buttons
// ─────────────────────────────────────────────────────────────────────────────

function TasksPanel({
  data,
  compact = false,
}: {
  data: LaunchDashboardData;
  compact?: boolean;
}) {
  // Build the per-wallet rows shown under each task. We always show every
  // holder (so the user sees balance + percent), and we cross-reference
  // task.wallet_ids to also know which holder is part of which bot.
  const holdersByWallet = useMemo(() => {
    const map = new Map<string, LaunchHolder>();
    for (const h of data.holders) map.set(h.wallet_id, h);
    return map;
  }, [data.holders]);

  // Synthetic "Buy / Dev" task = all holders not in any volume/bumper bot.
  // Matches Kinesis's layout (top "Buy" group with the dev wallet).
  const enrolledWalletIds = new Set<string>();
  for (const t of data.tasks.volume)
    for (const w of t.wallet_ids) enrolledWalletIds.add(w);
  for (const t of data.tasks.bumper)
    for (const w of t.wallet_ids) enrolledWalletIds.add(w);
  const standaloneHolders = data.holders.filter(
    (h) => !enrolledWalletIds.has(h.wallet_id),
  );

  return (
    <section
      className={`rounded-xl border border-white/[0.06] bg-offivex-bg-surface ${
        compact ? "p-3" : "p-4"
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[11px] uppercase tracking-[0.18em] text-offivex-text-muted">
          Tasks
        </h2>
        <SellPercentButtons
          mint={data.mint}
          percents={[100]}
          label="all wallets"
        />
      </div>

      {standaloneHolders.length > 0 && (
        <TaskGroup
          title="Wallets (no bot)"
          status="idle"
          mint={data.mint}
          walletIds={standaloneHolders.map((h) => h.wallet_id)}
          rows={standaloneHolders}
          compact={compact}
        />
      )}

      {data.tasks.volume.map((t) => (
        <TaskGroup
          key={t.id}
          title={`Volume · ${t.sell_percent}%/cycle`}
          status={t.status}
          mint={data.mint}
          walletIds={t.wallet_ids}
          rows={t.wallet_ids
            .map((id) => holdersByWallet.get(id))
            .filter((h): h is LaunchHolder => Boolean(h))}
          compact={compact}
          subtitle={`${t.trades_count} trades · ${t.total_volume_sol.toFixed(2)} SOL volume`}
        />
      ))}

      {data.tasks.bumper.map((t) => (
        <TaskGroup
          key={t.id}
          title={`Bumper · floor ${t.price_threshold}`}
          status={t.status}
          mint={data.mint}
          walletIds={t.wallet_ids}
          rows={t.wallet_ids
            .map((id) => holdersByWallet.get(id))
            .filter((h): h is LaunchHolder => Boolean(h))}
          compact={compact}
          subtitle={`${t.buys_count} buys · ${t.total_spent_sol.toFixed(2)} SOL spent`}
        />
      ))}

      {data.holders.length === 0 && (
        <p className="text-xs text-gray-500 italic mt-2">
          No wallets hold this mint yet.
        </p>
      )}
    </section>
  );
}

function TaskGroup({
  title,
  status,
  subtitle,
  mint,
  walletIds,
  rows,
  compact,
}: {
  title: string;
  status: string | "idle";
  subtitle?: string;
  mint: string;
  walletIds: string[];
  rows: LaunchHolder[];
  compact?: boolean;
}) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex items-center justify-between py-1.5 px-2 rounded bg-white/[0.02]">
        <div className="min-w-0 flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-200 truncate">
            {title}
          </span>
          <StatusBadge status={status} />
          {subtitle && (
            <span className="text-[10px] text-gray-500 truncate hidden sm:inline">
              {subtitle}
            </span>
          )}
        </div>
        <SellPercentButtons
          mint={mint}
          walletIds={walletIds}
          percents={[100]}
          label="task"
        />
      </div>
      {rows.length > 0 ? (
        <div className="mt-1.5 px-2">
          {!compact && (
            <div className="grid grid-cols-[1fr_120px_80px_auto] text-[10px] uppercase tracking-wider text-gray-600 mb-1">
              <span>Wallet</span>
              <span className="text-right">Balance</span>
              <span className="text-right">%</span>
              <span className="text-right pr-1">Sell</span>
            </div>
          )}
          {rows.map((h) => (
            <div
              key={h.wallet_id}
              className="grid grid-cols-[1fr_120px_80px_auto] items-center text-xs py-0.5 hover:bg-white/[0.02] rounded"
            >
              <span className="font-mono text-gray-300 truncate">
                {h.label}
              </span>
              <motion.span
                key={`${h.wallet_id}-${h.balance_raw}`}
                initial={{ backgroundColor: "rgba(176,112,255,0.25)" }}
                animate={{ backgroundColor: "rgba(176,112,255,0)" }}
                transition={{ duration: 0.6 }}
                className="text-right font-mono tabular-nums text-gray-200 px-1 rounded"
              >
                <Sensitive>{formatCompactNumber(h.balance_raw)}</Sensitive>
              </motion.span>
              <span className="text-right font-mono tabular-nums text-gray-500">
                <Sensitive>{h.percent_of_supply.toFixed(2)}%</Sensitive>
              </span>
              <div className="justify-self-end">
                <SellPercentButtons
                  mint={mint}
                  walletIds={[h.wallet_id]}
                  disabled={h.balance_raw === 0}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-gray-600 italic px-2 mt-1">
          No holding wallets in this task.
        </p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls = (() => {
    switch (status.toLowerCase()) {
      case "running":
        return "bg-green-500/15 border-green-500/30 text-green-300";
      case "stopped":
        return "bg-red-500/10 border-red-500/30 text-red-300";
      case "paused":
        return "bg-amber-500/15 border-amber-500/30 text-amber-300";
      default:
        return "bg-white/[0.04] border-white/[0.08] text-gray-400";
    }
  })();
  return (
    <span
      className={`inline-block text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${cls}`}
    >
      {status}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton + error states
// ─────────────────────────────────────────────────────────────────────────────

function SkeletonState({ density }: { density: "page" | "mini" }) {
  return (
    <div
      className={
        density === "mini"
          ? "p-3 text-xs text-gray-500"
          : "grid grid-cols-1 lg:grid-cols-[280px_1fr_minmax(420px,1.4fr)] gap-4"
      }
    >
      {density === "page" ? (
        <>
          <SkeletonPanel />
          <SkeletonPanel />
          <SkeletonPanel />
        </>
      ) : (
        <span>Loading…</span>
      )}
    </div>
  );
}

function SkeletonPanel() {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-offivex-bg-surface p-4 h-48 animate-pulse" />
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/[0.05] p-4 text-sm text-red-300">
      <div className="mb-2 font-semibold">Dashboard failed to load</div>
      <div className="text-xs text-red-200/80 mb-3">{message}</div>
      <button
        onClick={onRetry}
        className="text-xs px-2 py-1 rounded bg-white/[0.05] hover:bg-white/[0.08] text-gray-200"
      >
        Retry
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function Row({
  label,
  children,
  mono,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-gray-500">{label}</span>
      <span
        className={`flex items-center gap-1 ${mono ? "font-mono" : ""} text-gray-200`}
      >
        {children}
      </span>
    </div>
  );
}

function shortMint(mint: string): string {
  if (mint.length <= 9) return mint;
  return `${mint.slice(0, 4)}…${mint.slice(-4)}`;
}

function formatSupplyUi(supplyRaw: string, decimals: number): string {
  try {
    const big = BigInt(supplyRaw);
    const divisor = BigInt(10) ** BigInt(decimals);
    const whole = big / divisor;
    return formatCompactNumber(Number(whole));
  } catch {
    return supplyRaw;
  }
}

function formatCompactNumber(n: number): string {
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toLocaleString("en-US");
}

function relativeAge(timestampMs: number): string {
  const diff = Date.now() - timestampMs;
  const secs = Math.max(0, Math.round(diff / 1000));
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.round(secs / 60)}m`;
  return `${Math.round(secs / 3600)}h`;
}
