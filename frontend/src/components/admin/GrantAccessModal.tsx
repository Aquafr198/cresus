"use client";

import { useState } from "react";
import { api, ApiError, type GrantAccessResult } from "@/lib/api";

interface GrantAccessModalProps {
  userId: string;
  /** Optional display info shown in the modal header */
  subtitle?: string;
  /** Hint plan to preselect (e.g. from apply.plan_pref) */
  initialPlan?: "monthly" | "yearly";
  onClose: () => void;
  onGranted?: (result: GrantAccessResult) => void;
}

/**
 * Shared modal for admin "Grant access" action. Used from /admin/applies
 * (after approve) and /admin/users/[id]. Handles the full grant flow:
 *  - plan selector
 *  - grant call
 *  - reveal of one-shot plaintext API key (only if backend returns it)
 *  - copy + download key
 */
export function GrantAccessModal({
  userId,
  subtitle,
  initialPlan = "monthly",
  onClose,
  onGranted,
}: GrantAccessModalProps) {
  const [plan, setPlan] = useState<"monthly" | "yearly">(initialPlan);
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<GrantAccessResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAck, setSavedAck] = useState(false);
  const [copied, setCopied] = useState(false);

  // Wrap the parent's `onClose` so the plaintext API key never lingers in
  // React state after the modal closes. Pre-refactor the `result` state
  // held `api_key_plaintext` for the full lifetime of the component and
  // remained inspectable via the React DevTools "Components" tab — a
  // shoulder-surfer with a screen-share session could still pull the key
  // after the admin clicked Done. Wiping `result` + `copied` on close
  // closes that window (the GC can then reclaim the heap allocation).
  const handleClose = () => {
    setResult(null);
    setError(null);
    setCopied(false);
    setSavedAck(false);
    onClose();
  };

  const onGrant = async () => {
    setCreating(true);
    setError(null);
    try {
      const r = await api.admin.grantAccess(userId, plan);
      setResult(r.data);
      onGranted?.(r.data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Grant failed");
    } finally {
      setCreating(false);
    }
  };

  const copyKey = async (key: string) => {
    if (typeof navigator === "undefined") return;
    try {
      await navigator.clipboard.writeText(key);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const downloadKey = (key: string) => {
    if (typeof window === "undefined") return;
    const content = `Offivex API key (KEEP SAFE — cannot be recovered)\nGenerated: ${new Date().toISOString()}\nPlan: ${result?.subscription.plan_name}\n\n${key}\n`;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `offivex-api-key-${key.slice(0, 17)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-50"
      onClick={() => handleClose()}
    >
      <div
        className="bg-offivex-bg-base border border-white/[0.10] rounded-2xl p-6 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-lg font-semibold mb-1 tracking-tight">
          Grant access
        </h2>
        {subtitle && (
          <p className="text-sm text-offivex-text-secondary mb-5">{subtitle}</p>
        )}

        {!result ? (
          <>
            <label className="block text-[11px] uppercase tracking-wider text-offivex-text-muted mb-1.5">
              Plan
            </label>
            <div className="grid grid-cols-2 gap-2 mb-5">
              {(["monthly", "yearly"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPlan(p)}
                  className={
                    "px-3 py-2.5 rounded-lg text-sm transition-colors border " +
                    (plan === p
                      ? "bg-offivex-purple/15 border-offivex-purple/40 text-white"
                      : "bg-white/[0.03] border-white/[0.08] text-offivex-text-secondary hover:border-white/[0.16]")
                  }
                >
                  <div className="font-medium capitalize">{p}</div>
                  <div className="text-xs text-offivex-text-muted mt-0.5">
                    {p === "monthly" ? "30 days" : "365 days"}
                  </div>
                </button>
              ))}
            </div>

            <div className="px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs mb-4">
              <strong>Note:</strong> this grants access without payment (comped /
              free). If the user already has an active API key, it stays valid and
              the subscription is just extended.
            </div>

            {error && (
              <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-200 text-xs">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={handleClose}
                className="px-4 py-2 rounded-lg text-sm text-offivex-text-secondary hover:text-white border border-white/[0.10] hover:border-white/[0.20] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onGrant}
                disabled={creating}
                className="px-4 py-2 rounded-lg text-sm btn-purple disabled:opacity-60"
              >
                {creating ? "Granting…" : `Grant ${plan}`}
              </button>
            </div>
          </>
        ) : (
          // Result rendering — branches on whether plaintext was revealed
          <>
            <div className="px-3 py-2.5 rounded-lg bg-offivex-green/10 border border-offivex-green/30 text-offivex-green-light text-xs mb-4">
              ✓ Subscription active until{" "}
              {result.subscription.expires_at
                ? new Date(result.subscription.expires_at * 1000).toLocaleString()
                : "—"}
            </div>

            {result.new_key_revealed && result.api_key_plaintext ? (
              <>
                <div className="px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-200 text-xs mb-4">
                  <strong>⚠ This key is shown ONCE.</strong> Copy it now and DM
                  it to the user on Telegram. We cannot recover it.
                </div>

                <div className="mb-3">
                  <div className="text-[11px] uppercase tracking-wider text-offivex-text-muted mb-1.5">
                    User API key
                  </div>
                  <div className="font-mono text-sm bg-black/40 border border-white/[0.10] rounded-lg p-3 break-all">
                    {result.api_key_plaintext}
                  </div>
                </div>

                <div className="flex gap-2 mb-5">
                  <button
                    onClick={() => copyKey(result.api_key_plaintext!)}
                    className="flex-1 px-3 py-2 rounded-md text-xs bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] transition-colors"
                  >
                    {copied ? "✓ Copied" : "📋 Copy key"}
                  </button>
                  <button
                    onClick={() => downloadKey(result.api_key_plaintext!)}
                    className="flex-1 px-3 py-2 rounded-md text-xs bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] transition-colors"
                  >
                    ⬇ Download .txt
                  </button>
                </div>

                <label className="flex items-center gap-2 mb-5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={savedAck}
                    onChange={(e) => setSavedAck(e.target.checked)}
                    className="w-4 h-4 rounded border-white/20 bg-white/[0.05]"
                  />
                  <span className="text-xs text-offivex-text-secondary">
                    I have saved the key and sent it to the user
                  </span>
                </label>

                <button
                  onClick={handleClose}
                  disabled={!savedAck}
                  className={
                    "w-full py-2.5 rounded-lg text-sm transition-colors " +
                    (savedAck
                      ? "btn-purple"
                      : "bg-white/[0.04] border border-white/[0.06] text-offivex-text-muted cursor-not-allowed")
                  }
                >
                  Done
                </button>
              </>
            ) : (
              <>
                <div className="text-sm text-offivex-text-secondary mb-2">
                  User already had an active API key — it stays valid.
                </div>
                <div className="mb-5">
                  <div className="text-[11px] uppercase tracking-wider text-offivex-text-muted mb-1">
                    Existing key prefix
                  </div>
                  <div className="font-mono text-sm text-offivex-text-primary">
                    {result.key_prefix}…
                  </div>
                </div>
                <button
                  onClick={handleClose}
                  className="w-full py-2.5 rounded-lg btn-purple text-sm"
                >
                  Done
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
