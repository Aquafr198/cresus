"use client";

import { useEffect, useState, useCallback } from "react";
import { api, ApiError } from "@/lib/api";
import { WalletProfile, Wallet } from "@/lib/types";

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<WalletProfile[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  // Batch randomize
  const [selectedWallets, setSelectedWallets] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [profilesRes, walletsRes] = await Promise.all([
        api.profiles.list(),
        api.wallets.list(),
      ]);
      setProfiles(profilesRes.data);
      setWallets(walletsRes.data);
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

  const handleRandomize = async (walletId: string) => {
    setError(null);
    try {
      await api.profiles.randomize(walletId);
      fetchData();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Failed to randomize profile");
    }
  };

  const handleBatchRandomize = async () => {
    if (selectedWallets.length === 0) return;
    setGenerating(true);
    setError(null);
    try {
      await api.profiles.randomizeBatch(selectedWallets);
      setSelectedWallets([]);
      fetchData();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Batch randomize failed");
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (walletId: string) => {
    setError(null);
    try {
      await api.profiles.delete(walletId);
      fetchData();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Failed to delete profile");
    }
  };

  const toggleWallet = (id: string) => {
    setSelectedWallets((prev) =>
      prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id]
    );
  };

  const selectAllUnprofiled = () => {
    const profiledWalletIds = new Set(profiles.map((p) => p.wallet_id));
    const unprofiled = wallets
      .filter((w) => !profiledWalletIds.has(w.id))
      .map((w) => w.id);
    setSelectedWallets(unprofiled);
  };

  const walletLabel = (walletId: string) => {
    const w = wallets.find((w) => w.id === walletId);
    if (!w) return walletId.slice(0, 8) + "...";
    return w.name || w.public_key.slice(0, 12) + "...";
  };

  const profiledWalletIds = new Set(profiles.map((p) => p.wallet_id));

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Wallet Profiles</h1>

      {error && (
        <div className="text-red-400 text-sm mb-4 bg-red-900/20 border border-red-800 rounded p-2">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Batch Assign */}
        <div className="lg:col-span-1">
          <section className="bg-gray-900 rounded-lg border border-gray-800 p-6">
            <h2 className="text-lg font-semibold mb-4">Batch Randomize</h2>
            <p className="text-gray-400 text-xs mb-4">
              Generate random display names, avatars, and bios for wallets to
              make them look like real users.
            </p>

            <div className="flex gap-2 mb-3">
              <button
                onClick={selectAllUnprofiled}
                className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors"
              >
                Select Unprofiled
              </button>
              <button
                onClick={() => setSelectedWallets(wallets.map((w) => w.id))}
                className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors"
              >
                Select All
              </button>
              <button
                onClick={() => setSelectedWallets([])}
                className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors"
              >
                Clear
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto border border-gray-700 rounded-md bg-gray-800 p-2 space-y-1 mb-4">
              {wallets.map((w) => (
                <label
                  key={w.id}
                  className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-700/50 px-1 rounded"
                >
                  <input
                    type="checkbox"
                    checked={selectedWallets.includes(w.id)}
                    onChange={() => toggleWallet(w.id)}
                    className="rounded bg-gray-700 border-gray-600"
                  />
                  <span className="flex-1 truncate">
                    {w.name || w.public_key.slice(0, 16) + "..."}
                  </span>
                  {profiledWalletIds.has(w.id) && (
                    <span className="text-xs text-emerald-500">profiled</span>
                  )}
                </label>
              ))}
              {wallets.length === 0 && (
                <p className="text-gray-500 text-xs">No wallets found.</p>
              )}
            </div>

            <button
              onClick={handleBatchRandomize}
              disabled={generating || selectedWallets.length === 0}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-md text-sm font-medium transition-colors"
            >
              {generating
                ? "Generating..."
                : `Randomize ${selectedWallets.length} Wallet${selectedWallets.length !== 1 ? "s" : ""}`}
            </button>
          </section>
        </div>

        {/* Profile List */}
        <div className="lg:col-span-2">
          <section className="bg-gray-900 rounded-lg border border-gray-800 p-6">
            <h2 className="text-lg font-semibold mb-4">
              Assigned Profiles ({profiles.length})
            </h2>
            {loading ? (
              <p className="text-gray-500 text-sm">Loading...</p>
            ) : profiles.length === 0 ? (
              <p className="text-gray-500 text-sm">
                No profiles assigned yet. Select wallets and click Randomize.
              </p>
            ) : (
              <div className="space-y-3">
                {profiles.map((p) => (
                  <div
                    key={p.id}
                    className="p-4 bg-gray-800 rounded-lg border border-gray-700 flex gap-4"
                  >
                    {/* Avatar */}
                    <div className="flex-shrink-0">
                      {p.avatar_url ? (
                        <img
                          src={p.avatar_url}
                          alt={p.display_name || "avatar"}
                          className="w-12 h-12 rounded-full bg-gray-700"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center text-gray-500 text-lg">
                          ?
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">
                          {p.display_name || "Unnamed"}
                        </span>
                        <span className="text-xs text-gray-500">
                          {walletLabel(p.wallet_id)}
                        </span>
                      </div>
                      {p.bio && (
                        <p className="text-xs text-gray-400 mb-1">{p.bio}</p>
                      )}
                      <div className="flex gap-3 text-xs text-gray-500">
                        {p.twitter && <span>@{p.twitter}</span>}
                        {p.telegram && <span>TG: {p.telegram}</span>}
                        {p.website && <span>{p.website}</span>}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex-shrink-0 flex gap-1">
                      <button
                        onClick={() => handleRandomize(p.wallet_id)}
                        className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                        title="Re-randomize"
                      >
                        Shuffle
                      </button>
                      <button
                        onClick={() => handleDelete(p.wallet_id)}
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
    </div>
  );
}
