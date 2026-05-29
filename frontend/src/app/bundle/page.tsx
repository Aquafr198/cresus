"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useSWR } from "@/lib/swr";
import type { Bundle } from "@/lib/types";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/ToastProvider";
import { useClaimActiveMint } from "@/components/launch/LaunchContext";

interface SnipeBuyRow {
  wallet_id: string;
  sol_amount: string;
}

export default function BundlePage() {
  const toast = useToast();
  // Shared SWR keys with /wallets, /mint, /pump-fun. Stale-while-revalidate.
  const bSwr = useSWR("bundles.list", () => api.bundles.list().then((r) => r.data));
  const wSwr = useSWR("wallets.list", () => api.wallets.list().then((r) => r.data));
  const tSwr = useSWR("tokens.list", () => api.tokens.list().then((r) => r.data));
  const bundles = bSwr.data ?? [];
  const wallets = wSwr.data ?? [];
  const tokens = tSwr.data ?? [];
  const loading = bSwr.isLoading || wSwr.isLoading || tSwr.isLoading;
  const [error, setError] = useState<string | null>(null);
  const [collectingFees, setCollectingFees] = useState<string | null>(null);

  // Launch form
  const [tokenMint, setTokenMint] = useState("");
  const [creatorWalletId, setCreatorWalletId] = useState("");
  const [solLiquidity, setSolLiquidity] = useState("1");
  const [tokenLiquidity, setTokenLiquidity] = useState("");
  const [jitoTip, setJitoTip] = useState("0.01");
  /// Tokens (raw, decimal-scaled) the creator deliberately keeps after launch.
  /// Empty = no reserve declared (dev-sold detector disabled for this bundle).
  const [creatorReserve, setCreatorReserve] = useState("");
  /// What happens to the LP tokens minted at pool init. `burn` is the
  /// anti-rug default (passes DEXTools/RugCheck "LP Locked"); `keep` is
  /// for projects that intend to lock/migrate LP off-platform later.
  const [lpDisposition, setLpDisposition] = useState<"burn" | "keep">("burn");
  const [snipeBuys, setSnipeBuys] = useState<SnipeBuyRow[]>([]);
  const [launching, setLaunching] = useState(false);
  const [launchResult, setLaunchResult] = useState<{
    bundle_id: string;
    market_address: string;
    pool_address: string;
    status: string;
  } | null>(null);
  // UX-2 — rich confirm dialog showing destination wallets before signature.
  const [confirmDialog, setConfirmDialog] = useState<null | {
    title: string;
    message: string;
    onConfirm: () => void;
  }>(null);

  // Quick-sell focus: once the bundle has landed, the launched mint becomes
  // the keybind target for as long as the user stays on this page.
  const launchedMint = launchResult ? tokenMint : null;
  const launchedSymbol =
    (launchedMint &&
      tokens.find((t) => t.mint_address === launchedMint)?.symbol) ||
    null;
  useClaimActiveMint(launchedMint, launchedSymbol);

  // Auto-select first wallet once it's loaded.
  useEffect(() => {
    if (wallets.length > 0 && !creatorWalletId) {
      setCreatorWalletId(wallets[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallets.length]);

  // Task prefill — populated by /tasks when the user executes a saved
  // bundle template. We read once on mount then clear the key.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const KEY = "offivex.task-prefill.bundle_template";
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return;
    try {
      const blob = JSON.parse(raw) as Record<string, unknown>;
      if (typeof blob.tokenMint === "string") setTokenMint(blob.tokenMint);
      if (typeof blob.creatorWalletId === "string")
        setCreatorWalletId(blob.creatorWalletId);
      if (typeof blob.solLiquidity === "string")
        setSolLiquidity(blob.solLiquidity);
      if (typeof blob.tokenLiquidity === "string")
        setTokenLiquidity(blob.tokenLiquidity);
      if (typeof blob.jitoTip === "string") setJitoTip(blob.jitoTip);
      if (typeof blob.creatorReserve === "string")
        setCreatorReserve(blob.creatorReserve);
      if (blob.lpDisposition === "burn" || blob.lpDisposition === "keep") {
        setLpDisposition(blob.lpDisposition);
      }
      if (Array.isArray(blob.snipeBuys)) {
        setSnipeBuys(blob.snipeBuys as SnipeBuyRow[]);
      }
      toast.info("Template loaded — review and click Launch when ready", 4000);
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
        tokenMint ? `Bundle ${tokenMint.slice(0, 6)}…` : "Bundle template",
      ) ?? undefined;
    try {
      await api.tasks.create({
        task_type: "bundle_template",
        label,
        config_blob: {
          tokenMint,
          creatorWalletId,
          solLiquidity,
          tokenLiquidity,
          jitoTip,
          creatorReserve,
          lpDisposition,
          snipeBuys,
        },
      });
      toast.success("Saved as template — see /tasks", 4000);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      toast.error(`Save failed: ${msg}`, 6000);
    }
  };

  // Surface SWR errors through the existing `error` banner.
  useEffect(() => {
    const e = bSwr.error ?? wSwr.error ?? tSwr.error;
    if (e instanceof ApiError) setError(e.message);
    else if (e) setError("Failed to load data");
    else setError(null);
  }, [bSwr.error, wSwr.error, tSwr.error]);

  // Manual refresh — called after a successful launch / fee collection.
  const fetchData = () => {
    void bSwr.mutate();
    void wSwr.mutate();
    void tSwr.mutate();
  };

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

  const walletLabel = (id: string): string => {
    const w = wallets.find((x) => x.id === id);
    if (!w) return id.slice(0, 8);
    const name = w.name || "(unnamed)";
    const addr = `${w.public_key.slice(0, 6)}…${w.public_key.slice(-4)}`;
    return `${name} · ${addr}`;
  };

  const handleLaunch = async () => {
    if (!tokenMint.trim() || !creatorWalletId || !solLiquidity || !tokenLiquidity) return;

    const validSnipes = snipeBuys.filter(
      (s) => s.wallet_id && parseFloat(s.sol_amount) > 0,
    );
    const totalSnipeSol = validSnipes.reduce(
      (acc, s) => acc + parseFloat(s.sol_amount || "0"),
      0,
    );
    const totalSol =
      parseFloat(solLiquidity || "0") +
      parseFloat(jitoTip || "0") +
      totalSnipeSol;

    // UX-2 — rich multi-line message showing the creator wallet AND each snipe
    // destination, so the user can verify destinations before signing.
    const lines: string[] = [
      `Token mint: ${tokenMint.trim().slice(0, 8)}…${tokenMint.trim().slice(-4)}`,
      ``,
      `Creator wallet (signs + receives LP):`,
      `  ${walletLabel(creatorWalletId)}`,
      ``,
      `Initial liquidity: ${solLiquidity} SOL + ${tokenLiquidity} tokens`,
      `Jito tip:          ${jitoTip} SOL`,
    ];
    if (validSnipes.length > 0) {
      lines.push(``, `Snipe buys (${validSnipes.length} wallets):`);
      for (const s of validSnipes) {
        lines.push(`  ${s.sol_amount} SOL → ${walletLabel(s.wallet_id)}`);
      }
    }
    lines.push(
      ``,
      `Total committed: ${totalSol.toFixed(4)} SOL`,
      ``,
      lpDisposition === "burn"
        ? `LP tokens: BURNED atomically (anti-rug, passes DEXTools/RugCheck).`
        : `LP tokens: KEPT in creator wallet (you can lock/migrate them later).`,
      ``,
      `Atomic Jito bundle — all transactions succeed or all fail. Cannot be undone.`,
    );

    setConfirmDialog({
      title: "Confirm bundle launch",
      message: lines.join("\n"),
      onConfirm: () => {
        setConfirmDialog(null);
        executeLaunch(validSnipes);
      },
    });
  };

  const executeLaunch = async (
    validSnipes: { wallet_id: string; sol_amount: string }[],
  ) => {
    setLaunching(true);
    setError(null);
    setLaunchResult(null);
    try {
      const reserveTrimmed = creatorReserve.trim();
      const res = await api.bundles.launch({
        token_mint: tokenMint.trim(),
        creator_wallet_id: creatorWalletId,
        sol_liquidity: solToLamports(solLiquidity),
        token_liquidity: parseInt(tokenLiquidity),
        jito_tip_lamports: solToLamports(jitoTip),
        snipe_buys: validSnipes.map((s) => ({
          wallet_id: s.wallet_id,
          sol_amount: solToLamports(s.sol_amount),
        })),
        creator_reserve_tokens: reserveTrimmed ? Number(reserveTrimmed) : undefined,
        lp_disposition: lpDisposition,
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
    if (wallets.length === 0) {
      setError("No wallets available");
      return;
    }

    // Require an explicit creator wallet selection — silently using wallets[0]
    // can route fees to the WRONG wallet when the user has multiple wallets,
    // potentially losing funds. The user must pick the wallet that originally
    // launched the bundle.
    let targetWalletId = creatorWalletId;
    if (!targetWalletId) {
      if (wallets.length === 1) {
        targetWalletId = wallets[0].id;
      } else {
        setError(
          "Select the creator wallet (top of the page) before collecting fees. " +
            "Fees must go to the same wallet that launched this bundle.",
        );
        return;
      }
    }

    // Validate the selected wallet still exists in the current list (it could
    // have been deleted in another tab between selection and click).
    const targetWallet = wallets.find((w) => w.id === targetWalletId);
    if (!targetWallet) {
      setError("Selected creator wallet no longer exists. Choose another wallet.");
      return;
    }

    // UX-2 — rich confirm via ConfirmDialog (no more window.confirm) so the
    // user sees the destination wallet name + full short-address.
    setConfirmDialog({
      title: "Collect LP fees",
      message: [
        `Destination wallet:`,
        `  ${walletLabel(targetWalletId)}`,
        ``,
        `Pool: ${bundle.pool_address?.slice(0, 8)}…${bundle.pool_address?.slice(-4)}`,
        ``,
        `This should be the SAME wallet that launched the bundle, otherwise the`,
        `LP authority will reject the claim.`,
      ].join("\n"),
      onConfirm: () => {
        setConfirmDialog(null);
        executeCollectFees(bundle, targetWalletId as string);
      },
    });
  };

  const executeCollectFees = async (bundle: Bundle, targetWalletId: string) => {
    setCollectingFees(bundle.id);
    setError(null);

    try {
      const res = await api.bundles.collectFees({
        pool_address: bundle.pool_address!,
        creator_wallet_id: targetWalletId,
      });
      // Audit POST-12 — replaced native `alert()` with in-app toast for UX consistency.
      toast.success(`Fees collected — sig ${res.data.signature.slice(0, 8)}…`);
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

      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          variant="warning"
          confirmText="Continue"
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}

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

              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Creator Reserve (raw, optional)
                </label>
                <input
                  value={creatorReserve}
                  onChange={(e) => setCreatorReserve(e.target.value)}
                  type="number"
                  min="0"
                  placeholder="e.g. 250000000000 — tokens kept in creator wallet"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-md text-sm focus:outline-none focus:border-indigo-500"
                />
                <p className="mt-1 text-[10px] text-gray-500">
                  Sets the baseline for the dev-sold alert. Reserve + liquidity
                  + Σ snipe min_out must be ≤ total supply.
                </p>
              </div>

              <div className="rounded-md border border-gray-800 p-3 space-y-2 bg-gray-950/40">
                <div className="text-[11px] font-medium text-gray-300">
                  LP after launch (anti-rug — defaults pass DEXTools / RugCheck)
                </div>
                <label className="flex items-start gap-2 text-xs text-gray-300">
                  <input
                    type="radio"
                    name="lp-disposition"
                    checked={lpDisposition === "burn"}
                    onChange={() => setLpDisposition("burn")}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium">Burn LP atomically</span>{" "}
                    <span className="text-gray-500">(default — recommended for memecoins)</span>
                    <div className="text-[10px] text-gray-500">
                      LP tokens destroyed in the same tx as pool init. Nobody —
                      including you — can withdraw the pooled liquidity. Trade-off:
                      you forfeit future LP fees (marginal on memecoins).
                    </div>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-xs text-gray-300">
                  <input
                    type="radio"
                    name="lp-disposition"
                    checked={lpDisposition === "keep"}
                    onChange={() => setLpDisposition("keep")}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium">Keep LP in creator wallet</span>{" "}
                    <span className="text-gray-500">(legacy — for serious projects)</span>
                    <div className="text-[10px] text-gray-500">
                      LP tokens stay liquid in the creator wallet. RugCheck/DEXTools
                      will flag &ldquo;LP Not Locked&rdquo; until you lock or burn
                      them off-platform.
                    </div>
                  </span>
                </label>
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

              <div className="flex gap-2">
                <button
                  onClick={handleLaunch}
                  disabled={
                    launching ||
                    !tokenMint.trim() ||
                    !creatorWalletId ||
                    !solLiquidity ||
                    !tokenLiquidity
                  }
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-md text-sm font-medium transition-colors"
                >
                  {launching ? "Launching..." : "Launch Bundle"}
                </button>
                <button
                  onClick={handleSaveAsTask}
                  disabled={!tokenMint.trim() || !creatorWalletId}
                  title="Save current config as a reusable template (see /tasks)"
                  className="px-3 py-2.5 bg-offivex-purple/15 hover:bg-offivex-purple/25 disabled:opacity-50 rounded-md text-sm font-medium text-offivex-purple-light transition-colors"
                >
                  Save as Task
                </button>
              </div>
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
              <div className="text-center py-8 px-4 border border-dashed border-gray-700 rounded-lg">
                <div className="text-3xl mb-2 opacity-50">🚀</div>
                <p className="text-gray-300 text-sm font-medium mb-1">
                  No bundles launched yet
                </p>
                <p className="text-gray-500 text-xs leading-relaxed">
                  Configure your first launch in the panel above — pick a token
                  mint, set liquidity + Jito tip, then click <span className="font-medium text-gray-300">Launch Bundle</span>.
                </p>
              </div>
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
