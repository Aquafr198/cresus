"use client";

import { useEffect, useState, useRef } from "react";
import { api, ApiError } from "@/lib/api";
import { useSWR } from "@/lib/swr";
import { VanityTask } from "@/lib/types";
import { useToast } from "@/components/ui/ToastProvider";
import { SolscanButton } from "@/components/ui/SolscanButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useClaimActiveMint } from "@/components/launch/LaunchContext";

export default function MintPage() {
  const toast = useToast();
  // Shared SWR cache keys with /wallets and /bundle pages → instant nav.
  const wSwr = useSWR("wallets.list", () => api.wallets.list().then((r) => r.data));
  const tSwr = useSWR("tokens.list", () => api.tokens.list().then((r) => r.data));
  const wallets = wSwr.data ?? [];
  const tokens = tSwr.data ?? [];
  const loading = wSwr.isLoading || tSwr.isLoading;
  const [error, setError] = useState<string | null>(null);

  // Mint form
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [decimals, setDecimals] = useState("9");
  const [supply, setSupply] = useState("");
  const [metadataUri, setMetadataUri] = useState("");
  const [creatorWalletId, setCreatorWalletId] = useState("");
  // Inline metadata (auto-pinned). Mutually exclusive with metadataUri.
  const [showSocial, setShowSocial] = useState(false);
  const [description, setDescription] = useState("");
  const [imageUri, setImageUri] = useState("");
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [website, setWebsite] = useState("");
  const [minting, setMinting] = useState(false);
  // Anti-rug defaults — these are the configuration that lets the freshly
  // minted token pass DEXTools/RugCheck audits out of the box. Both can be
  // overridden via the "Authority" toggles below.
  const [keepFreezeAuthority, setKeepFreezeAuthority] = useState(false);
  const [autoRevokeMintAuthority, setAutoRevokeMintAuthority] = useState(true);
  const [mintResult, setMintResult] = useState<{
    mint_address: string;
    tx_signature: string;
    /// True when `autoRevokeMintAuthority` was on at submission — the API
    /// already revoked atomically, so the post-mint "Revoke" button should
    /// be hidden / disabled.
    auto_revoked: boolean;
  } | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [postMintRevoked, setPostMintRevoked] = useState(false);
  /// Per-row revoke from the "Recent Tokens" list — tracks the mint
  /// address currently being revoked so we can disable just that row's
  /// button instead of a global flag.
  const [revokingMint, setRevokingMint] = useState<string | null>(null);
  /// Mints revoked during this session (post-mint, from the Recent Tokens
  /// list). We don't refetch chain state — once the API confirms a
  /// successful revoke, the row's button hides for the rest of the session.
  const [sessionRevokedMints, setSessionRevokedMints] = useState<Set<string>>(
    () => new Set(),
  );
  /// Generic confirm dialog used for all destructive in-page actions on
  /// /mint (currently only post-mint revoke). Replaces the legacy
  /// window.confirm() which was visually inconsistent with /bundle.
  const [confirmDialog, setConfirmDialog] = useState<null | {
    title: string;
    message: string;
    onConfirm: () => void;
  }>(null);

  // Quick-sell focus: when the mint result modal is showing, this freshly
  // minted token is what the keybind targets.
  useClaimActiveMint(mintResult?.mint_address ?? null, symbol || name || null);

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
  const vanityPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-select first wallet on initial load.
  useEffect(() => {
    if (wallets.length > 0 && !creatorWalletId) {
      setCreatorWalletId(wallets[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallets.length]);

  // Task prefill — when the user clicks "Execute" on a saved Mint Task
  // template, /tasks stashes the blob in sessionStorage and navigates
  // here. We re-fill the form on mount, then clear the key so a refresh
  // doesn't double-apply.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const KEY = "offivex.task-prefill.mint_template";
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return;
    try {
      const blob = JSON.parse(raw) as Record<string, unknown>;
      if (typeof blob.name === "string") setName(blob.name);
      if (typeof blob.symbol === "string") setSymbol(blob.symbol);
      if (typeof blob.decimals === "string") setDecimals(blob.decimals);
      if (typeof blob.supply === "string") setSupply(blob.supply);
      if (typeof blob.metadataUri === "string") setMetadataUri(blob.metadataUri);
      if (typeof blob.creatorWalletId === "string")
        setCreatorWalletId(blob.creatorWalletId);
      if (typeof blob.description === "string") setDescription(blob.description);
      if (typeof blob.imageUri === "string") setImageUri(blob.imageUri);
      if (typeof blob.twitter === "string") setTwitter(blob.twitter);
      if (typeof blob.telegram === "string") setTelegram(blob.telegram);
      if (typeof blob.website === "string") setWebsite(blob.website);
      if (blob.showSocial) setShowSocial(true);
      if (typeof blob.keepFreezeAuthority === "boolean")
        setKeepFreezeAuthority(blob.keepFreezeAuthority);
      if (typeof blob.autoRevokeMintAuthority === "boolean")
        setAutoRevokeMintAuthority(blob.autoRevokeMintAuthority);
      toast.info("Template loaded — review and click Mint when ready", 4000);
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
        name || symbol || "Mint template",
      ) ?? undefined;
    try {
      await api.tasks.create({
        task_type: "mint_template",
        label,
        config_blob: {
          name,
          symbol,
          decimals,
          supply,
          metadataUri,
          creatorWalletId,
          description,
          imageUri,
          twitter,
          telegram,
          website,
          showSocial,
          keepFreezeAuthority,
          autoRevokeMintAuthority,
        },
      });
      toast.success("Saved as template — see /tasks", 4000);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      toast.error(`Save failed: ${msg}`, 6000);
    }
  };

  // Surface SWR errors via the existing `error` banner / state.
  useEffect(() => {
    const e = wSwr.error ?? tSwr.error;
    if (e instanceof ApiError) setError(e.message);
    else if (e) setError("Failed to load data");
    else setError(null);
  }, [wSwr.error, tSwr.error]);

  // Re-trigger both fetches (called after mint succeeds, etc.). The two
  // mutate() calls run in parallel — SWR's dedupingInterval prevents a
  // double-fire if a render races us.
  const fetchData = () => {
    void wSwr.mutate();
    void tSwr.mutate();
  };

  // Poll vanity task status — audit P3 PERF-6 + POST-4 final.
  // Self-scheduling setTimeout with ±500ms jitter.
  //
  // POST-4 — if the status endpoint fails 3 consecutive times we stop polling
  // and surface a clear error so the user can retry rather than seeing
  // "Grinding..." forever.
  useEffect(() => {
    if (!vanityTaskId) return;
    let stopped = false;
    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_FAILURES = 3;

    const poll = async () => {
      if (stopped) return;
      try {
        const res = await api.tokens.vanityStatus(vanityTaskId);
        consecutiveFailures = 0; // reset on success
        setVanityTask(res.data);
        if (res.data.status === "completed" || res.data.status === "failed") {
          setVanityGrinding(false);
          stopped = true;
          if (vanityPollRef.current) {
            clearTimeout(vanityPollRef.current);
            vanityPollRef.current = null;
          }
          return;
        }
      } catch (e) {
        consecutiveFailures += 1;
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          stopped = true;
          setVanityGrinding(false);
          if (vanityPollRef.current) {
            clearTimeout(vanityPollRef.current);
            vanityPollRef.current = null;
          }
          const msg =
            e instanceof ApiError
              ? `Vanity grinding stalled (${e.message}). Refresh to retry.`
              : "Vanity grinding stalled — check your connection. Refresh to retry.";
          setError(msg);
          toast.error(msg);
          return;
        }
        // transient failure — retry next tick
      }
      if (!stopped) {
        const delay = 2000 + (Math.random() - 0.5) * 1000;
        vanityPollRef.current = setTimeout(poll, delay);
      }
    };

    poll();

    return () => {
      stopped = true;
      if (vanityPollRef.current) {
        clearTimeout(vanityPollRef.current);
        vanityPollRef.current = null;
      }
    };
  }, [vanityTaskId]);

  const handleMint = async () => {
    if (!name.trim() || !symbol.trim() || !supply || !creatorWalletId) return;
    const hasInline =
      !!description.trim() ||
      !!imageUri.trim() ||
      !!twitter.trim() ||
      !!telegram.trim() ||
      !!website.trim();
    if (hasInline && metadataUri.trim()) {
      setError("Use Metadata URI OR the social fields, not both.");
      return;
    }
    setMinting(true);
    setError(null);
    setMintResult(null);
    setPostMintRevoked(false);
    try {
      const res = await api.tokens.mint({
        name: name.trim(),
        symbol: symbol.trim(),
        decimals: parseInt(decimals) || 9,
        supply: parseInt(supply),
        metadata_uri: metadataUri.trim() || undefined,
        creator_wallet_id: creatorWalletId,
        description: description.trim() || undefined,
        image_uri: imageUri.trim() || undefined,
        twitter: twitter.trim() || undefined,
        telegram: telegram.trim() || undefined,
        website: website.trim() || undefined,
        keep_freeze_authority: keepFreezeAuthority,
        revoke_mint_authority: autoRevokeMintAuthority,
      });
      setMintResult({
        mint_address: res.data.mint_address,
        tx_signature: res.data.tx_signature,
        auto_revoked: autoRevokeMintAuthority,
      });
      setName("");
      setSymbol("");
      setDecimals("9");
      setSupply("");
      setMetadataUri("");
      setDescription("");
      setImageUri("");
      setTwitter("");
      setTelegram("");
      setWebsite("");
      fetchData();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Minting failed");
    } finally {
      setMinting(false);
    }
  };

  const handleRevokeMintAuthority = () => {
    if (!mintResult) return;
    const mintAddr = mintResult.mint_address;
    setConfirmDialog({
      title: "Revoke mint authority",
      message: [
        `Mint: ${mintAddr.slice(0, 8)}…${mintAddr.slice(-4)}`,
        ``,
        `This locks the supply FOREVER — no more tokens of this mint can ever`,
        `be created. The same lock RugCheck and DEXTools flip from`,
        `"Mint Authority: Not Revoked" 🚨 to "Locked" ✓.`,
        ``,
        `Cannot be undone.`,
      ].join("\n"),
      onConfirm: () => {
        setConfirmDialog(null);
        void executeRevoke(mintAddr, { fromResultModal: true });
      },
    });
  };

  /// Per-token revoke triggered from the Recent Tokens list. Same backend
  /// call, different UI state path (each row tracks its own loading +
  /// revoked indicator so the user can revoke several tokens in a row).
  const handleRevokeFromList = (mintAddr: string, label: string) => {
    setConfirmDialog({
      title: "Revoke mint authority",
      message: [
        `Token: ${label}`,
        `Mint:  ${mintAddr.slice(0, 8)}…${mintAddr.slice(-4)}`,
        ``,
        `This locks the supply FOREVER — no more tokens of this mint can ever`,
        `be created. Required to pass RugCheck/DEXTools "Mint Authority`,
        `Revoked" check on tokens minted before auto-revoke existed.`,
        ``,
        `Cannot be undone.`,
      ].join("\n"),
      onConfirm: () => {
        setConfirmDialog(null);
        void executeRevoke(mintAddr, { fromResultModal: false });
      },
    });
  };

  /// Shared executor for both revoke paths (result modal + per-row).
  /// `fromResultModal=true` flips the modal's banner; `false` adds the
  /// mint to the session-revoked set so the list row hides its button.
  const executeRevoke = async (
    mintAddr: string,
    opts: { fromResultModal: boolean },
  ) => {
    if (opts.fromResultModal) {
      setRevoking(true);
    } else {
      setRevokingMint(mintAddr);
    }
    setError(null);
    try {
      await api.tokens.revokeMintAuthority(mintAddr);
      if (opts.fromResultModal) {
        setPostMintRevoked(true);
      } else {
        setSessionRevokedMints((prev) => {
          const next = new Set(prev);
          next.add(mintAddr);
          return next;
        });
      }
      toast.success("Mint authority revoked — supply is locked");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      setError(`Revoke failed: ${msg}`);
      toast.error(`Revoke failed: ${msg}`);
    } finally {
      if (opts.fromResultModal) {
        setRevoking(false);
      } else {
        setRevokingMint(null);
      }
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

      {confirmDialog && (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          variant="warning"
          confirmText="Revoke"
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}

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
            <div className="flex items-center gap-2">
              <span className="text-gray-400">Mint: </span>
              <span className="font-mono text-xs">{mintResult.mint_address}</span>
              <SolscanButton address={mintResult.mint_address} size={14} />
            </div>
            <div>
              <span className="text-gray-400">Tx: </span>
              <span className="font-mono text-xs">{mintResult.tx_signature}</span>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            {mintResult.auto_revoked || postMintRevoked ? (
              <span className="text-xs text-emerald-300">
                ✓ Mint authority revoked — supply locked
              </span>
            ) : (
              <>
                <button
                  onClick={handleRevokeMintAuthority}
                  disabled={revoking}
                  title="Lock the supply forever — passes DEXTools/RugCheck 'Mint Authority Revoked' check"
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded text-xs font-medium"
                >
                  {revoking ? "Revoking..." : "Revoke Mint Authority (recommended)"}
                </button>
                <span className="text-[11px] text-amber-300/80">
                  Supply is still mutable. Revoke to pass DEXTools/RugCheck.
                </span>
              </>
            )}
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
                <p className="mt-1 text-[10px] text-gray-500">
                  Pre-pinned Metaplex JSON. Leave empty to fill the social
                  fields below — we&apos;ll build + pin the JSON for you.
                </p>
              </div>

              {/* Inline social metadata (auto-pinned) */}
              <div className="rounded-md border border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowSocial((v) => !v)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-gray-300 hover:bg-gray-800/50"
                >
                  <span>Social metadata (auto-pinned to IPFS)</span>
                  <span className="text-gray-500">{showSocial ? "−" : "+"}</span>
                </button>
                {showSocial && (
                  <div className="space-y-3 border-t border-gray-800 p-3">
                    <div>
                      <label className="mb-1 block text-xs text-gray-400">
                        Description
                      </label>
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={2}
                        maxLength={1000}
                        placeholder="A one-paragraph description of your token."
                        className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-gray-400">
                        Image URL
                      </label>
                      <input
                        value={imageUri}
                        onChange={(e) => setImageUri(e.target.value)}
                        placeholder="https://gateway.pinata.cloud/ipfs/... (upload via /meme-library first)"
                        className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-xs text-gray-400">
                          Twitter / X
                        </label>
                        <input
                          value={twitter}
                          onChange={(e) => setTwitter(e.target.value)}
                          placeholder="https://x.com/..."
                          className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-gray-400">
                          Telegram
                        </label>
                        <input
                          value={telegram}
                          onChange={(e) => setTelegram(e.target.value)}
                          placeholder="https://t.me/..."
                          className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-gray-400">
                          Website
                        </label>
                        <input
                          value={website}
                          onChange={(e) => setWebsite(e.target.value)}
                          placeholder="https://yourtoken.io"
                          className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}
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

              <div className="rounded-md border border-gray-800 p-3 space-y-2 bg-gray-950/40">
                <div className="text-[11px] font-medium text-gray-300">
                  Authority (anti-rug — defaults pass DEXTools / RugCheck)
                </div>
                <label className="flex items-start gap-2 text-xs text-gray-300">
                  <input
                    type="checkbox"
                    checked={autoRevokeMintAuthority}
                    onChange={(e) => setAutoRevokeMintAuthority(e.target.checked)}
                    className="mt-0.5 rounded bg-gray-800 border-gray-700"
                  />
                  <span>
                    <span className="font-medium">Auto-revoke mint authority</span>{" "}
                    <span className="text-gray-500">(default ON)</span>
                    <div className="text-[10px] text-gray-500">
                      Atomically removes the &ldquo;creator can mint more
                      tokens&rdquo; flag at launch. Uncheck only if you want a
                      mutable supply.
                    </div>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-xs text-gray-300">
                  <input
                    type="checkbox"
                    checked={keepFreezeAuthority}
                    onChange={(e) => setKeepFreezeAuthority(e.target.checked)}
                    className="mt-0.5 rounded bg-gray-800 border-gray-700"
                  />
                  <span>
                    <span className="font-medium">Keep freeze authority</span>{" "}
                    <span className="text-gray-500">(default OFF)</span>
                    <div className="text-[10px] text-gray-500">
                      Opt-in only. With this ON, the creator wallet can freeze
                      any holder&rsquo;s tokens — RugCheck/DEXTools flag this
                      as a critical risk.
                    </div>
                  </span>
                </label>
                {keepFreezeAuthority && autoRevokeMintAuthority && (
                  <div className="text-[10px] text-amber-300/90 bg-amber-900/15 border border-amber-900/40 rounded p-2 leading-relaxed">
                    <span className="font-medium">Heads up:</span> mint
                    authority will be locked, but freeze authority stays
                    active. RugCheck/DEXTools will STILL flag this token as
                    &ldquo;Freeze Authority Not Revoked&rdquo;. Only keep
                    freeze on for regulated tokens or specific anti-bot use
                    cases — for memecoins you almost certainly want both
                    revoked.
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleMint}
                  disabled={
                    minting ||
                    !name.trim() ||
                    !symbol.trim() ||
                    !supply ||
                    !creatorWalletId
                  }
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-md text-sm font-medium transition-colors"
                >
                  {minting ? "Minting..." : "Mint Token"}
                </button>
                <button
                  onClick={handleSaveAsTask}
                  disabled={!name.trim() || !symbol.trim()}
                  title="Save current config as a reusable template (see /tasks)"
                  className="px-3 py-2.5 bg-offivex-purple/15 hover:bg-offivex-purple/25 disabled:opacity-50 rounded-md text-sm font-medium text-offivex-purple-light transition-colors"
                >
                  Save as Task
                </button>
              </div>
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
                {tokens.slice(0, 10).map((t) => {
                  const rowLabel =
                    t.symbol || t.name || `${t.mint_address.slice(0, 6)}…`;
                  const isRevoking = revokingMint === t.mint_address;
                  const isRevoked = sessionRevokedMints.has(t.mint_address);
                  return (
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
                      <div className="flex items-center gap-1.5">
                        <div className="text-xs text-gray-500 font-mono truncate flex-1">
                          {t.mint_address}
                        </div>
                        <SolscanButton address={t.mint_address} size={12} />
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        Supply: {t.supply} | Decimals: {t.decimals}
                      </div>
                      <div className="mt-1.5">
                        {isRevoked ? (
                          <span className="text-[10px] text-emerald-300">
                            ✓ Revoked this session
                          </span>
                        ) : (
                          <button
                            onClick={() =>
                              handleRevokeFromList(t.mint_address, rowLabel)
                            }
                            disabled={isRevoking || revoking}
                            title="Revoke mint authority — required for RugCheck/DEXTools pass on tokens minted before auto-revoke. No-op if the mint authority is already None."
                            className="text-[10px] px-2 py-0.5 bg-amber-900/30 hover:bg-amber-900/50 disabled:opacity-50 text-amber-300 rounded transition-colors"
                          >
                            {isRevoking ? "Revoking..." : "Revoke Mint Authority"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
