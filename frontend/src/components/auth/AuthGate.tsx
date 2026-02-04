"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { api, ApiError } from "@/lib/api";
import { LandingPage } from "@/components/landing/LandingPage";

interface AuthGateProps {
  children: React.ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const [state, setState] = useState<
    "loading" | "landing" | "setup" | "locked" | "unlocked" | "seed-phrase"
  >("loading");
  const [authReady, setAuthReady] = useState<"setup" | "locked" | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [seedCopied, setSeedCopied] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const res = await api.auth.status();
      if (!res.data.password_set) {
        setAuthReady("setup");
        setState("landing");
      } else if (!res.data.unlocked) {
        setAuthReady("locked");
        setState("landing");
      } else {
        setState("unlocked");
      }
    } catch {
      // Backend not reachable — show landing
      setAuthReady("locked");
      setState("landing");
    }
  };

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

  if (state === "loading") {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Image src="/logo.svg" alt="Cresus" width={64} height={64} className="rounded-2xl shadow-lg shadow-blue-500/20" />
          <div className="text-gray-400">Connecting to Cresus...</div>
        </div>
      </div>
    );
  }

  if (state === "landing") {
    return <LandingPage onLogin={handleLoginClick} />;
  }

  if (state === "setup") {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-full max-w-md p-8">
          <div className="text-center mb-8">
            <Image src="/logo.svg" alt="Cresus" width={56} height={56} className="rounded-xl shadow-lg shadow-blue-500/20 mx-auto mb-4" />
            <h1 className="text-4xl font-bold mb-2">Cresus</h1>
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
            <Image src="/logo.svg" alt="Cresus" width={56} height={56} className="rounded-xl shadow-lg shadow-blue-500/20 mx-auto mb-4" />
            <h1 className="text-4xl font-bold mb-2">Cresus</h1>
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
            <Image src="/logo.svg" alt="Cresus" width={56} height={56} className="rounded-xl shadow-lg shadow-blue-500/20 mx-auto mb-4" />
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

  // Unlocked — render the app with a lock button available via context
  return (
    <AuthContext.Provider value={{ handleLock }}>
      {children}
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
