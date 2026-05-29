"use client";

import { useState, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  const handleResend = async () => {
    setResending(true);
    // TODO Sprint 2: real resend verification email call
    await new Promise((r) => setTimeout(r, 600));
    setResending(false);
    setResent(true);
    setTimeout(() => setResent(false), 5000);
  };

  return (
    <div className="w-full max-w-md text-center">
      <div className="w-16 h-16 rounded-2xl bg-offivex-purple/15 border border-offivex-purple/30 flex items-center justify-center mx-auto mb-7 text-3xl">
        ✉️
      </div>

      <h1 className="font-display text-4xl font-bold mb-3 tracking-tight">Verify your email</h1>
      <p className="text-sm text-offivex-text-secondary leading-relaxed mb-2">
        We&apos;ve sent a verification link to
      </p>
      <p className="text-base text-offivex-text-primary font-medium mb-6">
        {email || "your inbox"}
      </p>
      <p className="text-sm text-offivex-text-secondary leading-relaxed mb-9 max-w-sm mx-auto">
        Click the link in the email to activate your account. The link expires in 24 hours. Check your spam folder if you don&apos;t see it.
      </p>

      <div className="space-y-3">
        <button
          onClick={handleResend}
          disabled={resending || resent}
          className="w-full max-w-xs mx-auto block px-6 py-2.5 rounded-xl btn-outline text-sm disabled:opacity-50"
        >
          {resending ? "Sending..." : resent ? "Sent ✓" : "Resend verification email"}
        </button>

        <Link
          href="/login"
          className="inline-block text-sm text-offivex-text-muted hover:text-offivex-text-primary transition-colors"
        >
          ← Back to sign in
        </Link>
      </div>

      <div className="mt-12 pt-6 border-t border-white/[0.04] text-xs text-offivex-text-muted">
        Need help? Email <a href="mailto:support@offivex.io" className="text-offivex-text-secondary hover:text-offivex-text-primary underline">support@offivex.io</a>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
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
        <Suspense fallback={<div className="text-offivex-text-muted">Loading...</div>}>
          <VerifyEmailContent />
        </Suspense>
      </div>
    </div>
  );
}
