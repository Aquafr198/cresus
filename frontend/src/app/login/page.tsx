"use client";

import { FormEvent, useEffect, useState, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError, USER_API_KEY_STORAGE, userApi } from "@/lib/api";

const KEY_REGEX = /^ofx_live_[a-zA-Z0-9]{32}$/;

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const reason = params.get("reason");

  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [masterPassword, setMasterPassword] = useState("");
  /// `null` = loading the vault state, `false` = backend is unlocked
  /// (only API key needed), `true` = backend is locked (we surface a
  /// second field so login + unlock happen in one submit).
  const [needsUnlock, setNeedsUnlock] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(
    reason === "plan_expired"
      ? "Your plan has expired. Contact your admin via Telegram to renew."
      : reason === "key_invalid"
        ? "Your previous API key is no longer valid. Sign in with your new key."
        : null,
  );

  // Discover whether the backend vault is locked. If yes we render an extra
  // master-password field so the user does login + unlock in a single submit
  // — no more bouncing between /login and the AuthGate unlock screen.
  useEffect(() => {
    let cancelled = false;
    api.auth.status()
      .then((r) => {
        if (cancelled) return;
        // `password_set === false` means the backend hasn't been
        // bootstrapped — that's a separate one-time admin flow handled
        // by AuthGate's setup screen. For login we treat it as "unlocked"
        // so the user can at least paste their API key; AuthGate will
        // route them to setup if needed.
        setNeedsUnlock(r.data.password_set && !r.data.unlocked);
      })
      .catch(() => {
        // Backend unreachable — degrade gracefully to API-key-only form.
        // AuthGate will surface the proper "service warming up" screen
        // after login.
        if (!cancelled) setNeedsUnlock(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const k = apiKey.trim();
    if (!k) {
      setError("Paste your API key.");
      return;
    }
    if (!KEY_REGEX.test(k)) {
      if (k.length < 41) {
        const isPrefix = /^ofx_live_[a-zA-Z0-9]{0,32}$/.test(k);
        if (isPrefix && k.length === 17) {
          setError(
            "That's the prefix (17 chars), not the full key. The prefix shown in the admin panel only identifies the key — the FULL key (41 chars) is shown ONCE in the reveal modal after Grant or Rotate. Ask admin to rotate if lost.",
          );
        } else {
          setError(
            `Key looks truncated: got ${k.length} chars, expected 41 (ofx_live_ + 32 random chars). Make sure to copy the FULL key shown after Grant/Rotate.`,
          );
        }
      } else if (k.length > 41) {
        setError(
          `Got ${k.length} chars, expected 41. Did you paste extra content (the .txt header maybe)? The key alone is: ofx_live_<32 chars>.`,
        );
      } else if (!k.startsWith("ofx_live_")) {
        setError('Key must start with "ofx_live_" — check what you pasted.');
      } else {
        setError(
          "Invalid characters in key. Only letters and digits are allowed after ofx_live_.",
        );
      }
      return;
    }

    if (needsUnlock && !masterPassword) {
      setError("Enter the master password to unlock the vault.");
      return;
    }

    setSubmitting(true);

    // Step 1 — unlock the vault if needed. We do this BEFORE storing the
    // API key so a bad master password doesn't leave a stale key behind.
    if (needsUnlock) {
      try {
        await api.auth.unlock(masterPassword);
      } catch (e) {
        if (e instanceof ApiError) {
          if (e.status === 401 || e.status === 403) {
            setError("Wrong master password.");
          } else if (e.status === 429) {
            setError("Too many unlock attempts. Wait a minute before trying again.");
          } else {
            setError(e.message || `Unlock failed (HTTP ${e.status})`);
          }
        } else {
          setError("Could not reach the server. Check your connection.");
        }
        setSubmitting(false);
        return;
      }
      // Vault is now unlocked; future requests this session won't need it.
      setNeedsUnlock(false);
    }

    // Step 2 — store the API key so userApi.me() picks it up in the
    // Bearer header.
    if (typeof window !== "undefined") {
      window.localStorage.setItem(USER_API_KEY_STORAGE, k);
    }

    // Step 3 — validate via /user/me and land on the dashboard.
    try {
      await userApi.me();
      router.replace("/");
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 401) {
          if (typeof window !== "undefined") {
            window.localStorage.removeItem(USER_API_KEY_STORAGE);
          }
          setError("Invalid API key. Check the key your admin sent you.");
        } else if (e.status === 402) {
          setError(
            "Your API key is valid, but you have no active plan. Contact your admin on Telegram to renew.",
          );
        } else if (e.status === 503) {
          setError(
            "Service warming up. We'll auto-retry in a few seconds — or try again now.",
          );
        } else if (e.status >= 500) {
          setError(
            `Server error (HTTP ${e.status}). The team has been notified. Try again in a moment.`,
          );
        } else if (e.status === 429) {
          setError("Too many sign-in attempts. Wait a minute before trying again.");
        } else {
          setError(e.message || `Unexpected error (HTTP ${e.status})`);
        }
      } else if (
        e instanceof TypeError ||
        (e instanceof Error && /fetch|network|failed to fetch/i.test(e.message))
      ) {
        setError(
          "Cannot reach the server. Check your internet connection, then try again.",
        );
      } else {
        setError("Unexpected error. Try again.");
      }
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6"
    >
      {error && (
        <div className="mb-4 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-200 text-sm">
          {error}
        </div>
      )}

      <label className="block text-[11px] text-offivex-text-muted mb-1.5 uppercase tracking-wider">
        API key
      </label>
      <div className="relative">
        <input
          type={showKey ? "text" : "password"}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          placeholder="ofx_live_…"
          className="w-full px-3.5 py-2.5 pr-16 rounded-lg bg-white/[0.03] border border-white/[0.08] text-offivex-text-primary placeholder-offivex-text-muted focus:outline-none focus:border-offivex-purple/50 focus:bg-white/[0.05] transition-colors font-mono text-sm"
        />
        <button
          type="button"
          onClick={() => setShowKey((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded text-xs text-offivex-text-muted hover:text-white"
        >
          {showKey ? "Hide" : "Show"}
        </button>
      </div>

      {needsUnlock && (
        <>
          <div className="mt-5 mb-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-200 text-[11px] leading-relaxed">
            The wallet vault is locked on this server. Enter the master
            password to unlock it in the same step.
          </div>
          <label className="block text-[11px] text-offivex-text-muted mb-1.5 uppercase tracking-wider">
            Master password
          </label>
          <input
            type="password"
            value={masterPassword}
            onChange={(e) => setMasterPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="Enter your master password"
            className="w-full px-3.5 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-offivex-text-primary placeholder-offivex-text-muted focus:outline-none focus:border-offivex-purple/50 focus:bg-white/[0.05] transition-colors text-sm"
          />
        </>
      )}

      <button
        type="submit"
        disabled={submitting || needsUnlock === null}
        className="w-full mt-4 py-2.5 rounded-lg btn-purple text-sm disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {submitting
          ? needsUnlock
            ? "Unlocking & signing in…"
            : "Signing in…"
          : needsUnlock
            ? "Unlock & sign in"
            : "Sign in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-offivex-bg-base text-offivex-text-primary flex flex-col items-center px-6 py-12">
      <Link href="/" className="inline-flex items-center gap-3 mb-10">
        <Image src="/logo.png" alt="Offivex" width={48} height={40} priority />
      </Link>

      <div className="w-full max-w-sm">
        <div className="text-center mb-7">
          <div className="text-[11px] uppercase tracking-[0.2em] text-offivex-purple-light mb-1">
            Sign in
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Welcome back
          </h1>
          <p className="text-sm text-offivex-text-secondary mt-2 leading-relaxed">
            Paste the API key you received after payment confirmation.
          </p>
        </div>

        <Suspense
          fallback={
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 text-sm text-offivex-text-muted">
              Loading…
            </div>
          }
        >
          <LoginForm />
        </Suspense>

        <div className="mt-6 text-center text-sm text-offivex-text-secondary">
          Don&apos;t have an API key?{" "}
          <Link
            href="/apply"
            className="text-offivex-purple-light hover:text-white transition-colors font-medium"
          >
            Apply for access
          </Link>
        </div>

        <div className="mt-8 pt-6 border-t border-white/[0.04]">
          <p className="text-xs text-offivex-text-muted leading-relaxed text-center">
            Your API key was shown once on the payment confirmation page. If you
            lost it, contact your admin on Telegram to rotate.
          </p>
        </div>
      </div>
    </div>
  );
}
