"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { api, ADMIN_TOKEN_KEY, ApiError } from "@/lib/api";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!username || !password) {
      setError("Username and password are required.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.admin.login(username, password);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(ADMIN_TOKEN_KEY, res.data.token);
      }
      router.replace("/admin");
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
      } else {
        setError("Login failed — backend unreachable?");
      }
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Image
            src="/logo.png"
            alt="Offivex"
            width={56}
            height={47}
            className="mx-auto mb-4"
            priority
          />
          <div className="text-[11px] uppercase tracking-[0.2em] text-offivex-purple-light mb-1">
            Admin panel
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Sign in
          </h1>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 space-y-4"
        >
          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-[11px] text-offivex-text-muted mb-1.5 uppercase tracking-wider">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              className="w-full px-3.5 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-offivex-text-primary placeholder-offivex-text-muted focus:outline-none focus:border-offivex-purple/50 focus:bg-white/[0.05] transition-colors"
            />
          </div>

          <div>
            <label className="block text-[11px] text-offivex-text-muted mb-1.5 uppercase tracking-wider">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full px-3.5 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-offivex-text-primary placeholder-offivex-text-muted focus:outline-none focus:border-offivex-purple/50 focus:bg-white/[0.05] transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 rounded-lg btn-purple text-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-offivex-text-muted leading-relaxed">
          Admin access is provisioned via the <code className="text-offivex-text-secondary">offivex admin create</code> CLI command.
        </p>
      </div>
    </div>
  );
}
