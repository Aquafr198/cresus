"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { api, ApiError, USER_API_KEY_STORAGE, userApi } from "@/lib/api";
import { LandingPage } from "@/components/landing/LandingPage";
import { Sidebar } from "@/components/layout/Sidebar";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { LaunchProvider } from "@/components/launch/LaunchContext";
import { QuickSellRoot } from "@/components/launch/QuickSellRoot";
import { LaunchWidget } from "@/components/launch/LaunchWidget";
import { PrivacyProvider } from "@/components/privacy/PrivacyProvider";

interface AuthGateProps {
  children: React.ReactNode;
}

const MARKETING_ROUTES = [
  "/pricing",
  "/login",
  "/signup",
  "/apply",
  "/forgot-password",
  "/verify-email",
  "/privacy",
  "/refund",
  "/terms",
  "/knowledge-base",
];

// Routes whose entire subtree is public (e.g., /docs, /docs/features, /docs/security ...)
// `/admin/*` is fully outside the user-side AuthGate — the admin panel has its
// own AdminGuard (see src/app/admin/layout.tsx).
// `/pay/*` and `/welcome` are public payment flow pages (invoice_id IS the auth).
const MARKETING_PREFIXES = ["/docs", "/knowledge-base", "/admin", "/pay", "/welcome"];

