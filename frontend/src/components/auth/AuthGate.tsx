"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";

interface AuthGateProps {
  children: React.ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const [state, setState] = useState<
    "loading" | "setup" | "locked" | "unlocked"
  >("loading");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const res = await api.auth.status();
      if (!res.data.password_set) {
        setState("setup");
      } else if (!res.data.unlocked) {
        setState("locked");
      } else {
        setState("unlocked");
      }
    } catch {
      // Backend not reachable — show locked state
      setState("locked");
    }
  };

  const handleSetup = async () => {
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setSubmitting(true);
    try {
      await api.auth.setup(password);
      setState("unlocked");
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
      setState("locked");
      setPassword("");
    } catch {
      // ignore
    }
  };

  if (state === "loading") {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400">Connecting to Cresus...</div>
      </div>
    );
  }

  if (state === "setup") {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-full max-w-md p-8">
          <div className="text-center mb-8">
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
                placeholder="Minimum 8 characters"
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
              {submitting ? "Setting up..." : "Set Password & Unlock"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (state === "locked") {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-full max-w-md p-8">
          <div className="text-center mb-8">
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
