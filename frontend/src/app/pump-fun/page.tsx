"use client";

import { useState, useEffect } from "react";
import { api, ApiError } from "@/lib/api";
import { useSWR } from "@/lib/swr";
import { useToast } from "@/components/ui/ToastProvider";
import { useClaimActiveMint } from "@/components/launch/LaunchContext";

interface PumpFunLaunch {
  id: string;
  token_name: string;
  token_symbol: string;
  token_description: string;
  image_url: string;
  token_mint: string | null;
  creator_wallet_id: string;
  initial_buy_sol: number;
  status: string;
  tx_signature: string | null;
  bonding_curve: string | null;
  metadata_uri: string | null;
  created_at: number;
  updated_at: number;
}

export default function PumpFunPage() {
  const toast = useToast();
  // Shared SWR keys with /wallets etc. for instant nav.
  const wSwr = useSWR("wallets.list", () => api.wallets.list().then((r) => r.data));
  const lSwr = useSWR(
    "trading.pumpFun.list",
    () => api.trading.pumpFun.list().then((r) => r.data),
  );
  const wallets = wSwr.data ?? [];
  const launches: PumpFunLaunch[] = lSwr.data ?? [];
  const loading = wSwr.isLoading || lSwr.isLoading;
  const [creating, setCreating] = useState(false);
  const [launching, setLaunching] = useState<string | null>(null);

  // Form state
  const [tokenName, setTokenName] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("");
  const [tokenDescription, setTokenDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [selectedWallet, setSelectedWallet] = useState("");
  const [initialBuySol, setInitialBuySol] = useState("0");
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [website, setWebsite] = useState("");

  // Auto-select first wallet once SWR loads it.
  useEffect(() => {
    if (wallets.length > 0 && !selectedWallet) {
      setSelectedWallet(wallets[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallets.length]);

  // Task prefill — populated by /tasks when the user executes a saved
  // Pump-Fun template. We re-fill the form then clear sessionStorage so
  // a refresh doesn't double-apply the template.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const KEY = "offivex.task-prefill.pump_fun_template";
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return;
    try {
      const blob = JSON.parse(raw) as Record<string, unknown>;
      if (typeof blob.tokenName === "string") setTokenName(blob.tokenName);
      if (typeof blob.tokenSymbol === "string") setTokenSymbol(blob.tokenSymbol);
      if (typeof blob.tokenDescription === "string")
        setTokenDescription(blob.tokenDescription);
      if (typeof blob.imageUrl === "string") setImageUrl(blob.imageUrl);
      if (typeof blob.selectedWallet === "string")
        setSelectedWallet(blob.selectedWallet);
      if (typeof blob.initialBuySol === "string")
        setInitialBuySol(blob.initialBuySol);
      if (typeof blob.twitter === "string") setTwitter(blob.twitter);
      if (typeof blob.telegram === "string") setTelegram(blob.telegram);
      if (typeof blob.website === "string") setWebsite(blob.website);
      toast.info("Template loaded — review and create the launch", 4000);
    } catch {
      /* corrupt blob — ignore */
    } finally {
      window.sessionStorage.removeItem(KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveAsTask = async () => {
    const label =
      window.prompt(
        "Name this template (optional — shown on /tasks)",
        tokenName || tokenSymbol || "Pump.fun template",
      ) ?? undefined;
    try {
      await api.tasks.create({
        task_type: "pump_fun_template",
        label,
        config_blob: {
          tokenName,
          tokenSymbol,
          tokenDescription,
          imageUrl,
          selectedWallet,
          initialBuySol,
          twitter,
          telegram,
          website,
        },
      });
      toast.success("Saved as template — see /tasks", 4000);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      toast.error(`Save failed: ${msg}`, 6000);
    }
  };

  // Surface SWR errors via toast (this page doesn't have a banner pattern).
  useEffect(() => {
    if (wSwr.error || lSwr.error) toast.error("Failed to load data");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wSwr.error, lSwr.error]);

  // Called after create / launch to re-fetch in background.
  const loadData = () => {
    void wSwr.mutate();
    void lSwr.mutate();
  };

  // Quick-sell focus: claim the most recent launch that has a confirmed mint
  // address. Pump.fun launches go through stages — only `launched`/`buying`
  // statuses have a token_mint resolved on-chain.
  const focusMint =
    launches.find((l) => l.token_mint && l.status === "launched")?.token_mint ||
    launches.find((l) => l.token_mint)?.token_mint ||
    null;
  const focusSymbol =
    (focusMint && launches.find((l) => l.token_mint === focusMint)?.token_symbol) ||
    null;
  useClaimActiveMint(focusMint, focusSymbol);

  const handleCreateLaunch = async () => {
    if (!tokenName.trim() || !tokenSymbol.trim() || !selectedWallet) {
      toast.error("Name, symbol, and wallet are required");
      return;
    }

    setCreating(true);
    try {
      const res = await api.trading.pumpFun.create({
        token_name: tokenName.trim(),
        token_symbol: tokenSymbol.trim().toUpperCase(),
        token_description: tokenDescription.trim(),
        image_url: imageUrl.trim(),
        creator_wallet_id: selectedWallet,
        initial_buy_sol: parseFloat(initialBuySol) || 0,
        twitter: twitter.trim() || undefined,
        telegram: telegram.trim() || undefined,
        website: website.trim() || undefined,
      });

      toast.success(`Launch created: ${res.data.id.slice(0, 8)}...`);
      setTokenName("");
      setTokenSymbol("");
      setTokenDescription("");
      setImageUrl("");
      setInitialBuySol("0");
      setTwitter("");
      setTelegram("");
      setWebsite("");
      loadData();
    } catch (e) {
      if (e instanceof ApiError) {
        toast.error(e.message);
      } else {
        toast.error("Failed to create launch");
      }
    } finally {
      setCreating(false);
    }
  };

  const handleExecuteLaunch = async (id: string) => {
    const launch = launches.find((l) => l.id === id);
    const label = launch ? `${launch.token_name} ($${launch.token_symbol})` : id.slice(0, 8);
    if (
      !window.confirm(
        `Launch ${label} on-chain via Pump.fun?\n\nThis will submit a transaction to Solana and cannot be undone.`
      )
    )
      return;

    setLaunching(id);
    try {
      const res = await api.trading.pumpFun.launch(id);
      toast.success(
        `Token launched! Mint: ${res.data.token_mint.slice(0, 12)}...`
      );
      loadData();
    } catch (e) {
      if (e instanceof ApiError) {
        toast.error(e.message);
      } else {
        toast.error("Launch execution failed");
      }
    } finally {
      setLaunching(null);
    }
  };

  const parentWallets = wallets.filter((w) => !w.parent_id);

  const statusColor = (status: string) => {
    switch (status) {
      case "launched":
        return "text-green-400 bg-green-500/10";
      case "launching":
        return "text-yellow-400 bg-yellow-500/10";
      case "pending":
        return "text-blue-400 bg-blue-500/10";
      case "failed":
        return "text-red-400 bg-red-500/10";
      default:
        return "text-gray-400 bg-gray-500/10";
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Pump.fun</h1>
        <p className="text-gray-400 mt-1">
          Launch tokens on Pump.fun bonding curve
        </p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : (
        <div className="space-y-8">
          {/* Create Launch Form */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <h2 className="text-xl font-semibold mb-6">New Token Launch</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Token Name *
                </label>
                <input
                  type="text"
                  value={tokenName}
                  onChange={(e) => setTokenName(e.target.value)}
                  placeholder="My Token"
                  maxLength={32}
                  className="w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Symbol *
                </label>
                <input
                  type="text"
                  value={tokenSymbol}
                  onChange={(e) => setTokenSymbol(e.target.value)}
                  placeholder="MTK"
                  maxLength={10}
                  className="w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm uppercase focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  value={tokenDescription}
                  onChange={(e) => setTokenDescription(e.target.value)}
                  placeholder="Describe your token..."
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Image URL
                </label>
                <input
                  type="text"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://example.com/token-image.png"
                  className="w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Or use Meme Library to upload and get a URL
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Creator Wallet *
                </label>
                <select
                  value={selectedWallet}
                  onChange={(e) => setSelectedWallet(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm font-mono"
                >
                  {parentWallets.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.public_key.slice(0, 8)}...{w.public_key.slice(-6)}
                      {w.name && ` - ${w.name}`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Initial Buy (SOL)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={initialBuySol}
                  onChange={(e) => setInitialBuySol(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  0 = no initial buy. Dev buy via Jupiter after creation.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Twitter
                </label>
                <input
                  type="text"
                  value={twitter}
                  onChange={(e) => setTwitter(e.target.value)}
                  placeholder="@mytoken"
                  className="w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Telegram
                </label>
                <input
                  type="text"
                  value={telegram}
                  onChange={(e) => setTelegram(e.target.value)}
                  placeholder="https://t.me/mytoken"
                  className="w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Website
                </label>
                <input
                  type="text"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://mytoken.com"
                  className="w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="mt-6 flex gap-2">
              <button
                onClick={handleCreateLaunch}
                disabled={creating || !tokenName.trim() || !tokenSymbol.trim()}
                className="flex-1 px-6 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold transition-all"
              >
                {creating ? "Creating..." : "Create Launch"}
              </button>
              <button
                onClick={handleSaveAsTask}
                disabled={!tokenName.trim() || !tokenSymbol.trim()}
                title="Save current config as a reusable template (see /tasks)"
                className="px-4 py-3 rounded-lg bg-offivex-purple/15 hover:bg-offivex-purple/25 disabled:opacity-50 text-sm font-semibold text-offivex-purple-light transition-colors"
              >
                Save as Task
              </button>
            </div>
          </div>

          {/* Launch History */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
            <h2 className="text-xl font-semibold mb-4">Launch History</h2>

            {launches.length === 0 ? (
              <p className="text-gray-500 text-sm py-4 text-center">
                No launches yet. Create your first Pump.fun token above.
              </p>
            ) : (
              <div className="space-y-3">
                {launches.map((launch) => (
                  <div
                    key={launch.id}
                    className="p-4 bg-gray-800/50 rounded-lg border border-gray-700/50"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className="text-white font-semibold">
                          {launch.token_name}
                        </span>
                        <span className="text-gray-400 text-sm">
                          ${launch.token_symbol}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor(
                            launch.status
                          )}`}
                        >
                          {launch.status}
                        </span>
                      </div>

                      {launch.status === "pending" && (
                        <button
                          onClick={() => handleExecuteLaunch(launch.id)}
                          disabled={launching === launch.id}
                          className="px-4 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-sm font-medium transition-all"
                        >
                          {launching === launch.id
                            ? "Launching..."
                            : "Launch On-Chain"}
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-gray-400">
                      {launch.token_mint && (
                        <div>
                          <span className="text-gray-500">Mint: </span>
                          <a
                            href={`https://pump.fun/${launch.token_mint}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-400 hover:text-indigo-300 font-mono"
                          >
                            {launch.token_mint.slice(0, 8)}...
                          </a>
                        </div>
                      )}

                      {launch.tx_signature && (
                        <div>
                          <span className="text-gray-500">Tx: </span>
                          <a
                            href={`https://solscan.io/tx/${launch.tx_signature}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-400 hover:text-indigo-300 font-mono"
                          >
                            {launch.tx_signature.slice(0, 8)}...
                          </a>
                        </div>
                      )}

                      {launch.initial_buy_sol > 0 && (
                        <div>
                          <span className="text-gray-500">Initial Buy: </span>
                          <span className="text-white">
                            {launch.initial_buy_sol.toFixed(3)} SOL
                          </span>
                        </div>
                      )}

                      <div>
                        <span className="text-gray-500">Created: </span>
                        <span>
                          {new Date(
                            launch.created_at * 1000
                          ).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="p-6 bg-gray-900 rounded-xl border border-gray-800">
            <h3 className="text-lg font-semibold mb-3">About Pump.fun</h3>
            <div className="space-y-2 text-sm text-gray-400">
              <p>
                Pump.fun is a Solana token launchpad using bonding curves.
                Tokens start trading immediately on the bonding curve and
                graduate to a DEX AMM once ~85 SOL of liquidity is reached.
              </p>
              <p>
                <strong className="text-gray-300">Create:</strong> Configure
                your token metadata, select a creator wallet, and optionally set
                an initial buy amount.
              </p>
              <p>
                <strong className="text-gray-300">Launch:</strong> Click
                &quot;Launch On-Chain&quot; to upload metadata to IPFS and create the
                token on Pump.fun.
              </p>
              <p>
                <strong className="text-gray-300">Trade:</strong> Use the
                Manual Trade page to buy/sell Pump.fun tokens via Jupiter.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
