"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { api, ApiError } from "@/lib/api";
import { Token, Wallet, VanityTask } from "@/lib/types";

export default function MintPage() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mint form
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [decimals, setDecimals] = useState("9");
  const [supply, setSupply] = useState("");
  const [metadataUri, setMetadataUri] = useState("");
  const [creatorWalletId, setCreatorWalletId] = useState("");
  const [minting, setMinting] = useState(false);
  const [mintResult, setMintResult] = useState<{
    mint_address: string;
    tx_signature: string;
  } | null>(null);

  // Clone lookup
  const [cloneAddress, setCloneAddress] = useState("");
  const [cloning, setCloning] = useState(false);
  const [cloneResult, setCloneResult] = useState<{
    name: string;
    symbol: string;
    decimals: number;
    supply: number;
    uri: string;
  } | null>(null);

  // Vanity grinder
  const [vanityPrefix, setVanityPrefix] = useState("");
  const [vanitySuffix, setVanitySuffix] = useState("");
  const [vanityCaseInsensitive, setVanityCaseInsensitive] = useState(false);
  const [vanityThreads, setVanityThreads] = useState("0");
  const [vanityTaskId, setVanityTaskId] = useState<string | null>(null);
  const [vanityTask, setVanityTask] = useState<VanityTask | null>(null);
  const [vanityGrinding, setVanityGrinding] = useState(false);
  const [vanityDifficulty, setVanityDifficulty] = useState<number | null>(null);
  const vanityPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [walletsRes, tokensRes] = await Promise.all([
        api.wallets.list(),
        api.tokens.list(),
      ]);
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

  // Poll vanity task status
  useEffect(() => {
    if (!vanityTaskId) return;

    const poll = async () => {
      try {
        const res = await api.tokens.vanityStatus(vanityTaskId);
        setVanityTask(res.data);
        if (res.data.status === "completed" || res.data.status === "failed") {
          setVanityGrinding(false);
          if (vanityPollRef.current) {
            clearInterval(vanityPollRef.current);
            vanityPollRef.current = null;
          }
        }
      } catch {
        // ignore poll errors
      }
    };

    poll();
    vanityPollRef.current = setInterval(poll, 2000);

    return () => {
      if (vanityPollRef.current) {
        clearInterval(vanityPollRef.current);
        vanityPollRef.current = null;
      }
    };
  }, [vanityTaskId]);

  const handleMint = async () => {
    if (!name.trim() || !symbol.trim() || !supply || !creatorWalletId) return;
    setMinting(true);
    setError(null);
    setMintResult(null);
    try {
      const res = await api.tokens.mint({
        name: name.trim(),
        symbol: symbol.trim(),
        decimals: parseInt(decimals) || 9,
        supply: parseInt(supply),
        metadata_uri: metadataUri.trim() || undefined,
        creator_wallet_id: creatorWalletId,
      });
      setMintResult({
        mint_address: res.data.mint_address,
        tx_signature: res.data.tx_signature,
      });
      setName("");
      setSymbol("");
      setDecimals("9");
      setSupply("");
      setMetadataUri("");
      fetchData();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Minting failed");
    } finally {
      setMinting(false);
    }
  };

  const handleCloneLookup = async () => {
    if (!cloneAddress.trim()) return;
    setCloning(true);
    setCloneResult(null);
    setError(null);
    try {
      const res = await api.tokens.cloneInfo(cloneAddress.trim());
      setCloneResult(res.data);
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Clone lookup failed");
    } finally {
      setCloning(false);
    }
  };

  const applyCloneData = () => {
    if (!cloneResult) return;
    setName(cloneResult.name);
    setSymbol(cloneResult.symbol);
    setDecimals(cloneResult.decimals.toString());
    setSupply(cloneResult.supply.toString());
    if (cloneResult.uri) setMetadataUri(cloneResult.uri);
    setCloneResult(null);
    setCloneAddress("");
  };

  const handleVanityStart = async () => {
    const prefix = vanityPrefix.trim() || undefined;
    const suffix = vanitySuffix.trim() || undefined;
    if (!prefix && !suffix) return;

    setError(null);
    setVanityGrinding(true);
    setVanityTask(null);
    setVanityDifficulty(null);

    try {
      const res = await api.tokens.vanityStart({
        prefix,
        suffix,
        case_insensitive: vanityCaseInsensitive,
        threads: parseInt(vanityThreads) || 0,
      });
      setVanityTaskId(res.data.task_id);
      setVanityDifficulty(res.data.estimated_difficulty);
    } catch (e) {
      setVanityGrinding(false);
      if (e instanceof ApiError) setError(e.message);
      else setError("Failed to start vanity grind");
    }
  };

  if (loading) {
    return (
      <div>
        <h1 className="text-3xl font-bold mb-6">Mint Token</h1>
        <p className="text-gray-500 text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Mint Token</h1>

      {error && (
        <div className="text-red-400 text-sm mb-4 bg-red-900/20 border border-red-800 rounded p-2">
          {error}
        </div>
      )}

      {mintResult && (
        <div className="mb-4 p-4 bg-emerald-900/20 border border-emerald-800 rounded-lg">
          <h3 className="text-sm font-medium text-emerald-400 mb-2">
            Token Created
          </h3>
          <div className="space-y-1 text-sm">
            <div>
              <span className="text-gray-400">Mint: </span>
              <span className="font-mono text-xs">{mintResult.mint_address}</span>
            </div>
            <div>
              <span className="text-gray-400">Tx: </span>
              <span className="font-mono text-xs">{mintResult.tx_signature}</span>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Mint Form */}
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-gray-900 rounded-lg border border-gray-800 p-6">
            <h2 className="text-lg font-semibold mb-4">Create New Token</h2>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Token Name
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. My Token"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Symbol
                  </label>
                  <input
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value)}
                    placeholder="e.g. MTK"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Decimals
                  </label>
                  <input
                    value={decimals}
                    onChange={(e) => setDecimals(e.target.value)}
                    type="number"
                    min="0"
                    max="18"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Total Supply
                  </label>
                  <input
                    value={supply}
                    onChange={(e) => setSupply(e.target.value)}
                    type="number"
                    min="1"
                    placeholder="e.g. 1000000000"
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Metadata URI (optional)
                </label>
                <input
                  value={metadataUri}
                  onChange={(e) => setMetadataUri(e.target.value)}
                  placeholder="https://arweave.net/... or ipfs://..."
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Creator Wallet
                </label>
                {wallets.length === 0 ? (
                  <p className="text-yellow-500 text-sm">
                    No wallets found. Create a wallet first.
                  </p>
                ) : (
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
                )}
              </div>

              <button
                onClick={handleMint}
                disabled={
                  minting ||
                  !name.trim() ||
                  !symbol.trim() ||
                  !supply ||
                  !creatorWalletId
                }
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-md text-sm font-medium transition-colors"
              >
                {minting ? "Minting..." : "Mint Token"}
              </button>
            </div>
          </section>

          {/* Vanity Address Grinder */}
          <section className="bg-gray-900 rounded-lg border border-gray-800 p-6">
            <h2 className="text-lg font-semibold mb-2">Vanity Address Grinder</h2>
            <p className="text-gray-400 text-xs mb-4">
              Generate a keypair whose public key starts or ends with specific characters.
            </p>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Prefix
                  </label>
                  <input
                    value={vanityPrefix}
                    onChange={(e) => setVanityPrefix(e.target.value)}
                    placeholder="e.g. pump"
                    disabled={vanityGrinding}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm font-mono focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Suffix
                  </label>
                  <input
                    value={vanitySuffix}
                    onChange={(e) => setVanitySuffix(e.target.value)}
                    placeholder="e.g. moon"
                    disabled={vanityGrinding}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm font-mono focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-xs text-gray-400">
                  <input
                    type="checkbox"
                    checked={vanityCaseInsensitive}
                    onChange={(e) => setVanityCaseInsensitive(e.target.checked)}
                    disabled={vanityGrinding}
                    className="rounded bg-gray-800 border-gray-700"
                  />
                  Case insensitive
                </label>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-400">Threads:</label>
                  <input
                    value={vanityThreads}
                    onChange={(e) => setVanityThreads(e.target.value)}
                    type="number"
                    min="0"
                    max="64"
                    disabled={vanityGrinding}
                    className="w-16 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-center focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                  />
                  <span className="text-xs text-gray-500">(0 = all)</span>
                </div>
              </div>

              <button
                onClick={handleVanityStart}
                disabled={vanityGrinding || (!vanityPrefix.trim() && !vanitySuffix.trim())}
                className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-md text-sm font-medium transition-colors"
              >
                {vanityGrinding ? "Grinding..." : "Start Grind"}
              </button>

              {/* Progress */}
              {vanityGrinding && vanityTask && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>Progress</span>
                    <span>{(vanityTask.progress * 100).toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-2">
                    <div
                      className="bg-purple-500 h-2 rounded-full transition-all"
                      style={{ width: `${Math.min(vanityTask.progress * 100, 100)}%` }}
                    />
                  </div>
                  {vanityDifficulty && (
                    <p className="text-xs text-gray-500">
                      Estimated difficulty: ~{vanityDifficulty.toLocaleString()} attempts
                    </p>
                  )}
                </div>
              )}

              {/* Result */}
              {vanityTask?.status === "completed" && vanityTask.result && (
                <div className="p-4 bg-emerald-900/20 border border-emerald-800 rounded-lg space-y-2">
                  <h3 className="text-sm font-medium text-emerald-400">
                    Vanity Address Found
                  </h3>
                  <div>
                    <span className="text-xs text-gray-400">Public Key: </span>
                    <span className="text-xs font-mono break-all">
                      {vanityTask.result.public_key}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-400">Secret Key: </span>
                    <span className="text-xs font-mono text-amber-400">
                      (encrypted with master key — stored securely)
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">
                    Found after {vanityTask.result.attempts?.toLocaleString() ?? "?"} attempts
                  </div>
                </div>
              )}

              {/* Error */}
              {vanityTask?.status === "failed" && vanityTask.error && (
                <div className="p-3 bg-red-900/20 border border-red-800 rounded text-xs text-red-400">
                  {vanityTask.error}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Clone Lookup + Token History */}
        <div className="space-y-6">
          {/* Clone Lookup */}
          <section className="bg-gray-900 rounded-lg border border-gray-800 p-6">
            <h2 className="text-lg font-semibold mb-4">Clone Token</h2>
            <p className="text-gray-400 text-xs mb-3">
              Look up an existing token to copy its parameters.
            </p>
            <div className="space-y-3">
              <input
                value={cloneAddress}
                onChange={(e) => setCloneAddress(e.target.value)}
                placeholder="Mint address..."
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm font-mono focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={handleCloneLookup}
                disabled={cloning || !cloneAddress.trim()}
                className="w-full py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-md text-sm transition-colors"
              >
                {cloning ? "Looking up..." : "Lookup"}
              </button>

              {cloneResult && (
                <div className="p-3 bg-gray-800 rounded border border-gray-700 space-y-1">
                  <div className="text-sm font-medium">
                    {cloneResult.name} ({cloneResult.symbol})
                  </div>
                  <div className="text-xs text-gray-400">
                    Decimals: {cloneResult.decimals} | Supply:{" "}
                    {cloneResult.supply.toLocaleString()}
                  </div>
                  {cloneResult.uri && (
                    <div className="text-xs text-gray-500 truncate">
                      URI: {cloneResult.uri}
                    </div>
                  )}
                  <button
                    onClick={applyCloneData}
                    className="mt-2 w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 rounded text-xs transition-colors"
                  >
                    Apply to Mint Form
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* Recent Tokens */}
          <section className="bg-gray-900 rounded-lg border border-gray-800 p-6">
            <h2 className="text-lg font-semibold mb-4">Recent Tokens</h2>
            {tokens.length === 0 ? (
              <p className="text-gray-500 text-sm">No tokens created yet.</p>
            ) : (
              <div className="space-y-2">
                {tokens.slice(0, 10).map((t) => (
                  <div
                    key={t.id}
                    className="p-2 bg-gray-800 rounded border border-gray-700"
                  >
                    <div className="text-sm font-medium">
                      {t.name || "Unnamed"}{" "}
                      <span className="text-gray-400">
                        {t.symbol ? `(${t.symbol})` : ""}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 font-mono truncate">
                      {t.mint_address}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      Supply: {t.supply} | Decimals: {t.decimals}
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
