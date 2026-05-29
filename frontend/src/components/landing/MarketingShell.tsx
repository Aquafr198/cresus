"use client";

import Image from "next/image";
import Link from "next/link";
import { SiteFooter } from "@/components/landing/SiteFooter";

interface MarketingShellProps {
  children: React.ReactNode;
  /** Hide the nav links (for focused auth pages — only shows logo). */
  minimalNav?: boolean;
}

export function MarketingShell({ children, minimalNav = false }: MarketingShellProps) {
  return (
    <div className="min-h-screen bg-offivex-bg-base text-offivex-text-primary overflow-hidden flex flex-col relative noise-grain">
      {/* Navbar */}
      <nav className="relative z-50">
        <div className="mx-auto max-w-7xl px-6 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/logo.png" alt="Offivex" width={48} height={40} priority />
            <span className="text-[1.35rem] font-display font-semibold tracking-tight">Offivex</span>
          </Link>

          {!minimalNav && (
            <div className="hidden md:flex items-center gap-8 text-sm text-offivex-text-secondary">
              <Link href="/#features" className="hover:text-white transition-colors">Features</Link>
              <Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link>
              <Link href="/docs" className="hover:text-white transition-colors">Documentation</Link>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="hidden md:inline-block px-4 py-2 rounded-lg text-sm text-offivex-text-secondary hover:text-white transition-colors"
            >
              Log In
            </Link>
            <Link
              href="/apply"
              className="px-5 py-2 rounded-lg btn-purple text-sm"
            >
              Apply
            </Link>
          </div>
        </div>
      </nav>

      {/* Page content */}
      <div className="flex-1 relative z-10">{children}</div>

      {/* Shared canonical footer */}
      <div className="mt-auto relative z-10">
        <SiteFooter />
      </div>
    </div>
  );
}
