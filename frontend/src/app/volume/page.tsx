"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Wallet } from "@/lib/types";
import { useToast } from "@/components/ui/ToastProvider";

interface VolumeTask {
  id: string;
  token_mint: string;
  wallet_ids: string[];
  min_sol: number;
  max_sol: number;
  sell_percent: number;
  min_delay_sec: number;
  max_delay_sec: number;
  status: "stopped" | "running" | "paused";
  trades_count: number;
  total_volume_sol: number;
  created_at: number;
}

interface VolumeStats {
  task: VolumeTask;
  recent_trades: Array<{
    wallet_id: string;
    direction: string;
    sol_amount: number;
    token_amount: number;
    tx_signature: string | null;
    executed_at: number;
  }>;
}

export default function VolumePage() {
  const toast = useToast();
  const [tasks, setTasks] = useState<VolumeTask[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Create task form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [tokenMint, setTokenMint] = useState("");
  const [selectedWallets, setSelectedWallets] = useState<string[]>([]);
  const [minSol, setMinSol] = useState("0.01");
  const [maxSol, setMaxSol] = useState("0.1");
  const [sellPercent, setSellPercent] = useState("100");
  const [minDelay, setMinDelay] = useState("5");
  const [maxDelay, setMaxDelay] = useState("30");

  // Stats modal state
  const [statsTask, setStatsTask] = useState<VolumeStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [tasksRes, walletsRes] = await Promise.all([
        api.trading.volume.list(),
        api.wallets.list(),
      ]);

      setTasks(tasksRes.data || []);
      setWallets(walletsRes.data);
    } catch (e) {
      console.error("Failed to fetch data:", e);
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!tokenMint.trim()) {
      toast.error("Token mint is required");
      return;
    }
    if (selectedWallets.length === 0) {
      toast.error("Select at least one wallet");
      return;
    }

    setCreating(true);
    try {
      await api.trading.volume.create({
        token_mint: tokenMint,
        wallet_ids: selectedWallets,
        min_sol: parseFloat(minSol),
        max_sol: parseFloat(maxSol),
        sell_percent: parseInt(sellPercent),
        min_delay_sec: parseInt(minDelay),
        max_delay_sec: parseInt(maxDelay),
      });

      toast.success("Volume task created");
      setShowCreateForm(false);
      resetForm();
      fetchData();
    } catch (e) {
      if (e instanceof ApiError) {
        toast.error(e.message);
      } else {
        toast.error("Failed to create task");
      }
    } finally {
      setCreating(false);
    }
  };

  const resetForm = () => {
    setTokenMint("");
    setSelectedWallets([]);
    setMinSol("0.01");
    setMaxSol("0.1");
    setSellPercent("100");
    setMinDelay("5");
    setMaxDelay("30");
  };

  const handleStart = async (taskId: string) => {
    try {
      await api.trading.volume.start(taskId);
      toast.success("Volume bot started");
      fetchData();
    } catch (e) {
      if (e instanceof ApiError) {
        toast.error(e.message);
      } else {
        toast.error("Failed to start bot");
      }
    }
  };

  const handleStop = async (taskId: string) => {
    try {
      await api.trading.volume.stop(taskId);
      toast.success("Volume bot stopped");
      fetchData();
    } catch (e) {
      if (e instanceof ApiError) {
        toast.error(e.message);
      } else {
        toast.error("Failed to stop bot");
      }
    }
  };

  const handleViewStats = async (taskId: string) => {
    setLoadingStats(true);
    try {
      const res = await api.trading.volume.stats(taskId);
      setStatsTask(res.data);
    } catch (e) {
      if (e instanceof ApiError) {
        toast.error(e.message);
      } else {
        toast.error("Failed to load stats");
      }
    } finally {
      setLoadingStats(false);
    }
  };

  const toggleWallet = (walletId: string) => {
    if (selectedWallets.includes(walletId)) {
      setSelectedWallets(selectedWallets.filter((id) => id !== walletId));
    } else {
      setSelectedWallets([...selectedWallets, walletId]);
    }
  };

  const parentWallets = wallets.filter((w) => !w.parent_id);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Volume Bot</h1>
          <p className="text-gray-400 mt-1">
            Automated trading to generate market activity
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="px-6 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 font-medium transition-colors"
        >
          + New Task
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading tasks...</div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 bg-gray-900 rounded-xl border border-gray-800">
          <p className="text-gray-500">No volume tasks yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="bg-gray-900 rounded-xl border border-gray-800 p-6"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-mono text-sm text-gray-400">
                      {task.token_mint.slice(0, 8)}...{task.token_mint.slice(-6)}
                    </span>
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        task.status === "running"
                          ? "bg-green-900/30 text-green-400"
                          : task.status === "paused"
                          ? "bg-yellow-900/30 text-yellow-400"
                          : "bg-gray-800 text-gray-400"
                      }`}
                    >
                      {task.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Wallets:</span>
                      <span className="ml-2 text-white">{task.wallet_ids.length}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">SOL Range:</span>
                      <span className="ml-2 text-white">
                        {task.min_sol.toFixed(3)} - {task.max_sol.toFixed(3)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Trades:</span>
                      <span className="ml-2 text-white">{task.trades_count}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Volume:</span>
                      <span className="ml-2 text-white">
                        {task.total_volume_sol.toFixed(4)} SOL
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  {task.status === "running" ? (
                    <button
                      onClick={() => handleStop(task.id)}
                      className="px-4 py-2 rounded-lg bg-red-900/30 hover:bg-red-900/50 text-red-400 transition-colors text-sm"
                    >
                      Stop
                    </button>
                  ) : (
                    <button
                      onClick={() => handleStart(task.id)}
                      className="px-4 py-2 rounded-lg bg-green-900/30 hover:bg-green-900/50 text-green-400 transition-colors text-sm"
                    >
                      Start
                    </button>
                  )}
                  <button
                    onClick={() => handleViewStats(task.id)}
                    className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors text-sm"
                  >
                    Stats
                  </button>
                </div>
              </div>
              <div className="text-xs text-gray-500">
                Delay: {task.min_delay_sec}-{task.max_delay_sec}s | Sell: {task.sell_percent}%
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Task Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-semibold mb-4">Create Volume Task</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Token Mint Address
                </label>
                <input
                  type="text"
                  value={tokenMint}
                  onChange={(e) => setTokenMint(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white font-mono text-sm"
                  placeholder="Enter token mint address..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Select Wallets ({selectedWallets.length} selected)
                </label>
                <div className="bg-gray-800 rounded-lg border border-gray-700 max-h-48 overflow-y-auto p-3 space-y-2">
                  {parentWallets.map((wallet) => (
                    <label
                      key={wallet.id}
                      className="flex items-center gap-3 p-2 rounded hover:bg-gray-700/50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedWallets.includes(wallet.id)}
                        onChange={() => toggleWallet(wallet.id)}
                        className="w-4 h-4"
                      />
                      <span className="font-mono text-sm text-gray-400">
                        {wallet.public_key.slice(0, 8)}...{wallet.public_key.slice(-6)}
                      </span>
                      {wallet.name && (
                        <span className="text-sm text-gray-300">{wallet.name}</span>
                      )}
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Min SOL
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    value={minSol}
                    onChange={(e) => setMinSol(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Max SOL
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    value={maxSol}
                    onChange={(e) => setMaxSol(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Min Delay (seconds)
                  </label>
                  <input
                    type="number"
                    value={minDelay}
                    onChange={(e) => setMinDelay(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Max Delay (seconds)
                  </label>
                  <input
                    type="number"
                    value={maxDelay}
                    onChange={(e) => setMaxDelay(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Sell Percentage (1-100%)
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={sellPercent}
                  onChange={(e) => setSellPercent(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleCreate}
                disabled={creating}
                className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
              >
                {creating ? "Creating..." : "Create Task"}
              </button>
              <button
                onClick={() => {
                  setShowCreateForm(false);
                  resetForm();
                }}
                className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats Modal */}
      {statsTask && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-semibold mb-4">Task Statistics</h3>

            {loadingStats ? (
              <div className="text-center py-12 text-gray-400">Loading...</div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-gray-800 rounded-lg p-4">
                    <div className="text-sm text-gray-400">Total Trades</div>
                    <div className="text-2xl font-bold mt-1">
                      {statsTask.task.trades_count}
                    </div>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-4">
                    <div className="text-sm text-gray-400">Total Volume</div>
                    <div className="text-2xl font-bold mt-1">
                      {statsTask.task.total_volume_sol.toFixed(4)} SOL
                    </div>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-4">
                    <div className="text-sm text-gray-400">Status</div>
                    <div className="text-2xl font-bold mt-1 capitalize">
                      {statsTask.task.status}
                    </div>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-4">
                    <div className="text-sm text-gray-400">Wallets</div>
                    <div className="text-2xl font-bold mt-1">
                      {statsTask.task.wallet_ids.length}
                    </div>
                  </div>
                </div>

                <h4 className="text-lg font-semibold mb-3">Recent Trades</h4>
                <div className="space-y-2">
                  {statsTask.recent_trades.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">No trades yet</div>
                  ) : (
                    statsTask.recent_trades.map((trade, idx) => (
                      <div
                        key={idx}
                        className="bg-gray-800 rounded-lg p-3 flex items-center justify-between text-sm"
                      >
                        <div className="flex items-center gap-4">
                          <span
                            className={`px-2 py-1 rounded font-medium ${
                              trade.direction === "buy"
                                ? "bg-green-900/30 text-green-400"
                                : "bg-red-900/30 text-red-400"
                            }`}
                          >
                            {trade.direction.toUpperCase()}
                          </span>
                          <span className="text-gray-400">
                            {trade.sol_amount.toFixed(4)} SOL
                          </span>
                          <span className="font-mono text-gray-500 text-xs">
                            {trade.wallet_id.slice(0, 8)}...
                          </span>
                        </div>
                        <div className="text-gray-500 text-xs">
                          {new Date(trade.executed_at * 1000).toLocaleString()}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}

            <button
              onClick={() => setStatsTask(null)}
              className="mt-6 w-full px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
