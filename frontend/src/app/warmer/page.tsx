"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Wallet } from "@/lib/types";
import { useToast } from "@/components/ui/ToastProvider";

interface WarmerTask {
  id: string;
  wallet_ids: string[];
  actions_count: number;
  min_delay_hours: number;
  max_delay_hours: number;
  status: "pending" | "running" | "completed" | "stopped";
  actions_completed: number;
  created_at: number;
}

export default function WarmerPage() {
  const toast = useToast();
  const [tasks, setTasks] = useState<WarmerTask[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Form state
  const [selectedWallets, setSelectedWallets] = useState<string[]>([]);
  const [actionsCount, setActionsCount] = useState("20");
  const [minDelayHours, setMinDelayHours] = useState("6");
  const [maxDelayHours, setMaxDelayHours] = useState("48");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [tasksRes, walletsRes] = await Promise.all([
        api.trading.warmer.list(),
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
    if (selectedWallets.length === 0) {
      toast.error("At least one wallet required");
      return;
    }

    const actionsCountNum = parseInt(actionsCount);
    const minDelayNum = parseInt(minDelayHours);
    const maxDelayNum = parseInt(maxDelayHours);

    if (actionsCountNum <= 0 || minDelayNum <= 0 || maxDelayNum <= minDelayNum) {
      toast.error("Invalid configuration - check your inputs");
      return;
    }

    setCreating(true);
    try {
      await api.trading.warmer.create({
        wallet_ids: selectedWallets,
        actions_count: actionsCountNum,
        min_delay_hours: minDelayNum,
        max_delay_hours: maxDelayNum,
      });

      toast.success("Warmer task created and scheduled");
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
    setSelectedWallets([]);
    setActionsCount("20");
    setMinDelayHours("6");
    setMaxDelayHours("48");
  };

  const handleStart = async (taskId: string) => {
    try {
      await api.trading.warmer.start(taskId);
      toast.success("Warmer task started");
      fetchData();
    } catch (e) {
      if (e instanceof ApiError) {
        toast.error(e.message);
      } else {
        toast.error("Failed to start task");
      }
    }
  };

  // Per-task stop guard — same rationale as the volume/bumper pages.
  const [stoppingId, setStoppingId] = useState<string | null>(null);

  const handleStop = async (taskId: string) => {
    if (stoppingId) return;
    setStoppingId(taskId);
    try {
      await api.trading.warmer.stop(taskId);
      await fetchData();
      toast.success("Warmer task stopped");
    } catch (e) {
      if (e instanceof ApiError) {
        toast.error(e.message);
      } else {
        toast.error("Failed to stop task");
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "running":
        return "bg-blue-900/30 text-blue-400";
      case "completed":
        return "bg-green-900/30 text-green-400";
      case "stopped":
        return "bg-red-900/30 text-red-400";
      default:
        return "bg-gray-800 text-gray-400";
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Wallet Warmer</h1>
          <p className="text-gray-400 mt-1">
            Schedule random on-chain activities to make wallets appear organic
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
          <p className="text-gray-500">
            No warmer tasks yet. Create one to warm up your wallets.
          </p>
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
                  <div className="flex items-center gap-3 mb-3">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(
                        task.status
                      )}`}
                    >
                      {task.status}
                    </span>
                    <span className="text-sm text-gray-400">
                      {task.wallet_ids.length} wallet{task.wallet_ids.length > 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Total Actions:</span>
                      <span className="ml-2 text-white">{task.actions_count}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Completed:</span>
                      <span className="ml-2 text-white">{task.actions_completed}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Delay Range:</span>
                      <span className="ml-2 text-white">
                        {task.min_delay_hours}-{task.max_delay_hours}h
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Progress:</span>
                      <span className="ml-2 text-white">
                        {Math.round((task.actions_completed / task.actions_count) * 100)}%
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-600 transition-all duration-300"
                      style={{
                        width: `${Math.min(
                          (task.actions_completed / task.actions_count) * 100,
                          100
                        )}%`,
                      }}
                    />
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
                  ) : task.status !== "completed" ? (
                    <button
                      onClick={() => handleStart(task.id)}
                      className="px-4 py-2 rounded-lg bg-blue-900/30 hover:bg-blue-900/50 text-blue-400 transition-colors text-sm"
                    >
                      Start
                    </button>
                  ) : null}
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
            <h3 className="text-xl font-semibold mb-4">Create Warmer Task</h3>

            <div className="space-y-4">
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
                    Total Actions
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={actionsCount}
                    onChange={(e) => setActionsCount(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Min Delay (hours)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={minDelayHours}
                    onChange={(e) => setMinDelayHours(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Max Delay (hours)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={maxDelayHours}
                    onChange={(e) => setMaxDelayHours(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white"
                  />
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <h4 className="text-sm font-medium text-gray-300 mb-2">
                  Scheduled Actions Include:
                </h4>
                <ul className="text-sm text-gray-400 space-y-1">
                  <li>• Random SOL transfers (small amounts)</li>
                  <li>• Random token swaps (placeholder)</li>
                  <li>• NFT interactions (placeholder)</li>
                </ul>
                <p className="text-xs text-gray-500 mt-3">
                  Actions will be spread randomly over time using the delay range
                  specified. This helps wallets appear organic and reduces detection
                  risk.
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleCreate}
                disabled={creating}
                className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 font-medium transition-colors"
              >
                {creating ? "Creating..." : "Create & Schedule"}
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
