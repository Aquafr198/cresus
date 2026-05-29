"use client";

import { FormEvent, useState } from "react";
import { AlertTriangle, KeyRound, Loader2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";

/// Admin-side rotation of the wallet vault master password.
///
/// What this does: the backend re-derives a fresh MEK from the new password,
/// then in a single SQL transaction it re-encrypts the seed phrase + every
/// wallet secret. The vault must currently be unlocked (the data plane
/// would refuse anyway). Atomic on success — partial-rotation failures
/// roll back and leave the OLD password working.
export default function AdminSecurityPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword.length < 12) {
      setError("New password must be at least 12 characters.");
      return;
    }
    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError("New password must contain at least one letter and one digit.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("New password must differ from the current one.");
      return;
    }

    setSubmitting(true);
    try {
      await api.admin.changeMasterPassword(currentPassword, newPassword);
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 400 || e.status === 401) {
          setError(e.message || "Wrong current password.");
        } else if (e.status === 403) {
          setError(
            "Vault is locked. Unlock it from the user app first, then come back.",
          );
        } else {
          setError(e.message || `Rotation failed (HTTP ${e.status}).`);
        }
      } else {
        setError("Unexpected error. Try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <div className="text-[11px] uppercase tracking-[0.2em] text-offivex-purple-light mb-1">
          Security
        </div>
        <h1 className="font-display text-3xl font-semibold tracking-tight mb-2">
          Master password
        </h1>
        <p className="text-sm text-offivex-text-secondary leading-relaxed">
          Rotate the wallet vault master password. The backend re-encrypts the
          seed phrase and every wallet secret in a single transaction.
        </p>
      </div>

      {/* Warning panel */}
      <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-4 flex gap-3">
        <AlertTriangle
          size={18}
          className="text-amber-300 flex-shrink-0 mt-0.5"
          aria-hidden
        />
        <div className="text-sm text-amber-100/90 leading-relaxed space-y-1.5">
          <p>
            <strong>Read this before changing the password.</strong>
          </p>
          <ul className="list-disc pl-5 space-y-1 text-amber-100/80 text-[13px]">
            <li>
              The vault must already be <strong>unlocked</strong>. If
              you&apos;re seeing a lock screen on the user app, unlock it
              first.
            </li>
            <li>
              This rotation re-encrypts every wallet. With N wallets it takes
              ~Argon2 derive time (≈0.3 s) + N short DB writes — usually under
              a few seconds even at hundreds of wallets.
            </li>
            <li>
              The operation is <strong>atomic</strong>. If it fails mid-way,
              nothing changes and the current password still works. Keep this
              page open until you see the success message.
            </li>
            <li>
              Your <strong>seed phrase doesn&apos;t change</strong> — only
              the password protecting it does. Your existing seed phrase
              backup stays valid.
            </li>
          </ul>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-200 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 px-4 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-sm flex items-center gap-2">
          <KeyRound size={16} strokeWidth={1.75} aria-hidden />
          Master password rotated. The new password is active immediately —
          you and any future unlock screens will need it.
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-6 space-y-5"
      >
        <div>
          <label className="block text-[11px] text-offivex-text-muted mb-1.5 uppercase tracking-wider">
            Current master password
          </label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="Enter the current password"
            className="w-full px-3.5 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-offivex-text-primary placeholder-offivex-text-muted focus:outline-none focus:border-offivex-purple/50 focus:bg-white/[0.05] transition-colors text-sm"
          />
        </div>

        <div>
          <label className="block text-[11px] text-offivex-text-muted mb-1.5 uppercase tracking-wider">
            New master password
          </label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="Min 12 chars, letters + digits"
            className="w-full px-3.5 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-offivex-text-primary placeholder-offivex-text-muted focus:outline-none focus:border-offivex-purple/50 focus:bg-white/[0.05] transition-colors text-sm"
          />
        </div>

        <div>
          <label className="block text-[11px] text-offivex-text-muted mb-1.5 uppercase tracking-wider">
            Confirm new password
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="Re-enter the new password"
            className="w-full px-3.5 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-offivex-text-primary placeholder-offivex-text-muted focus:outline-none focus:border-offivex-purple/50 focus:bg-white/[0.05] transition-colors text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={
            submitting ||
            !currentPassword ||
            !newPassword ||
            !confirmPassword
          }
          className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg btn-purple text-sm disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <>
              <Loader2 size={16} className="animate-spin" aria-hidden />
              Re-encrypting vault…
            </>
          ) : (
            <>
              <KeyRound size={16} strokeWidth={1.75} aria-hidden />
              Rotate master password
            </>
          )}
        </button>
      </form>
    </div>
  );
}