export function AuthGate({ children }: AuthGateProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isMarketingRoute =
    MARKETING_ROUTES.includes(pathname) ||
    MARKETING_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));

  // Optimisation critical-path: on `/` we render the landing immediately instead
  // of the "Connecting to Offivex..." spinner. The auth check still runs in the
  // background — if the user turns out to be authed, the effect will swap to
  // "unlocked" and the dashboard takes over. This trades a tiny flicker for
  // ~200-1200ms LCP improvement on the home page.
  const [state, setState] = useState<
    | "loading"
    | "landing"
    | "setup"
    | "locked"
    | "unlocked"
    | "seed-phrase"
    | "no_active_plan"
    | "service_locked"
  >(() => (pathname === "/" ? "landing" : "loading"));
  const [authReady, setAuthReady] = useState<"setup" | "locked" | null>(null);
  // Phase 6 — bumps every 30s while in service_locked to retry the /user/me check
  const [retryNonce, setRetryNonce] = useState(0);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [seedCopied, setSeedCopied] = useState(false);

  useEffect(() => {
    // Skip auth fetch entirely on marketing routes (purely client-side optimization;
    // the early-return below also short-circuits, but this prevents the network call too).
    if (isMarketingRoute) return;

    let cancelled = false;
    // Hard timeout: if the backend hangs or is unreachable, fall back to landing after 3s
    // instead of leaving the user stuck on "Connecting to Offivex...".
    const timer = setTimeout(() => {
      if (!cancelled) {
        setAuthReady("locked");
        setState((s) => (s === "loading" ? "landing" : s));
      }
    }, 3000);

    (async () => {
      // ── Step 1 — discover backend vault state (public endpoint, no key needed)
      // The Phase 6 user API key auth and the legacy wallet MEK lock are
      // orthogonal but BOTH gate the data plane (`require_api_key` AND
      // `require_unlocked`). If we skip the MEK check we end up rendering
      // `/wallets`, `/monitor`, `/mint` etc. only to have every fetch return
      // 403 — that's the bug this funnel fixes.
      let vault: { password_set: boolean; unlocked: boolean } | null = null;
      try {
        const status = await api.auth.status();
        vault = status.data;
      } catch {
        // Backend unreachable. Fall through to the legacy /user/me path so
        // the existing retry-on-503 loop kicks in.
      }

      const apiKey = typeof window !== "undefined"
        ? window.localStorage.getItem(USER_API_KEY_STORAGE)
        : null;

      // ── Step 2 — vault state branches ──────────────────────────────
      if (vault && !vault.password_set) {
        // Fresh install. Show setup screen unconditionally (no API key
        // required to bootstrap the master password — it gates the data
        // plane, not the setup itself).
        if (cancelled) return;
        clearTimeout(timer);
        setAuthReady("setup");
        setState("setup");
        return;
      }

      if (vault && !vault.unlocked) {
        // Password is set but the master key isn't loaded in memory.
        // On the root URL we still render the landing — bouncing visitors
        // straight to /login from `/` before they ever see the marketing
        // page was a regression (they couldn't even reach "Sign in" via
        // the landing CTA). On any other path we DO redirect, because
        // those pages need a live data plane to render meaningfully.
        // Marketing pages (incl. /login itself) are short-circuited at
        // the top of this effect, so this redirect never loops.
        if (cancelled) return;
        clearTimeout(timer);
        setAuthReady("locked");
        if (pathname === "/") {
          setState("landing");
        } else {
          router.replace("/login");
        }
        return;
      }

      // ── Step 3 — vault unlocked. Validate API key via /user/me. ────
      if (!apiKey) {
        if (cancelled) return;
        clearTimeout(timer);
        if (pathname === "/") {
          setState("landing");
        } else {
          router.replace("/login");
        }
        return;
      }

      try {
        await userApi.me();
        if (cancelled) return;
        clearTimeout(timer);
        setState("unlocked");
      } catch (e) {
        if (cancelled) return;
        clearTimeout(timer);
        if (e instanceof ApiError) {
          if (e.status === 401) {
            if (typeof window !== "undefined") {
              window.localStorage.removeItem(USER_API_KEY_STORAGE);
            }
            if (pathname === "/") {
              setState("landing");
            } else {
              router.replace("/login?reason=key_invalid");
            }
            return;
          }
          if (e.status === 402) {
            setState("no_active_plan");
            return;
          }
          if (e.status === 403) {
            // Race: vault auto-locked between status() and me(). Route
            // to /login so the user re-enters the master password via
            // the merged unlock flow.
            setAuthReady("locked");
            router.replace("/login");
            return;
          }
          if (e.status === 503) {
            setState("service_locked");
            return;
          }
        }
        // Unknown error — treat as service locked, retry on next render
        setState("service_locked");
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMarketingRoute, pathname, retryNonce]);

  // Auto-retry every 30s while service_locked
  useEffect(() => {
    if (state !== "service_locked") return;
    const t = setTimeout(() => setRetryNonce((n) => n + 1), 30_000);
    return () => clearTimeout(t);
  }, [state]);

  const handleLoginClick = () => {
    if (authReady) {
      setState(authReady);
    } else {
      setState("locked");
    }
  };

  const handleBackToLanding = () => {
    setState("landing");
    setPassword("");
    setConfirmPassword("");
    setError(null);
  };

  const handleSetup = async () => {
    setError(null);
    if (password.length < 12) {
      setError("Password must be at least 12 characters");
      return;
    }
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError("Password must contain both letters and numbers");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.auth.setup(password);
      if (res.data?.mnemonic) {
        setMnemonic(res.data.mnemonic);
        setState("seed-phrase");
      } else {
        setState("unlocked");
      }
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Setup failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnlock = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await api.auth.unlock(password);
      setState("unlocked");
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Unlock failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLock = async () => {
    try {
      await api.auth.lock();
      setState("landing");
      setAuthReady("locked");
      setPassword("");
    } catch {
      // ignore
    }
  };

  // Marketing/auth routes bypass auth entirely — render children full-screen, no sidebar.
  if (isMarketingRoute) {
    return <>{children}</>;
  }

  if (state === "loading") {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Image src="/logo.png" alt="Offivex" width={76} height={64} priority />
          <div className="text-gray-400">Connecting to Offivex...</div>
        </div>
      </div>
    );
  }

  if (state === "landing") {
    return <LandingPage />;
  }

  // Phase 6 — key valid but no active subscription
  if (state === "no_active_plan") {
    return (
      <div className="min-h-screen bg-offivex-bg-base text-offivex-text-primary flex items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <Image
            src="/logo.png"
            alt="Offivex"
            width={64}
            height={54}
            className="mx-auto mb-6"
            priority
          />
          <div className="text-[11px] uppercase tracking-[0.2em] text-offivex-purple-light mb-2">
            Plan inactive
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight mb-3">
            Your plan has expired
          </h1>
          <p className="text-sm text-offivex-text-secondary leading-relaxed mb-6">
            Your API key is still valid, but you have no active subscription.
            Contact your admin on Telegram to renew — they&apos;ll send you a new
            payment link.
          </p>
          <a
            href="https://t.me/offivex"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block w-full py-2.5 rounded-lg btn-purple text-sm mb-2"
          >
            DM admin on Telegram
          </a>
          <button
            onClick={() => {
              if (typeof window !== "undefined") {
                window.localStorage.removeItem(USER_API_KEY_STORAGE);
              }
              router.replace("/login");
            }}
            className="w-full py-2.5 rounded-lg text-sm text-offivex-text-secondary hover:text-white border border-white/[0.10] hover:border-white/[0.20] transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  // Phase 6 — backend unreachable / server locked (admin must unlock wallet MEK)
  if (state === "service_locked") {
    return (
      <div className="min-h-screen bg-offivex-bg-base text-offivex-text-primary flex items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <Image
            src="/logo.png"
            alt="Offivex"
            width={64}
            height={54}
            className="mx-auto mb-6"
            priority
          />
          <div className="text-[11px] uppercase tracking-[0.2em] text-amber-300 mb-2">
            Temporarily unavailable
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight mb-3">
            Service warming up
          </h1>
          <p className="text-sm text-offivex-text-secondary leading-relaxed mb-6">
            The Offivex backend is starting up or temporarily unreachable. We
            auto-retry every 30 seconds.
          </p>
          <div className="flex items-center justify-center mb-2">
            <div className="w-8 h-8 rounded-full border-2 border-offivex-purple/30 border-t-offivex-purple animate-spin"></div>
          </div>
          <button
            onClick={() => router.refresh()}
            className="mt-4 text-xs text-offivex-text-muted hover:text-offivex-purple-light underline"
          >
            Retry now
          </button>
        </div>
      </div>
    );
  }

  if (state === "setup") {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-full max-w-md p-8">
          <div className="text-center mb-8">
            <Image src="/logo.png" alt="Offivex" width={67} height={56} priority className="mx-auto mb-4" />
            <h1 className="text-4xl font-bold mb-2 font-display">Offivex</h1>
            <p className="text-gray-400">
              Set up your encryption password to get started.
            </p>
            <p className="text-gray-500 text-sm mt-1">
              This password encrypts all wallet keys at rest.
            </p>
          </div>

          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-4">
            {error && (
              <div className="px-3 py-2 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm text-gray-400 mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 12 chars, letters + numbers"
                className="w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1.5">
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat password"
                className="w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                onKeyDown={(e) => e.key === "Enter" && handleSetup()}
              />
            </div>

            <button
              onClick={handleSetup}
              disabled={submitting}
              className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 font-medium transition-colors"
            >
              {submitting ? "Setting up..." : "Create Account"}
            </button>
          </div>

          <button
            onClick={handleBackToLanding}
            className="w-full mt-4 text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            &larr; Back to home
          </button>
        </div>
      </div>
    );
  }

  if (state === "locked") {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-full max-w-md p-8">
          <div className="text-center mb-8">
            <Image src="/logo.png" alt="Offivex" width={67} height={56} priority className="mx-auto mb-4" />
            <h1 className="text-4xl font-bold mb-2 font-display">Offivex</h1>
            <p className="text-gray-400">
              Enter your password to unlock.
            </p>
          </div>

          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-4">
            {error && (
              <div className="px-3 py-2 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm text-gray-400 mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
                autoFocus
              />
            </div>

            <button
              onClick={handleUnlock}
              disabled={submitting}
              className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 font-medium transition-colors"
            >
              {submitting ? "Unlocking..." : "Unlock"}
            </button>

            <button
              onClick={() => setState("setup")}
              className="w-full py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 font-medium transition-colors"
            >
              Create Account
            </button>
          </div>

          <button
            onClick={handleBackToLanding}
            className="w-full mt-4 text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            &larr; Back to home
          </button>
        </div>
      </div>
    );
  }

  if (state === "seed-phrase" && mnemonic) {
    const words = mnemonic.split(" ");
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-full max-w-lg p-8">
          <div className="text-center mb-6">
            <Image src="/logo.png" alt="Offivex" width={67} height={56} priority className="mx-auto mb-4" />
            <h1 className="text-3xl font-bold mb-2">Backup Seed Phrase</h1>
            <p className="text-gray-400 text-sm">
              Write down these {words.length} words in order. This is the only way to recover your wallets if you lose your password.
            </p>
          </div>

          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-4">
            <div className="bg-yellow-900/20 border border-yellow-800/50 rounded-lg p-3">
              <p className="text-yellow-400 text-xs font-medium">
                Never share your seed phrase. Anyone with these words can access all your wallets.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {words.map((word, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-800 rounded-lg border border-gray-700"
                >
                  <span className="text-gray-500 text-xs w-5 text-right">{i + 1}.</span>
                  <span className="text-white text-sm font-mono">{word}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                navigator.clipboard.writeText(mnemonic);
                setSeedCopied(true);
                setTimeout(() => setSeedCopied(false), 2000);
              }}
              className="w-full py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-sm font-medium transition-colors"
            >
              {seedCopied ? "Copied!" : "Copy to Clipboard"}
            </button>

            <button
              onClick={() => {
                setMnemonic(null);
                setState("unlocked");
              }}
              className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 font-medium transition-colors"
            >
              I&apos;ve saved my seed phrase
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Unlocked — render the protected app shell (sidebar + main content).
  // The outer div pins an explicit `bg-offivex-bg-base` so the page never
  // shows a translucent gradient through `min-h-screen` reflows or HMR
  // re-renders — previously this relied solely on the body bg, which left
  // a subtle whitish wash at the top on some Chromium/HiDPI setups when
  // combined with the (now-removed) sidebar backdrop-blur.
  return (
    <AuthContext.Provider value={{ handleLock }}>
      <PrivacyProvider>
        <LaunchProvider>
          <QuickSellRoot />
          <div className="flex h-screen bg-offivex-bg-base text-offivex-text-primary">
            <Sidebar />
            <main className="flex-1 overflow-auto p-6">
              <ErrorBoundary>{children}</ErrorBoundary>
            </main>
          </div>
          {/* Floating launch console — pill bottom-right, click to expand. */}
          <LaunchWidget />
        </LaunchProvider>
      </PrivacyProvider>
    </AuthContext.Provider>
  );
}

import { createContext, useContext } from "react";

interface AuthContextType {
  handleLock: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  handleLock: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}
