"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Wallet } from "@/lib/types";
import { useToast } from "@/components/ui/ToastProvider";

interface BumperTask {
  id: string;
  token_mint: string;
  wallet_ids: string[];
  price_threshold: number;
  buy_amount: number;
  max_buys_hour: number;
  status: "stopped" | "running" | "paused";
  buys_count: number;
  total_spent_sol: number;
  created_at: number;
}

export default function BumperPage() {
  const toast = useToast();
  const [tasks, setTasks] = useState<BumperTask[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Form state
  const [tokenMint, setTokenMint] = useState("");
  const [selectedWallets, setSelectedWallets] = useState<string[]>([]);
  const [priceThreshold, setPriceThreshold] = useState("0.0001");
  const [buyAmount, setBuyAmount] = useState("0.01");
  const [maxBuysHour, setMaxBuysHour] = useState("10");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [tasksRes, walletsRes] = await Promise.all([
        api.trading.bumper.list(),
        api.wallets.list(),
      ]);

      setTasks(tasksRes.data || []);
      setWallets(walletsRes.data);
    } catch (e) {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!tokenMint.trim() || selectedWallets.length === 0) {
      toast.error("Token mint and at least one wallet required");
      return;
    }

    setCreating(true);
    try {
      await api.trading.bumper.create({
        token_mint: tokenMint,
        wallet_ids: selectedWallets,
        price_threshold: parseFloat(priceThreshold),
        buy_amount: parseFloat(buyAmount),
        max_buys_hour: parseInt(maxBuysHour),
      });

      toast.success("Bumper task created");
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
    setPriceThreshold("0.0001");
    setBuyAmount("0.01");
    setMaxBuysHour("10");
  };

  const handleStart = async (taskId: string) => {
    try {
      await api.trading.bumper.start(taskId);
      toast.success("Bumper bot started");
      fetchData();
    } catch (e) {
      if (e instanceof ApiError) {
        toast.error(e.message);
      } else {
        toast.error("Failed to start bot");
      }
    }
  };

  // Per-task stop guard — same rationale as the volume page (no double-stop,
  // re-fetch before celebrating).
  const [stoppingId, setStoppingId] = useState<string | null>(null);

  const handleStop = async (taskId: string) => {
    if (stoppingId) return;
    setStoppingId(taskId);
    try {
      await api.trading.bumper.stop(taskId);
      await fetchData();
      toast.success("Bumper bot stopped");
    } catch (e) {
      if (e instanceof ApiError) {
        toast.error(e.message);
      } else {
        toast.error("Failed to stop bot");
      }
    } finally {
      setStoppingId(null);
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
          <h1 className="text-3xl font-bold">Bumper Bot</h1>
          <p className="text-gray-400 mt-1">
            Automatic price support when token drops below threshold
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
          <p className="text-gray-500">No bumper tasks yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="bg-gray-900 rounded-xl border border-gray-800 p-6"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-mono text-sm text-gray-400">
                      {task.token_mint.slice(0, 8)}...{task.token_mint.slice(-6)}
                    </span>
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        task.status === "running"
                          ? "bg-green-900/30 text-green-400"
                          : "bg-gray-800 text-gray-400"
                      }`}
                    >
                      {task.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Price Threshold:</span>
                      <span className="ml-2 text-white">
                        {task.price_threshold.toFixed(6)} SOL
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Buy Amount:</span>
                      <span className="ml-2 text-white">
                        {task.buy_amount.toFixed(3)} SOL
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Max/Hour:</span>
                      <span className="ml-2 text-white">{task.max_buys_hour}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Total Buys:</span>
                      <span className="ml-2 text-white">{task.buys_count}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Spent:</span>
                      <span className="ml-2 text-white">
                        {task.total_spent_sol.toFixed(4)} SOL
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  {task.status === "running" ? (
                    <button
                      onClick={() => handleStop(task.id)}
                      disabled={stoppingId === task.id}
                      className="px-4 py-2 rounded-lg bg-red-900/30 hover:bg-red-900/50 disabled:opacity-50 disabled:cursor-not-allowed text-red-400 transition-colors text-sm"
                    >
                      {stoppingId === task.id ? "Stopping…" : "Stop"}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleStart(task.id)}
                      className="px-4 py-2 rounded-lg bg-green-900/30 hover:bg-green-900/50 text-green-400 transition-colors text-sm"
                    >
                      Start
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-2xl">
            <h3 className="text-xl font-semibold mb-4">Create Bumper Task</h3>

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
                        {wallet.public_key.slice(0, 8)}...
                      </span>
                      {wallet.name && <span className="text-sm">{wallet.name}</span>}
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Price Threshold (SOL)
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    value={priceThreshold}
                    onChange={(e) => setPriceThreshold(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Buy Amount (SOL)
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    value={buyAmount}
                    onChange={(e) => setBuyAmount(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Max Buys/Hour
                  </label>
                  <input
                    type="number"
                    value={maxBuysHour}
                    onChange={(e) => setMaxBuysHour(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleCreate}
                disabled={creating}
                className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 font-medium transition-colors"
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
    </div>
  );
}
