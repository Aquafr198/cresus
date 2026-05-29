"use client";

import { useEffect, useState, useCallback } from "react";
import { api, ApiError } from "@/lib/api";
import { RpcEndpoint } from "@/lib/types";
import { KeybindRecorder } from "@/components/settings/KeybindRecorder";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface HealthResult {
  id: string;
  name: string;
  healthy: boolean;
  latency_ms: number | null;
}

export default function SettingsPage() {
  const [endpoints, setEndpoints] = useState<RpcEndpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addUrl, setAddUrl] = useState("");
  const [addWsUrl, setAddWsUrl] = useState("");
  const [addWeight, setAddWeight] = useState("1");
  const [adding, setAdding] = useState(false);

  // Health check
  const [healthResults, setHealthResults] = useState<HealthResult[] | null>(
    null
  );
  const [checkingHealth, setCheckingHealth] = useState(false);

  const fetchEndpoints = useCallback(async () => {
    try {
      setError(null);
      const res = await api.rpc.list();
      setEndpoints(res.data);
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Failed to load endpoints");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEndpoints();
  }, [fetchEndpoints]);

  const handleAdd = async () => {
    if (!addName.trim() || !addUrl.trim()) return;
    setAdding(true);
    try {
      await api.rpc.add(
        addName.trim(),
        addUrl.trim(),
        addWsUrl.trim() || undefined,
        addWeight ? parseInt(addWeight) : undefined
      );
      setAddName("");
      setAddUrl("");
      setAddWsUrl("");
      setAddWeight("1");
      setShowAdd(false);
      fetchEndpoints();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
    } finally {
      setAdding(false);
    }
  };

  // Confirmation state for RPC deletion. Deleting the last active endpoint
  // silently kills every on-chain operation (mints, bundles, distributions
  // all fail with "no active RPC endpoints"), so we both confirm AND warn
  // explicitly when the row being removed is the last active one.
  const [confirmDeleteRpc, setConfirmDeleteRpc] = useState<RpcEndpoint | null>(
    null,
  );

  const handleDelete = async (id: string) => {
    try {
      await api.rpc.delete(id);
      fetchEndpoints();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
    } finally {
      setConfirmDeleteRpc(null);
    }
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      await api.rpc.setActive(id, !currentActive);
      fetchEndpoints();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
    }
  };

  const handleHealthCheck = async () => {
    setCheckingHealth(true);
    setHealthResults(null);
    try {
      const res = await api.rpc.healthCheck();
      setHealthResults(res.data);
      fetchEndpoints();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
    } finally {
      setCheckingHealth(false);
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Settings</h1>

      {confirmDeleteRpc && (
        <ConfirmDialog
          title="Delete RPC endpoint"
          message={
            (() => {
              const activeCount = endpoints.filter((e) => Boolean(e.is_active)).length;
              const isLastActive =
                Boolean(confirmDeleteRpc.is_active) && activeCount <= 1;
              const base =
                `Permanently remove "${confirmDeleteRpc.name}"?\n` +
                `URL: ${confirmDeleteRpc.url}`;
              return isLastActive
                ? `⚠️ THIS IS YOUR LAST ACTIVE ENDPOINT.\n\nRemoving it will silently kill every on-chain operation (mints, bundles, distributions all 500 with "no active RPC endpoints"). Add another active endpoint BEFORE deleting this one.\n\n${base}`
                : base;
            })()
          }
          variant="danger"
          confirmText="Delete endpoint"
          onConfirm={() => void handleDelete(confirmDeleteRpc.id)}
          onCancel={() => setConfirmDeleteRpc(null)}
        />
      )}

      <div className="space-y-6">
        {/* Quick-sell keybinds — global hotkeys for instant exit. */}
        <KeybindRecorder />

        {/* RPC Endpoints Section */}
        <section className="bg-gray-900 rounded-lg border border-gray-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">RPC Endpoints</h2>
            <div className="flex gap-2">
              <button
                onClick={handleHealthCheck}
                disabled={checkingHealth || endpoints.length === 0}
                className="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-md transition-colors"
              >
                {checkingHealth ? "Checking..." : "Health Check"}
              </button>
              <button
                onClick={() => setShowAdd(!showAdd)}
                className="px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors"
              >
                {showAdd ? "Cancel" : "+ Add Endpoint"}
              </button>
            </div>
          </div>

          <p className="text-gray-400 text-sm mb-4">
            Configure Solana RPC endpoints. Active endpoints are used for
            blockchain interactions with automatic failover.
          </p>

          {error && (
            <div className="text-red-400 text-sm mb-4 bg-red-900/20 border border-red-800 rounded p-2">
              {error}
            </div>
          )}

          {/* Add Form */}
          {showAdd && (
            <div className="mb-4 p-4 bg-gray-800 rounded-lg border border-gray-700 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Name
                  </label>
                  <input
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    placeholder="e.g. Helius Mainnet"
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Weight
                  </label>
                  <input
                    value={addWeight}
                    onChange={(e) => setAddWeight(e.target.value)}
                    type="number"
                    min="1"
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  HTTP URL
                </label>
                <input
                  value={addUrl}
                  onChange={(e) => setAddUrl(e.target.value)}
                  placeholder="https://api.mainnet-beta.solana.com"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  WebSocket URL (optional)
                </label>
                <input
                  value={addWsUrl}
                  onChange={(e) => setAddWsUrl(e.target.value)}
                  placeholder="wss://api.mainnet-beta.solana.com"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
              <button
                onClick={handleAdd}
                disabled={adding || !addName.trim() || !addUrl.trim()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-md text-sm transition-colors"
              >
                {adding ? "Adding..." : "Add Endpoint"}
              </button>
            </div>
          )}

          {/* Health Check Results */}
          {healthResults && (
            <div className="mb-4 p-3 bg-gray-800 rounded-lg border border-gray-700">
              <h3 className="text-sm font-medium mb-2">
                Health Check Results
              </h3>
              <div className="space-y-1">
                {healthResults.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          r.healthy ? "bg-emerald-400" : "bg-red-400"
                        }`}
                      />
                      {r.name}
                    </span>
                    <span className="text-gray-400">
                      {r.healthy ? `${r.latency_ms}ms` : "unreachable"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Endpoint List */}
          {loading ? (
            <p className="text-gray-500 text-sm">Loading...</p>
          ) : endpoints.length === 0 ? (
            <p className="text-gray-500 text-sm">
              No RPC endpoints configured. Add one to get started.
            </p>
          ) : (
            <div className="space-y-2">
              {endpoints.map((ep) => (
                <div
                  key={ep.id}
                  className="flex items-center justify-between p-3 bg-gray-800 rounded-lg border border-gray-700"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          ep.is_active ? "bg-emerald-400" : "bg-gray-500"
                        }`}
                      />
                      <span className="font-medium text-sm truncate">
                        {ep.name}
                      </span>
                      <span className="text-xs text-gray-500">
                        w={ep.weight}
                      </span>
                      {ep.last_latency_ms !== null && (
                        <span className="text-xs text-gray-400">
                          {ep.last_latency_ms}ms
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 truncate mt-0.5 ml-4">
                      {ep.url}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                    <button
                      onClick={() => handleToggleActive(ep.id, ep.is_active)}
                      className={`px-2 py-1 text-xs rounded transition-colors ${
                        ep.is_active
                          ? "bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30"
                          : "bg-gray-700 text-gray-400 hover:bg-gray-600"
                      }`}
                    >
                      {ep.is_active ? "Active" : "Inactive"}
                    </button>
                    <button
                      onClick={() => setConfirmDeleteRpc(ep)}
                      className="px-2 py-1 text-xs text-red-400 hover:bg-red-900/30 rounded transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
