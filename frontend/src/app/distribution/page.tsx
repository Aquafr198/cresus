"use client";

import { useEffect, useState, useCallback } from "react";
import { api, ApiError } from "@/lib/api";
import { Distribution, Wallet } from "@/lib/types";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { HelpTooltip } from "@/components/ui/HelpTooltip";

export default function DistributionPage() {
  const [distributions, setDistributions] = useState<Distribution[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // UX-5 audit P2 — confirm before launching N transfers on-chain.
  const [confirmDialog, setConfirmDialog] = useState<null | {
    title: string;
    message: string;
    onConfirm: () => void;
  }>(null);

  // Plan form
  const [sourceWalletId, setSourceWalletId] = useState("");
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);
  const [totalSol, setTotalSol] = useState("1");
  const [strategy, setStrategy] = useState("direct");
  const [hops, setHops] = useState("1");
  const [batchSize, setBatchSize] = useState("3");
  const [batchDelayMs, setBatchDelayMs] = useState("10000");
  const [varyAmounts, setVaryAmounts] = useState(true);
  const [amountDeviation, setAmountDeviation] = useState("0.15");
  const [varyTiming, setVaryTiming] = useState(true);
  const [minDelayMs, setMinDelayMs] = useState("500");
  const [maxDelayMs, setMaxDelayMs] = useState("5000");
  // Chain-buy : optionally fan out a Jupiter buy on every target wallet
  // right after the distribution lands. Closes Kinesis-style "fonds ET
  // achats" in one click instead of forcing two-step (distribution then
  // separate bundle/trade).
  const [chainBuyEnabled, setChainBuyEnabled] = useState(false);
  const [chainBuyMint, setChainBuyMint] = useState("");
  const [chainBuyPercent, setChainBuyPercent] = useState("80");
  const [chainBuySlippageBps, setChainBuySlippageBps] = useState("1500");
  // buy_pattern : how buys are sequenced across time. Staggered is the
  // anti-bubble default. Parallel is fast but bundlemap-detectable.
  type BuyPatternMode = "parallel" | "staggered" | "batched";
  const [chainBuyPattern, setChainBuyPattern] = useState<BuyPatternMode>("staggered");
  const [chainBuyStaggerMinMs, setChainBuyStaggerMinMs] = useState("1000");
  const [chainBuyStaggerMaxMs, setChainBuyStaggerMaxMs] = useState("8000");
  const [chainBuyBatchSize, setChainBuyBatchSize] = useState("3");
  const [chainBuyBatchDelayMs, setChainBuyBatchDelayMs] = useState("10000");
  // 0–50 : ±N percentage points around `percent` per wallet. Defeats the
  // "every wallet spends exactly X%" fingerprint.
  const [chainBuyPercentVariance, setChainBuyPercentVariance] = useState("10");
  const [planning, setPlanning] = useState(false);
  // Per-distribution executing flag — guards Execute buttons from double-click
  // (which would otherwise fire two on-chain executor spawns racing for the
  // same row; the backend now also returns 409 Conflict on the second call,
  // but defending UI-side avoids the round-trip + error toast in the happy
  // path). Keyed by distribution id so multiple Execute calls on the row
  // list don't share state.
  const [executingIds, setExecutingIds] = useState<Set<string>>(new Set());
  const [planResult, setPlanResult] = useState<{
    distribution_id: string;
    num_transfers: number;
    transfers: Array<{
      from_wallet_id: string;
      to_wallet_id: string;
      amount_sol: number;
      delay_ms: number;
      hop_index: number;
    }>;
  } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [distRes, walletsRes] = await Promise.all([
        api.distributions.list(),
        api.wallets.list(),
      ]);
      setDistributions(distRes.data);
      setWallets(walletsRes.data);
      if (walletsRes.data.length > 0 && !sourceWalletId) {
        setSourceWalletId(walletsRes.data[0].id);
      }
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleTarget = (id: string) => {
    setSelectedTargets((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const selectAllTargets = () => {
    const eligible = wallets
      .filter((w) => w.id !== sourceWalletId)
      .map((w) => w.id);
    setSelectedTargets(eligible);
  };

  const handlePlan = async () => {
    if (!sourceWalletId || selectedTargets.length === 0 || !totalSol) return;
    setPlanning(true);
    setError(null);
    setPlanResult(null);
    try {
      const res = await api.distributions.plan({
        source_wallet_id: sourceWalletId,
        target_wallet_ids: selectedTargets,
        total_sol: parseFloat(totalSol),
        strategy,
        hops: strategy === "multi_hop" ? parseInt(hops) : undefined,
        batch_size: strategy === "layered" ? parseInt(batchSize) : undefined,
        batch_delay_ms: strategy === "layered" ? parseInt(batchDelayMs) : undefined,
        vary_amounts: varyAmounts,
        amount_deviation: varyAmounts ? parseFloat(amountDeviation) : undefined,
        vary_timing: varyTiming,
        min_delay_ms: varyTiming ? parseInt(minDelayMs) : undefined,
        max_delay_ms: varyTiming ? parseInt(maxDelayMs) : undefined,
      });
      setPlanResult(res.data);
      fetchData();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Planning failed");
    } finally {
      setPlanning(false);
    }
  };

  const handleExecute = async (id: string) => {
    // UX-5 audit P2 + POST-3 audit final — show a confirm dialog with the
    // ACTUAL transfer count + total SOL before launching irreversible on-chain
    // operations. Previously this read from `planResult` (state local) which
    // is only set right after `handlePlan()` — so re-executing a historical
    // distribution showed "?" instead of the count. POST-3 fix: always fetch
    // fresh details via `api.distributions.get()`.
    const dist = distributions.find((d) => d.id === id);
    setError(null);

    let transferCount: number | null = null;
    let totalSolStr = "?";
    try {
      const detail = await api.distributions.get(id);
      transferCount = detail.data.transfers?.length ?? null;
      const totalLamports = detail.data.transfers
        ?.reduce((acc, t) => acc + (t.amount_lamports || 0), 0) ?? 0;
      totalSolStr = (totalLamports / 1e9).toFixed(4);
    } catch (e) {
      // Fallback to stale planResult if the GET fails — still better than
      // exec without confirm.
      if (planResult?.distribution_id === id) {
        transferCount = planResult.num_transfers;
        totalSolStr = planResult.transfers
          .reduce((acc, t) => acc + t.amount_sol, 0)
          .toFixed(4);
      } else if (dist?.total_sol != null) {
        totalSolStr = dist.total_sol.toString();
      }
      if (e instanceof ApiError) {
        console.warn("distribution detail fetch failed, using fallback:", e.message);
      }
    }

    const linesArr = [
      transferCount != null
        ? `${transferCount} on-chain transfers will be executed.`
        : `On-chain transfers will be executed (count not available).`,
      `Total: ${totalSolStr} SOL`,
      ``,
      `Source wallet: ${
        dist?.source_wallet_id
          ? dist.source_wallet_id.slice(0, 8) + "…"
          : "(unknown)"
      }`,
      `Strategy: ${dist?.strategy ?? "(unknown)"}`,
      ``,
      `This action cannot be undone. Each transfer is a separate on-chain transaction.`,
    ];
    setConfirmDialog({
      title: "Confirm distribution execution",
      message: linesArr.join("\n"),
      onConfirm: () => {
        setConfirmDialog(null);
        executeDistribution(id);
      },
    });
  };

  const executeDistribution = async (id: string) => {
    setError(null);
    // Re-entrance guard: bail if this distribution is already executing
    // from a previous click. The Confirm dialog can fire multiple onConfirm
    // callbacks if the user is fast on the keyboard.
    if (executingIds.has(id)) return;
    setExecutingIds((s) => {
      const next = new Set(s);
      next.add(id);
      return next;
    });
    // Build the optional chain_buy payload only when the toggle is on and
    // the user has filled a valid mint. Validation is also enforced
    // server-side; this is the friendlier UX path.
    type ChainBuyArg = NonNullable<Parameters<typeof api.distributions.execute>[1]>;
    type ChainBuyPattern = NonNullable<ChainBuyArg["buy_pattern"]>;
    let chainBuy: ChainBuyArg | undefined = undefined;
    if (chainBuyEnabled && chainBuyMint.trim()) {
      const pct = parseInt(chainBuyPercent, 10);
      const slip = parseInt(chainBuySlippageBps, 10);
      const variance = parseInt(chainBuyPercentVariance, 10);
      if (!Number.isFinite(pct) || pct < 1 || pct > 100) {
        setError("Chain-buy: percent must be 1-100");
        return;
      }
      if (!Number.isFinite(slip) || slip < 1 || slip > 5000) {
        setError("Chain-buy: slippage must be 1-5000 bps");
        return;
      }
      if (!Number.isFinite(variance) || variance < 0 || variance > 50) {
        setError("Chain-buy: percent_variance must be 0-50");
        return;
      }
      // Build buy_pattern variant.
      let buy_pattern: ChainBuyPattern;
      if (chainBuyPattern === "parallel") {
        buy_pattern = { mode: "parallel" };
      } else if (chainBuyPattern === "staggered") {
        const min = parseInt(chainBuyStaggerMinMs, 10);
        const max = parseInt(chainBuyStaggerMaxMs, 10);
        if (
          !Number.isFinite(min) || !Number.isFinite(max) ||
          min < 0 || max < min
        ) {
          setError("Chain-buy: stagger delays invalid (max >= min >= 0)");
          return;
        }
        buy_pattern = { mode: "staggered", min_delay_ms: min, max_delay_ms: max };
      } else {
        const bs = parseInt(chainBuyBatchSize, 10);
        const bd = parseInt(chainBuyBatchDelayMs, 10);
        if (!Number.isFinite(bs) || bs < 1) {
          setError("Chain-buy: batch_size must be >= 1");
          return;
        }
        if (!Number.isFinite(bd) || bd < 0) {
          setError("Chain-buy: batch_delay_ms must be >= 0");
          return;
        }
        buy_pattern = { mode: "batched", batch_size: bs, batch_delay_ms: bd };
      }
      chainBuy = {
        mint: chainBuyMint.trim(),
        percent: pct,
        slippage_bps: slip,
        buy_pattern,
        percent_variance: variance,
      };
    }
    try {
      await api.distributions.execute(id, chainBuy);
      fetchData();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Execution failed");
    } finally {
      setExecutingIds((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "text-emerald-400";
      case "failed":
        return "text-red-400";
      case "executing":
        return "text-yellow-400";
      case "partial":
        return "text-orange-400";
      case "planned":
        return "text-blue-400";
      default:
        return "text-gray-400";
    }
  };

  const walletLabel = (id: string) => {
    const w = wallets.find((w) => w.id === id);
    if (!w) return id.slice(0, 8) + "...";
    return w.name || w.public_key.slice(0, 12) + "...";
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Anti-Bubble Distribution</h1>

      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          variant="warning"
          confirmText="Execute"
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}

      {error && (
        <div className="text-red-400 text-sm mb-4 bg-red-900/20 border border-red-800 rounded p-2">
          {error}
        </div>
      )}

      {planResult && (
        <div className="mb-4 p-4 bg-blue-900/20 border border-blue-800 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-blue-400">
              Plan Created — {planResult.num_transfers} transfers
            </h3>
            <button
              onClick={() => handleExecute(planResult.distribution_id)}
              disabled={executingIds.has(planResult.distribution_id)}
              className="px-3 py-1 text-xs bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
            >
              {executingIds.has(planResult.distribution_id)
                ? "Executing…"
                : chainBuyEnabled && chainBuyMint.trim()
                ? "Execute + Auto-Buy"
                : "Execute Now"}
            </button>
          </div>

          {/* Chain-buy auto-buy panel — only matters at execute time so it
              lives next to the Execute button rather than the planning form. */}
          <div className="mb-3 rounded-md border border-offivex-purple/30 bg-offivex-purple/[0.04] p-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={chainBuyEnabled}
                onChange={(e) => setChainBuyEnabled(e.target.checked)}
                className="accent-offivex-purple"
              />
              <span className="text-xs font-medium text-offivex-purple-light">
                Auto-buy after distribute — fan out a Jupiter swap on every target
              </span>
            </label>
            {chainBuyEnabled && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">
                    Mint to buy
                  </label>
                  <input
                    value={chainBuyMint}
                    onChange={(e) => setChainBuyMint(e.target.value)}
                    placeholder="Paste mint address"
                    className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs font-mono focus:outline-none focus:border-offivex-purple/50"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">
                    % of each wallet's SOL
                  </label>
                  <input
                    value={chainBuyPercent}
                    onChange={(e) => setChainBuyPercent(e.target.value)}
                    type="number"
                    min="1"
                    max="100"
                    step="5"
                    className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs focus:outline-none focus:border-offivex-purple/50"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">
                    Slippage (bps)
                  </label>
                  <input
                    value={chainBuySlippageBps}
                    onChange={(e) => setChainBuySlippageBps(e.target.value)}
                    type="number"
                    min="1"
                    max="5000"
                    step="100"
                    className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs focus:outline-none focus:border-offivex-purple/50"
                  />
                </div>
                <div className="sm:col-span-3 text-[10px] text-gray-500 leading-relaxed">
                  Reserves ~0.01 SOL per wallet for tx fees + ATA, then spends
                  the configured % of the remainder on Jupiter. Failures are
                  per-wallet, results land in this distribution's history once
                  complete.
                </div>

                {/* Buy pattern — the anti-bubble lever on the BUY side.
                    Parallel = fast but fingerprinted. Staggered = default
                    safe. Batched = extra stealth via Layered-style groups. */}
                <div className="sm:col-span-3 pt-3 border-t border-white/[0.05]">
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">
                    Buy pattern (anti-bubble)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {(["staggered", "batched", "parallel"] as const).map(
                      (mode) => (
                        <label
                          key={mode}
                          className={`flex items-start gap-2 rounded-md border p-2 cursor-pointer transition-colors ${
                            chainBuyPattern === mode
                              ? "border-offivex-purple/50 bg-offivex-purple/[0.06]"
                              : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]"
                          }`}
                        >
                          <input
                            type="radio"
                            name="chain-buy-pattern"
                            checked={chainBuyPattern === mode}
                            onChange={() => setChainBuyPattern(mode)}
                            className="mt-0.5 accent-offivex-purple"
                          />
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-gray-100 capitalize">
                              {mode === "staggered" && "🛡️ Staggered (default)"}
                              {mode === "batched" && "🥷 Batched"}
                              {mode === "parallel" && "⚡ Parallel"}
                            </div>
                            <div className="text-[10px] text-gray-500 mt-0.5 leading-snug">
                              {mode === "staggered" &&
                                "Random delay 1-8s between buys. Defeats bubble-map sync detection."}
                              {mode === "batched" &&
                                "Layered groups with inter-batch delay. Max stealth."}
                              {mode === "parallel" &&
                                "All buys at once. Fast but visible as a bundle on screeners."}
                            </div>
                          </div>
                        </label>
                      ),
                    )}
                  </div>

                  {/* Per-mode params */}
                  {chainBuyPattern === "staggered" && (
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">
                          Min delay (ms)
                        </label>
                        <input
                          value={chainBuyStaggerMinMs}
                          onChange={(e) =>
                            setChainBuyStaggerMinMs(e.target.value)
                          }
                          type="number"
                          min="0"
                          step="500"
                          className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs focus:outline-none focus:border-offivex-purple/50"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">
                          Max delay (ms)
                        </label>
                        <input
                          value={chainBuyStaggerMaxMs}
                          onChange={(e) =>
                            setChainBuyStaggerMaxMs(e.target.value)
                          }
                          type="number"
                          min="0"
                          step="500"
                          className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs focus:outline-none focus:border-offivex-purple/50"
                        />
                      </div>
                    </div>
                  )}
                  {chainBuyPattern === "batched" && (
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">
                          Batch size (wallets)
                        </label>
                        <input
                          value={chainBuyBatchSize}
                          onChange={(e) =>
                            setChainBuyBatchSize(e.target.value)
                          }
                          type="number"
                          min="1"
                          step="1"
                          className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs focus:outline-none focus:border-offivex-purple/50"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase tracking-wider text-gray-500 mb-1">
                          Batch delay (ms)
                        </label>
                        <input
                          value={chainBuyBatchDelayMs}
                          onChange={(e) =>
                            setChainBuyBatchDelayMs(e.target.value)
                          }
                          type="number"
                          min="0"
                          step="1000"
                          className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs focus:outline-none focus:border-offivex-purple/50"
                        />
                      </div>
                    </div>
                  )}
                  {chainBuyPattern === "parallel" && (
                    <div className="mt-3 rounded border border-amber-500/30 bg-amber-500/[0.05] p-2 text-[10px] text-amber-200 leading-snug">
                      ⚠ Parallel buys land in the same ~1-2s window — Bubblemaps
                      and similar screeners flag this as a coordinated bundle.
                      Use only when speed beats stealth.
                    </div>
                  )}
                </div>

                {/* Buy size variance — defeats "every wallet spends N%"
                    fingerprint by randomizing the per-wallet percent. */}
                <div className="sm:col-span-3 pt-3 border-t border-white/[0.05]">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] uppercase tracking-wider text-gray-500">
                      Per-wallet % variance
                    </label>
                    <span className="text-[11px] font-mono text-offivex-purple-light">
                      ±{chainBuyPercentVariance}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    step="5"
                    value={chainBuyPercentVariance}
                    onChange={(e) =>
                      setChainBuyPercentVariance(e.target.value)
                    }
                    className="w-full accent-offivex-purple"
                  />
                  <div className="text-[10px] text-gray-500 mt-1 leading-snug">
                    0 = every wallet spends exactly {chainBuyPercent}% (a
                    fingerprint). 10 = uniform random in [{Math.max(1, parseInt(chainBuyPercent || "0", 10) - parseInt(chainBuyPercentVariance || "0", 10) || 0)}%, {Math.min(100, parseInt(chainBuyPercent || "0", 10) + parseInt(chainBuyPercentVariance || "0", 10) || 0)}%].
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="space-y-1 text-xs max-h-48 overflow-y-auto">
            {planResult.transfers.map((t, i) => (
              <div key={i} className="flex gap-2 text-gray-400">
                <span className="text-gray-500">#{i + 1}</span>
                <span>{walletLabel(t.from_wallet_id)}</span>
                <span className="text-gray-600">→</span>
                <span>{walletLabel(t.to_wallet_id)}</span>
                <span className="text-emerald-400">{t.amount_sol.toFixed(4)} SOL</span>
                {t.delay_ms > 0 && (
                  <span className="text-yellow-500">+{t.delay_ms}ms</span>
                )}
                {t.hop_index > 0 && (
                  <span className="text-purple-400">hop {t.hop_index}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Plan Form */}
        <div className="lg:col-span-2">
          <section className="bg-gray-900 rounded-lg border border-gray-800 p-6">
            <h2 className="text-lg font-semibold mb-4">Plan Distribution</h2>
            <p className="text-gray-400 text-xs mb-4">
              Distribute SOL from a source wallet to multiple target wallets
              with anti-detection patterns to avoid BubbleMap linking.
            </p>

            <div className="space-y-4">
              {/* Source Wallet */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Source Wallet
                </label>
                <select
                  value={sourceWalletId}
                  onChange={(e) => setSourceWalletId(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm focus:outline-none focus:border-indigo-500"
                >
                  {wallets.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name || w.public_key.slice(0, 12) + "..."}
                    </option>
                  ))}
                </select>
              </div>

              {/* Target Wallets */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-gray-400">
                    Target Wallets ({selectedTargets.length} selected)
                  </label>
                  <button
                    onClick={selectAllTargets}
                    className="px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                  >
                    Select All
                  </button>
                </div>
                <div className="max-h-40 overflow-y-auto border border-gray-700 rounded-md bg-gray-800 p-2 space-y-1">
                  {wallets
                    .filter((w) => w.id !== sourceWalletId)
                    .map((w) => (
                      <label
                        key={w.id}
                        className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-700/50 px-1 rounded"
                      >
                        <input
                          type="checkbox"
                          checked={selectedTargets.includes(w.id)}
                          onChange={() => toggleTarget(w.id)}
                          className="rounded bg-gray-700 border-gray-600"
                        />
                        <span>{w.name || w.public_key.slice(0, 16) + "..."}</span>
                        {w.parent_id && (
                          <span className="text-xs text-gray-500">sub</span>
                        )}
                      </label>
                    ))}
                  {wallets.filter((w) => w.id !== sourceWalletId).length === 0 && (
                    <p className="text-gray-500 text-xs">No other wallets available.</p>
                  )}
                </div>
              </div>

              {/* Total SOL + Strategy */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Total SOL to Distribute
                  </label>
                  <input
                    value={totalSol}
                    onChange={(e) => setTotalSol(e.target.value)}
                    type="number"
                    step="0.01"
                    min="0"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="flex items-center text-xs text-gray-400 mb-1">
                    Strategy
                    <HelpTooltip label="Strategy help">
                      <strong>Direct</strong>: one transfer per target.{" "}
                      <strong>Multi-Hop</strong>: SOL routes through intermediate
                      wallets to obscure the source→target link (BubbleMaps
                      evasion). <strong>Layered</strong>: targets are split into
                      batches with a delay between batches.
                    </HelpTooltip>
                  </label>
                  <select
                    value={strategy}
                    onChange={(e) => setStrategy(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm focus:outline-none focus:border-indigo-500"
                  >
                    <option value="direct">Direct (single hop)</option>
                    <option value="multi_hop">Multi-Hop (relay wallets)</option>
                    <option value="layered">Layered (batched)</option>
                  </select>
                </div>
              </div>

              {/* Strategy-specific options */}
              {strategy === "multi_hop" && (
                <div>
                  <label className="flex items-center text-xs text-gray-400 mb-1">
                    Number of Hops
                    <HelpTooltip label="Hops help">
                      Each hop is an extra wallet the SOL passes through. More
                      hops = harder to trace, but each hop costs ~5000 lamports
                      in fees AND adds latency. 1–2 is usually plenty.
                    </HelpTooltip>
                  </label>
                  <input
                    value={hops}
                    onChange={(e) => setHops(e.target.value)}
                    type="number"
                    min="1"
                    max="5"
                    className="w-32 px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm focus:outline-none focus:border-indigo-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    SOL passes through intermediate wallets before reaching the target.
                  </p>
                </div>
              )}

              {strategy === "layered" && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="flex items-center text-xs text-gray-400 mb-1">
                      Batch Size
                      <HelpTooltip label="Batch size help">
                        Number of target wallets credited per batch. Smaller
                        batches = lower per-batch on-chain footprint, but more
                        total batches (and longer total runtime).
                      </HelpTooltip>
                    </label>
                    <input
                      value={batchSize}
                      onChange={(e) => setBatchSize(e.target.value)}
                      type="number"
                      min="1"
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="flex items-center text-xs text-gray-400 mb-1">
                      Batch Delay (ms)
                      <HelpTooltip label="Batch delay help">
                        Pause between batches in milliseconds. 10000 = 10s. Real
                        delay is randomized ±30% to look organic.
                      </HelpTooltip>
                    </label>
                    <input
                      value={batchDelayMs}
                      onChange={(e) => setBatchDelayMs(e.target.value)}
                      type="number"
                      min="0"
                      step="1000"
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              )}

              {/* Anti-detection options */}
              <div className="border-t border-gray-800 pt-4">
                <h3 className="text-sm font-medium text-gray-300 mb-3">
                  Anti-Detection Settings
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="flex items-center gap-2 text-sm mb-2">
                      <input
                        type="checkbox"
                        checked={varyAmounts}
                        onChange={(e) => setVaryAmounts(e.target.checked)}
                        className="rounded bg-gray-700 border-gray-600"
                      />
                      Vary Amounts
                      <HelpTooltip label="Vary amounts help">
                        Randomly perturbs each recipient&apos;s share within ±
                        Max Deviation. Defeats heuristics that flag equal-split
                        distributions as bot-driven. Total always sums to the
                        configured amount (zero drift).
                      </HelpTooltip>
                    </label>
                    {varyAmounts && (
                      <div>
                        <label className="flex items-center text-xs text-gray-400 mb-1">
                          Max Deviation (%)
                          <HelpTooltip label="Deviation help">
                            E.g. 15% = each recipient gets between -15% and +15%
                            of the mean amount. Higher = more variance, harder
                            to cluster. 10–20% is the sweet spot.
                          </HelpTooltip>
                        </label>
                        <input
                          value={(parseFloat(amountDeviation) * 100).toString()}
                          onChange={(e) =>
                            setAmountDeviation(
                              (parseFloat(e.target.value) / 100).toString()
                            )
                          }
                          type="number"
                          min="0"
                          max="50"
                          step="1"
                          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-sm mb-2">
                      <input
                        type="checkbox"
                        checked={varyTiming}
                        onChange={(e) => setVaryTiming(e.target.checked)}
                        className="rounded bg-gray-700 border-gray-600"
                      />
                      Vary Timing
                      <HelpTooltip label="Vary timing help">
                        Random delays between transfers in the Min-Max range.
                        Spreads on-chain activity across time so transfers don&apos;t
                        all land in the same slot.
                      </HelpTooltip>
                    </label>
                    {varyTiming && (
                      <div className="space-y-2">
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">
                            Min Delay (ms)
                          </label>
                          <input
                            value={minDelayMs}
                            onChange={(e) => setMinDelayMs(e.target.value)}
                            type="number"
                            min="0"
                            step="100"
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-400 mb-1">
                            Max Delay (ms)
                          </label>
                          <input
                            value={maxDelayMs}
                            onChange={(e) => setMaxDelayMs(e.target.value)}
                            type="number"
                            min="0"
                            step="100"
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={handlePlan}
                disabled={
                  planning ||
                  !sourceWalletId ||
                  selectedTargets.length === 0 ||
                  !totalSol ||
                  parseFloat(totalSol) <= 0
                }
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-md text-sm font-medium transition-colors"
              >
                {planning ? "Planning..." : "Create Distribution Plan"}
              </button>
            </div>
          </section>
        </div>

        {/* Distribution History */}
        <div>
          <section className="bg-gray-900 rounded-lg border border-gray-800 p-6">
            <h2 className="text-lg font-semibold mb-4">History</h2>
            {loading ? (
              <p className="text-gray-500 text-sm">Loading...</p>
            ) : distributions.length === 0 ? (
              <p className="text-gray-500 text-sm">No distributions yet.</p>
            ) : (
              <div className="space-y-2">
                {distributions.map((d) => (
                  <div
                    key={d.id}
                    className="p-3 bg-gray-800 rounded-lg border border-gray-700"
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-medium ${statusColor(d.status)}`}>
                        {d.status}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(d.created_at * 1000).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {d.total_sol.toFixed(4)} SOL · {d.strategy}
                    </div>
                    {d.result_json && (
                      <div className="text-xs text-gray-500 mt-1">
                        {d.result_json.completed}/{d.result_json.total} transfers completed
                      </div>
                    )}
                    {d.error_message && (
                      <div className="text-xs text-red-400 mt-1">
                        {d.error_message}
                      </div>
                    )}
                    {d.status === "planned" && (
                      <button
                        onClick={() => handleExecute(d.id)}
                        disabled={executingIds.has(d.id)}
                        className="mt-2 px-3 py-1 text-xs bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
                      >
                        {executingIds.has(d.id) ? "Executing…" : "Execute"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
