"use client";

import { useState } from "react";

import { api } from "@/lib/api";
import { useSWRConfig } from "@/lib/swr";
import { useToast } from "@/components/ui/ToastProvider";
import { useKeybindConfig } from "@/lib/useKeybinds";

const DEFAULT_PERCENTS = [25, 50, 75, 100] as const;

interface Props {
  mint: string;
  /** Wallet IDs to target. `undefined` = sell from every holding wallet. */
  walletIds?: string[];
  percents?: readonly number[];
  size?: "xs" | "sm";
  /** Optional label shown to the left of the buttons (e.g. "dev"). */
  label?: string;
  /** Optional disabled state (e.g. when balance = 0). */
  disabled?: boolean;
}

/**
 * Reusable row of percentage-sell buttons used by:
 *   - The per-wallet rows in the launch dashboard Tasks panel
 *   - The "Sell all" header button (walletIds undefined)
 *   - The mini-widget Tasks list
 *
 * Each press hits `POST /trading/quick-sell` with the active mint, the
 * percent, and optional wallet whitelist. Result toast + SWR invalidate
 * on the shared `launches.{mint}.dashboard` key so balances refresh
 * immediately across the page AND the floating widget.
 */
export function SellPercentButtons({
  mint,
  walletIds,
  percents = DEFAULT_PERCENTS,
  size = "xs",
  label,
  disabled = false,
}: Props) {
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const config = useKeybindConfig();
  const [pendingPct, setPendingPct] = useState<number | null>(null);

  const fire = async (pct: number) => {
    if (pendingPct !== null || disabled) return;
    setPendingPct(pct);
    const startedAt = performance.now();
    toast.info(`Selling ${pct}%…`, 10000);
    try {
      const res = await api.trading.quickSell({
        mint,
        percent: pct,
        slippage_bps: config.slippageBps,
        wallet_ids: walletIds,
      });
      const d = res.data;
      const wall = Math.round(performance.now() - startedAt);
      if (d.successful > 0 && d.failed === 0) {
        toast.success(
          `Sold ${pct}% on ${d.successful}/${d.total_wallets} wallets in ${d.elapsed_ms}ms (${wall}ms RT)`,
          5000,
        );
      } else if (d.successful > 0 && d.failed > 0) {
        const firstError = d.results.find((r) => r.error)?.error ?? "unknown";
        toast.warning(
          `Partial: ${d.successful}/${d.total_wallets} sold, ${d.failed} failed: ${firstError}`,
          7000,
        );
      } else {
        const firstError =
          d.results.find((r) => r.error)?.error ?? "all wallets failed";
        toast.error(`Sell failed: ${firstError}`, 7000);
      }
      // Invalidate the dashboard for this mint so balances + holders
      // refresh now instead of waiting for the 5s SWR poll.
      void mutate(`launches.${mint}.dashboard`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Sell error: ${msg}`, 7000);
    } finally {
      setPendingPct(null);
    }
  };

  const btnSize =
    size === "xs"
      ? "text-[10px] px-1.5 py-0.5"
      : "text-xs px-2 py-1";

  return (
    <div className="flex items-center gap-1 select-none">
      {label && (
        <span className="text-[10px] text-gray-500 mr-1 font-mono">
          {label}
        </span>
      )}
      {percents.map((p) => {
        const isPending = pendingPct === p;
        return (
          <button
            key={p}
            onClick={() => fire(p)}
            disabled={disabled || pendingPct !== null}
            title={
              walletIds
                ? `Sell ${p}% from ${walletIds.length} wallet${walletIds.length === 1 ? "" : "s"}`
                : `Sell ${p}% from all holders`
            }
            className={`${btnSize} rounded transition-colors font-mono tabular-nums ${
              disabled
                ? "text-gray-700 cursor-not-allowed"
                : isPending
                  ? "bg-offivex-purple/30 text-white"
                  : pendingPct !== null
                    ? "text-gray-600 cursor-wait"
                    : "text-offivex-purple-light hover:bg-offivex-purple/15 active:bg-offivex-purple/25"
            }`}
          >
            {isPending ? "…" : `${p}%`}
          </button>
        );
      })}
    </div>
  );
}
