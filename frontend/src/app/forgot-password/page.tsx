"use client";

import { useState, FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
      setError("Please enter a valid email.");
      return;
    }
    setSubmitting(true);
    // TODO Sprint 2: real password reset email send
    await new Promise((r) => setTimeout(r, 600));
    setSubmitting(false);
    setSent(true);
  };

  return (
    <div className="min-h-screen bg-offivex-bg-base text-offivex-text-primary flex flex-col relative overflow-hidden noise-grain">
      <div className="absolute top-[10%] left-[-15%] w-[600px] h-[600px] halo-purple opacity-40 pointer-events-none" />

      <nav className="relative px-6 py-6 z-10">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <Image src="/logo.png" alt="Offivex" width={33} height={28} loading="lazy" />
          <span className="text-base font-display font-semibold tracking-tight">Offivex</span>
        </Link>
      </nav>

      <div className="flex-1 flex items-center justify-center px-6 pb-12 relative z-10">
        <div className="w-full max-w-sm">
          {sent ? (
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-offivex-purple/15 border border-offivex-purple/30 flex items-center justify-center mx-auto mb-6 text-2xl">
                ✉️
              </div>
              <h1 className="font-display text-3xl font-bold mb-3 tracking-tight">Check your inbox</h1>
              <p className="text-sm text-offivex-text-secondary leading-relaxed mb-7">
                If an account exists for <span className="text-offivex-text-primary">{email}</span>, we&apos;ve sent a password reset link. Check your spam folder if you don&apos;t see it within 2 minutes.
              </p>
              <Link
                href="/login"
                className="inline-block px-6 py-2.5 rounded-xl btn-outline text-sm"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <div className="text-center mb-9">
                <h1 className="font-display text-4xl font-bold mb-3 tracking-tight">Reset password</h1>
                <p className="text-sm text-offivex-text-secondary">
                  Enter your email and we&apos;ll send you a reset link.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-xs text-offivex-text-muted mb-1.5 uppercase tracking-wider">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-offivex-text-primary placeholder-offivex-text-muted focus:outline-none focus:border-offivex-purple/50 focus:bg-white/[0.05] transition-colors"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3.5 rounded-xl btn-purple text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {submitting ? "Sending..." : "Send reset link"}
                </button>
              </form>

              <div className="mt-6 text-center">
                <Link href="/login" className="text-sm text-offivex-text-muted hover:text-offivex-text-primary transition-colors">
                  ← Back to sign in
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
