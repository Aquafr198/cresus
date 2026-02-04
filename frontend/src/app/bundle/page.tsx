"use client";

import { useEffect, useState, useCallback } from "react";
import { api, ApiError } from "@/lib/api";
import { Bundle, Wallet, Token } from "@/lib/types";

interface SnipeBuyRow {
  wallet_id: string;
  sol_amount: string;
}

export default function BundlePage() {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collectingFees, setCollectingFees] = useState<string | null>(null);

  // Launch form
  const [tokenMint, setTokenMint] = useState("");
  const [creatorWalletId, setCreatorWalletId] = useState("");
  const [solLiquidity, setSolLiquidity] = useState("1");
  const [tokenLiquidity, setTokenLiquidity] = useState("");
  const [jitoTip, setJitoTip] = useState("0.01");
  const [snipeBuys, setSnipeBuys] = useState<SnipeBuyRow[]>([]);
  const [launching, setLaunching] = useState(false);
  const [launchResult, setLaunchResult] = useState<{
    bundle_id: string;
    market_address: string;
    pool_address: string;
    status: string;
  } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [bundlesRes, walletsRes, tokensRes] = await Promise.all([
        api.bundles.list(),
        api.wallets.list(),
        api.tokens.list(),
      ]);
      setBundles(bundlesRes.data);
      setWallets(walletsRes.data);
      setTokens(tokensRes.data);
      if (walletsRes.data.length > 0 && !creatorWalletId) {
        setCreatorWalletId(walletsRes.data[0].id);
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

  const addSnipeBuy = () => {
    setSnipeBuys([...snipeBuys, { wallet_id: "", sol_amount: "0.1" }]);
  };

  const removeSnipeBuy = (idx: number) => {
    setSnipeBuys(snipeBuys.filter((_, i) => i !== idx));
  };

  const updateSnipeBuy = (idx: number, field: keyof SnipeBuyRow, value: string) => {
    const updated = [...snipeBuys];
    updated[idx] = { ...updated[idx], [field]: value };
    setSnipeBuys(updated);
  };

  const solToLamports = (sol: string) => Math.floor(parseFloat(sol || "0") * 1e9);

  const handleLaunch = async () => {
    if (!tokenMint.trim() || !creatorWalletId || !solLiquidity || !tokenLiquidity) return;
    if (
      !window.confirm(
        `Launch bundle with ${solLiquidity} SOL liquidity?\n\nThis will create a market, add liquidity, and execute snipe buys in one atomic Jito bundle. This action cannot be undone.`
      )
    )
      return;
    setLaunching(true);
    setError(null);
    setLaunchResult(null);
    try {
      const res = await api.bundles.launch({
        token_mint: tokenMint.trim(),
        creator_wallet_id: creatorWalletId,
        sol_liquidity: solToLamports(solLiquidity),
        token_liquidity: parseInt(tokenLiquidity),
        jito_tip_lamports: solToLamports(jitoTip),
        snipe_buys: snipeBuys
          .filter((s) => s.wallet_id && parseFloat(s.sol_amount) > 0)
          .map((s) => ({
            wallet_id: s.wallet_id,
            sol_amount: solToLamports(s.sol_amount),
          })),
      });
      setLaunchResult(res.data);
      fetchData();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Launch failed");
    } finally {
      setLaunching(false);
    }
  };

  const handleCollectFees = async (bundle: Bundle) => {
    if (!bundle.pool_address) return;

    // Need to get the creator wallet ID from the bundle
    // For now, we'll use the first wallet as a fallback
    if (wallets.length === 0) {
      setError("No wallets available");
      return;
    }

    setCollectingFees(bundle.id);
    setError(null);

    try {
      const res = await api.bundles.collectFees({
        pool_address: bundle.pool_address!,
        creator_wallet_id: creatorWalletId || wallets[0].id,
      });
      alert(`Fees collected! Signature: ${res.data.signature}`);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
      } else {
        setError("Failed to collect fees");
      }
    } finally {
      setCollectingFees(null);
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "confirmed":
        return "text-emerald-400";
      case "failed":
        return "text-red-400";
      case "submitted":
        return "text-yellow-400";
      default:
        return "text-gray-400";
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Bundle / Launch</h1>

      {error && (
        <div className="text-red-400 text-sm mb-4 bg-red-900/20 border border-red-800 rounded p-2">
          {error}
        </div>
      )}

      {launchResult && (
        <div className="mb-4 p-4 bg-emerald-900/20 border border-emerald-800 rounded-lg">
          <h3 className="text-sm font-medium text-emerald-400 mb-2">
            Bundle Submitted
          </h3>
          <div className="space-y-1 text-sm">
            <div>
              <span className="text-gray-400">Status: </span>
              <span className={statusColor(launchResult.status)}>
                {launchResult.status}
              </span>
            </div>
            <div>
              <span className="text-gray-400">Bundle ID: </span>
              <span className="font-mono text-xs">{launchResult.bundle_id}</span>
            </div>
            <div>
              <span className="text-gray-400">Market: </span>
              <span className="font-mono text-xs">{launchResult.market_address}</span>
            </div>
            <div>
              <span className="text-gray-400">Pool: </span>
              <span className="font-mono text-xs">{launchResult.pool_address}</span>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Launch Config */}
        <div className="lg:col-span-2">
          <section className="bg-gray-900 rounded-lg border border-gray-800 p-6">
            <h2 className="text-lg font-semibold mb-4">Launch Configuration</h2>
            <p className="text-gray-400 text-xs mb-4">
              Atomic Jito bundle: Create Market + Add Liquidity + Snipe Buys — all
              in one block.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Token Mint Address
                </label>
                {tokens.length > 0 ? (
                  <select
                    value={tokenMint}
                    onChange={(e) => setTokenMint(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">Select a token...</option>
                    {tokens.map((t) => (
                      <option key={t.id} value={t.mint_address}>
                        {t.name || t.symbol || t.mint_address.slice(0, 12) + "..."}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={tokenMint}
                    onChange={(e) => setTokenMint(e.target.value)}
                    placeholder="Enter token mint address..."
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm font-mono focus:outline-none focus:border-indigo-500"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Creator Wallet (pays for market + pool)
                </label>
                <select
                  value={creatorWalletId}
                  onChange={(e) => setCreatorWalletId(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm focus:outline-none focus:border-indigo-500"
                >
                  {wallets.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name || w.public_key.slice(0, 12) + "..."}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    SOL Liquidity
                  </label>
                  <input
                    value={solLiquidity}
                    onChange={(e) => setSolLiquidity(e.target.value)}
                    type="number"
                    step="0.01"
                    min="0"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Token Liquidity (raw)
                  </label>
                  <input
                    value={tokenLiquidity}
                    onChange={(e) => setTokenLiquidity(e.target.value)}
                    type="number"
                    min="1"
                    placeholder="e.g. 500000000000"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Jito Tip (SOL)
                  </label>
                  <input
                    value={jitoTip}
                    onChange={(e) => setJitoTip(e.target.value)}
                    type="number"
                    step="0.001"
                    min="0"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Snipe Buys */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-gray-400">Snipe Buys</label>
                  <button
                    onClick={addSnipeBuy}
                    className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                  >
                    + Add Wallet
                  </button>
                </div>
                {snipeBuys.length === 0 ? (
                  <p className="text-gray-500 text-xs">
                    No snipe buys configured. Add wallets to buy in the same bundle.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {snipeBuys.map((row, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <select
                          value={row.wallet_id}
                          onChange={(e) =>
                            updateSnipeBuy(idx, "wallet_id", e.target.value)
                          }
                          className="flex-1 px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-indigo-500"
                        >
                          <option value="">Select wallet...</option>
                          {wallets.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name || w.public_key.slice(0, 12) + "..."}
                            </option>
                          ))}
                        </select>
                        <input
                          value={row.sol_amount}
                          onChange={(e) =>
                            updateSnipeBuy(idx, "sol_amount", e.target.value)
                          }
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="SOL"
                          className="w-24 px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm focus:outline-none focus:border-indigo-500"
                        />
                        <span className="text-xs text-gray-500">SOL</span>
                        <button
                          onClick={() => removeSnipeBuy(idx)}
                          className="px-2 py-1 text-xs text-red-400 hover:bg-red-900/30 rounded"
                        >
                          X
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={handleLaunch}
                disabled={
                  launching ||
                  !tokenMint.trim() ||
                  !creatorWalletId ||
                  !solLiquidity ||
                  !tokenLiquidity
                }
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-md text-sm font-medium transition-colors"
              >
                {launching ? "Launching..." : "Launch Bundle"}
              </button>
            </div>
          </section>
        </div>

        {/* Bundle History */}
        <div>
          <section className="bg-gray-900 rounded-lg border border-gray-800 p-6">
            <h2 className="text-lg font-semibold mb-4">Bundle History</h2>
            {loading ? (
              <p className="text-gray-500 text-sm">Loading...</p>
            ) : bundles.length === 0 ? (
              <p className="text-gray-500 text-sm">No bundles launched yet.</p>
            ) : (
              <div className="space-y-2">
                {bundles.map((b) => (
                  <div
                    key={b.id}
                    className="p-3 bg-gray-800 rounded-lg border border-gray-700"
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-medium ${statusColor(b.status)}`}>
                        {b.status}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(b.created_at * 1000).toLocaleDateString()}
                      </span>
                    </div>
                    {b.market_address && (
                      <div className="text-xs text-gray-500 font-mono truncate mt-1">
                        Market: {b.market_address}
                      </div>
                    )}
                    {b.pool_address && (
                      <div className="text-xs text-gray-500 font-mono truncate">
                        Pool: {b.pool_address}
                      </div>
                    )}
                    {b.error_message && (
                      <div className="text-xs text-red-400 mt-1">
                        {b.error_message}
                      </div>
                    )}
                    {b.pool_address && b.status === "confirmed" && (
                      <button
                        onClick={() => handleCollectFees(b)}
                        disabled={collectingFees === b.id}
                        className="mt-2 w-full px-3 py-1.5 bg-emerald-900/30 hover:bg-emerald-900/50 disabled:opacity-50 text-emerald-400 text-xs rounded transition-colors"
                      >
                        {collectingFees === b.id ? "Collecting..." : "Collect LP Fees"}
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
