"use client";

import { useEffect, useState, useCallback } from "react";
import { api, ApiError } from "@/lib/api";
import { Wallet } from "@/lib/types";

export default function WalletsPage() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  // Subwallet modal state
  const [subwalletTarget, setSubwalletTarget] = useState<string | null>(null);
  const [subwalletCount, setSubwalletCount] = useState(5);
  const [creatingSubwallets, setCreatingSubwallets] = useState(false);

  // Export modal state
  const [exportedKey, setExportedKey] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportPasswordPrompt, setExportPasswordPrompt] = useState<string | null>(null);
  const [exportPassword, setExportPassword] = useState("");
  const [showExportedKey, setShowExportedKey] = useState(false);

  const fetchWallets = useCallback(async () => {
    try {
      setError(null);
      const res = await api.wallets.list();
      setWallets(res.data);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
      } else {
        setError("Failed to fetch wallets");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWallets();
  }, [fetchWallets]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await api.wallets.create(newName || undefined);
      setNewName("");
      await fetchWallets();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this wallet? This cannot be undone.")) return;
    try {
      await api.wallets.delete(id);
      await fetchWallets();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
    }
  };

  const handleCreateSubwallets = async () => {
    if (!subwalletTarget) return;
    setCreatingSubwallets(true);
    try {
      await api.wallets.createSubwallets(subwalletTarget, subwalletCount);
      setSubwalletTarget(null);
      await fetchWallets();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
    } finally {
      setCreatingSubwallets(false);
    }
  };

  const handleExportPrompt = (id: string) => {
    setExportPasswordPrompt(id);
    setExportPassword("");
  };

  const handleExport = async () => {
    if (!exportPasswordPrompt || exportPassword.length < 8) return;
    setExporting(exportPasswordPrompt);
    try {
      const res = await api.wallets.export(exportPasswordPrompt, exportPassword);
      setExportedKey(JSON.stringify(res.data.encrypted_key, null, 2));
      setShowExportedKey(false);
      setExportPasswordPrompt(null);
      setExportPassword("");
      // Auto-dismiss after 30 seconds
      setTimeout(() => setExportedKey(null), 30000);
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
    } finally {
      setExporting(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const parentWallets = wallets.filter((w) => !w.parent_id);
  const getChildren = (parentId: string) =>
    wallets.filter((w) => w.parent_id === parentId);

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Wallet Manager</h1>
          <p className="text-gray-400 mt-1">
            {wallets.length} wallet{wallets.length !== 1 ? "s" : ""} total
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-3 text-red-400 hover:text-red-200"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Create wallet form */}
      <div className="mb-8 p-4 rounded-xl bg-gray-900 border border-gray-800">
        <h2 className="text-lg font-semibold mb-3">Create New Wallet</h2>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Wallet name (optional)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <button
            onClick={handleCreate}
            disabled={creating}
            className="px-6 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
          >
            {creating ? "Creating..." : "Create Wallet"}
          </button>
        </div>
      </div>

      {/* Wallet list */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading wallets...</div>
      ) : parentWallets.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          No wallets yet. Create one above.
        </div>
      ) : (
        <div className="space-y-3">
          {parentWallets.map((wallet) => {
            const children = getChildren(wallet.id);
            return (
              <div
                key={wallet.id}
                className="rounded-xl bg-gray-900 border border-gray-800 overflow-hidden"
              >
                {/* Parent wallet row */}
                <div className="p-4 flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-mono text-gray-400 bg-gray-800 px-2 py-0.5 rounded">
                        {wallet.public_key.slice(0, 4)}...
                        {wallet.public_key.slice(-4)}
                      </span>
                      {wallet.name && (
                        <span className="font-medium">{wallet.name}</span>
                      )}
                      {children.length > 0 && (
                        <span className="text-xs text-gray-500">
                          {children.length} sub-wallet
                          {children.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-gray-500 font-mono truncate">
                      {wallet.public_key}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => copyToClipboard(wallet.public_key)}
                      className="px-3 py-1.5 text-sm rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                      title="Copy public key"
                    >
                      Copy
                    </button>
                    <button
                      onClick={() => handleExportPrompt(wallet.id)}
                      disabled={exporting === wallet.id}
                      className="px-3 py-1.5 text-sm rounded-lg bg-gray-800 hover:bg-gray-700 text-amber-400 transition-colors"
                      title="Export secret key"
                    >
                      Export
                    </button>
                    <button
                      onClick={() => {
                        setSubwalletTarget(wallet.id);
                        setSubwalletCount(5);
                      }}
                      className="px-3 py-1.5 text-sm rounded-lg bg-gray-800 hover:bg-gray-700 text-indigo-400 transition-colors"
                    >
                      + Sub-wallets
                    </button>
                    <button
                      onClick={() => handleDelete(wallet.id)}
                      className="px-3 py-1.5 text-sm rounded-lg bg-gray-800 hover:bg-red-900/50 text-red-400 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Children */}
                {children.length > 0 && (
                  <div className="border-t border-gray-800">
                    {children.map((child) => (
                      <div
                        key={child.id}
                        className="px-4 py-2.5 flex items-center justify-between pl-10 border-b border-gray-800/50 last:border-b-0 bg-gray-900/50"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-gray-500">|-</span>
                            <span className="text-sm font-mono text-gray-400 bg-gray-800 px-2 py-0.5 rounded">
                              {child.public_key.slice(0, 4)}...
                              {child.public_key.slice(-4)}
                            </span>
                            {child.name && (
                              <span className="text-sm text-gray-300">
                                {child.name}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <button
                            onClick={() => copyToClipboard(child.public_key)}
                            className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700 text-gray-400 transition-colors"
                          >
                            Copy
                          </button>
                          <button
                            onClick={() => handleDelete(child.id)}
                            className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-red-900/50 text-red-400 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Subwallet modal */}
      {subwalletTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-96">
            <h3 className="text-lg font-semibold mb-4">Generate Sub-wallets</h3>
            <label className="block text-sm text-gray-400 mb-2">
              Number of sub-wallets
            </label>
            <input
              type="number"
              min={1}
              max={50}
              value={subwalletCount}
              onChange={(e) => setSubwalletCount(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setSubwalletTarget(null)}
                className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateSubwallets}
                disabled={creatingSubwallets}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 font-medium transition-colors"
              >
                {creatingSubwallets ? "Creating..." : "Generate"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export password prompt modal */}
      {exportPasswordPrompt && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-96">
            <h3 className="text-lg font-semibold mb-2 text-amber-400">
              Export Secret Key
            </h3>
            <p className="text-sm text-gray-400 mb-4">
              Enter a password to encrypt the exported key. You will need this
              password to decrypt and use the key later.
            </p>
            <input
              type="password"
              placeholder="Export password (min 8 characters)"
              value={exportPassword}
              onChange={(e) => setExportPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleExport()}
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500 mb-4"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setExportPasswordPrompt(null);
                  setExportPassword("");
                }}
                className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={exportPassword.length < 8 || exporting !== null}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 font-medium transition-colors"
              >
                {exporting ? "Exporting..." : "Export"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export key result modal */}
      {exportedKey && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-[480px]">
            <h3 className="text-lg font-semibold mb-2 text-amber-400">
              Encrypted Secret Key
            </h3>
            <p className="text-sm text-gray-400 mb-4">
              This key is encrypted with your export password. Store it safely.
              Auto-dismisses in 30 seconds.
            </p>
            <div className="bg-gray-800 rounded-lg p-3 mb-4 font-mono text-xs break-all text-gray-200 max-h-48 overflow-y-auto">
              {showExportedKey ? exportedKey : "••••••••••••••••••••••••"}
            </div>
            <div className="flex justify-between">
              <button
                onClick={() => setShowExportedKey(!showExportedKey)}
                className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors text-sm"
              >
                {showExportedKey ? "Hide" : "Show"}
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => copyToClipboard(exportedKey)}
                  className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                >
                  Copy
                </button>
                <button
                  onClick={() => setExportedKey(null)}
                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 font-medium transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
