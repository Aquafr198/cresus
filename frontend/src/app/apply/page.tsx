"use client";

import { useState, FormEvent, useEffect, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const PLAN_LABEL: Record<string, string> = {
  monthly: "Monthly — $1,000 / month",
  yearly: "Yearly — $7,000 / year",
};

function ApplyForm() {
  const searchParams = useSearchParams();
  const planQuery = searchParams.get("plan") || "";

  const [telegram, setTelegram] = useState("");
  const [email, setEmail] = useState("");
  const [project, setProject] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Auto-prepend @ to telegram handle
  const handleTelegramBlur = () => {
    if (telegram && !telegram.startsWith("@")) {
      setTelegram(`@${telegram}`);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!telegram) return setError("Telegram handle is required.");
    if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email))
      return setError("Please enter a valid email.");
    if (!project || project.trim().length < 30)
      return setError("Tell us more about your project (min 30 characters).");
    if (project.length > 1500)
      return setError("Project description too long (max 1500 characters).");

    setSubmitting(true);

    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegram: telegram.startsWith("@") ? telegram : `@${telegram}`,
          email,
          project,
          plan: planQuery || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Submission failed. Please try again.");
        setSubmitting(false);
        return;
      }

      setSuccess(true);
    } catch {
      setError("Network error. Please try again in a moment.");
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="text-center max-w-md mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-offivex-green/15 border border-offivex-green/30 flex items-center justify-center mx-auto mb-6">
          <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8">
            <path d="m5 12 5 5L20 7" stroke="#14F195" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 className="font-display text-3xl font-bold mb-3 tracking-tight">Application received</h1>
        <p className="text-sm text-offivex-text-secondary leading-relaxed mb-8">
          We&apos;ll review your project and DM you on Telegram within 24 hours.
          Check your spam folder if you don&apos;t hear from us by then.
        </p>
        <Link href="/" className="inline-block px-6 py-2.5 rounded-xl btn-outline text-sm">
          ← Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      <div className="text-center mb-9">
        <h1 className="font-display text-4xl font-bold mb-3 tracking-tight">
          Apply for access
        </h1>
        <p className="text-sm text-offivex-text-secondary leading-relaxed">
          Offivex is invite-only. Tell us about your project and we&apos;ll DM you on Telegram within 24h.
          {planQuery && PLAN_LABEL[planQuery] && (
            <span className="block mt-2 text-offivex-purple-light">
              Selected: {PLAN_LABEL[planQuery]}
            </span>
          )}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
            {error}
          </div>
        )}

        <div>
          <label
            htmlFor="apply-telegram"
            className="block text-xs text-offivex-text-muted mb-1.5 uppercase tracking-wider"
          >
            Telegram handle
          </label>
          <input
            id="apply-telegram"
            type="text"
            value={telegram}
            onChange={(e) => setTelegram(e.target.value)}
            onBlur={handleTelegramBlur}
            placeholder="@yourtelegram"
            autoComplete="off"
            className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-offivex-text-primary placeholder-offivex-text-muted focus:outline-none focus:border-offivex-purple/50 focus:bg-white/[0.05] transition-colors"
          />
        </div>

        <div>
          <label
            htmlFor="apply-email"
            className="block text-xs text-offivex-text-muted mb-1.5 uppercase tracking-wider"
          >
            Email
          </label>
          <input
            id="apply-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@project.com"
            autoComplete="email"
            className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-offivex-text-primary placeholder-offivex-text-muted focus:outline-none focus:border-offivex-purple/50 focus:bg-white/[0.05] transition-colors"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="apply-project"
              className="block text-xs text-offivex-text-muted uppercase tracking-wider"
            >
              Project
            </label>
            <span className="text-[10px] text-offivex-text-muted font-mono">
              {project.length} / 1500
            </span>
          </div>
          <textarea
            id="apply-project"
            value={project}
            onChange={(e) => setProject(e.target.value)}
            placeholder="Tell us about what you're launching, your timeline, expected volume, and any relevant links (Twitter, website, prior launches)."
            rows={6}
            className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-offivex-text-primary placeholder-offivex-text-muted focus:outline-none focus:border-offivex-purple/50 focus:bg-white/[0.05] transition-colors resize-none leading-relaxed"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3.5 rounded-xl btn-purple text-sm disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting ? "Submitting application..." : "Submit application"}
        </button>
      </form>

      <div className="mt-7 text-center">
        <p className="text-sm text-offivex-text-secondary">
          Already approved?{" "}
          <Link href="/login" className="text-offivex-purple-light hover:text-white transition-colors font-medium">
            Sign in
          </Link>
        </p>
      </div>

      <div className="mt-10 pt-6 border-t border-white/[0.04] text-center">
        <p className="text-xs text-offivex-text-muted leading-relaxed">
          By applying you agree to our{" "}
          <Link href="/terms" className="text-offivex-text-secondary hover:text-white underline">Terms</Link>
          {" "}and{" "}
          <Link href="/privacy" className="text-offivex-text-secondary hover:text-white underline">Privacy Policy</Link>.
          Offivex is a tool — you are responsible for compliance with your jurisdiction&apos;s laws.
        </p>
      </div>
    </div>
  );
}

export default function ApplyPage() {
  return (
    <div className="min-h-screen bg-offivex-bg-base text-offivex-text-primary flex flex-col relative overflow-hidden noise-grain">
      {/* Halos background */}
      <div className="absolute top-[10%] left-[-15%] w-[600px] h-[600px] halo-purple opacity-50 pointer-events-none" />
      <div className="absolute bottom-[10%] right-[-15%] w-[500px] h-[500px] halo-green opacity-30 pointer-events-none" />

      {/* Minimal nav */}
      <nav className="relative px-6 py-6 z-10">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <Image src="/logo.png" alt="Offivex" width={33} height={28} loading="lazy" />
          <span className="text-base font-display font-semibold tracking-tight">Offivex</span>
        </Link>
      </nav>

      <div className="flex-1 flex items-center justify-center px-6 py-12 relative z-10">
        <Suspense fallback={<div className="text-offivex-text-muted">Loading...</div>}>
          <ApplyForm />
        </Suspense>
      </div>
    </div>
  );
}
