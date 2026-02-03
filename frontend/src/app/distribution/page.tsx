"use client";

import { useEffect, useState, useCallback } from "react";
import { api, ApiError } from "@/lib/api";
import { Distribution, Wallet } from "@/lib/types";

export default function DistributionPage() {
  const [distributions, setDistributions] = useState<Distribution[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  const [planning, setPlanning] = useState(false);
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
    setError(null);
    try {
      await api.distributions.execute(id);
      fetchData();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Execution failed");
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
              className="px-3 py-1 text-xs bg-emerald-600 hover:bg-emerald-700 rounded transition-colors"
            >
              Execute Now
            </button>
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
                  <label className="block text-xs text-gray-400 mb-1">
                    Strategy
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
                  <label className="block text-xs text-gray-400 mb-1">
                    Number of Hops
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
                    <label className="block text-xs text-gray-400 mb-1">
                      Batch Size
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
                    <label className="block text-xs text-gray-400 mb-1">
                      Batch Delay (ms)
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
                    </label>
                    {varyAmounts && (
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">
                          Max Deviation (%)
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
                        className="mt-2 px-3 py-1 text-xs bg-emerald-600 hover:bg-emerald-700 rounded transition-colors"
                      >
                        Execute
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
