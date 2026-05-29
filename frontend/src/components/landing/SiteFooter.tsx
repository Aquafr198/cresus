import Image from "next/image";
import Link from "next/link";
import { ComplianceBadges } from "@/components/landing/ComplianceBadges";

/**
 * Canonical site footer — single source of truth.
 * Used by both LandingPage (home) and MarketingShell (all other marketing pages
 * /pricing /docs /privacy /terms /refund /knowledge-base) so we never drift.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-white/[0.06] py-14 px-6">
      <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
        {/* Logo + tagline + social */}
        <div className="col-span-2">
          <Link href="/" className="flex items-center gap-2 mb-4">
            <Image src="/logo.png" alt="Offivex" width={33} height={28} loading="lazy" />
            <span className="text-base font-display font-semibold">Offivex</span>
          </Link>
          <p className="text-xs text-offivex-text-muted max-w-xs leading-relaxed mb-5">
            The Solana launch stack for serious teams. Self-custody preserved, premium infrastructure included.
          </p>
          <div className="flex items-center gap-3">
            <a
              href="https://t.me/offivex"
              aria-label="Telegram"
              className="w-9 h-9 rounded-lg glass-card flex items-center justify-center text-offivex-text-secondary hover:text-white hover:border-offivex-purple/30 transition-colors"
            >
              <TelegramLogo />
            </a>
            <a
              href="https://twitter.com/offivex_sol"
              aria-label="X (Twitter)"
              className="w-9 h-9 rounded-lg glass-card flex items-center justify-center text-offivex-text-secondary hover:text-white hover:border-offivex-purple/30 transition-colors"
            >
              <XLogo />
            </a>
          </div>
        </div>

        {/* Product */}
        <div>
          <div className="text-xs uppercase tracking-wider text-offivex-text-muted mb-4">Product</div>
          <ul className="space-y-2.5 text-sm">
            <li><Link href="/#features" className="text-offivex-text-secondary hover:text-white transition-colors">Features</Link></li>
            <li><Link href="/pricing" className="text-offivex-text-secondary hover:text-white transition-colors">Pricing</Link></li>
            <li><Link href="/docs" className="text-offivex-text-secondary hover:text-white transition-colors">Documentation</Link></li>
            <li><Link href="/knowledge-base" className="text-offivex-text-secondary hover:text-white transition-colors">Knowledge base</Link></li>
            <li><a href="https://status.offivex.io" className="text-offivex-text-secondary hover:text-white transition-colors">Status</a></li>
          </ul>
        </div>

        {/* Legal */}
        <div>
          <div className="text-xs uppercase tracking-wider text-offivex-text-muted mb-4">Legal</div>
          <ul className="space-y-2.5 text-sm">
            <li><Link href="/terms" className="text-offivex-text-secondary hover:text-white transition-colors">Terms</Link></li>
            <li><Link href="/privacy" className="text-offivex-text-secondary hover:text-white transition-colors">Privacy</Link></li>
            <li><Link href="/refund" className="text-offivex-text-secondary hover:text-white transition-colors">Refund Policy</Link></li>
          </ul>
        </div>
      </div>

      <div className="max-w-6xl mx-auto">
        <ComplianceBadges />
      </div>

      <div className="max-w-6xl mx-auto pt-8 mt-8 border-t border-white/[0.04] flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="text-xs text-offivex-text-muted">
          © 2026 Offivex. Tool only — not financial advice. Use at your jurisdiction&apos;s risk.
        </div>
        <div className="text-xs text-offivex-text-muted">
          v1.0 · Operated from Dubai UAE
        </div>
      </div>
    </footer>
  );
}

/* Brand glyphs — official marks (X/Twitter, Telegram) */

function XLogo() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644z" />
    </svg>
  );
}

function TelegramLogo() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-[18px] h-[18px]" aria-hidden="true">
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0Zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394a.752.752 0 0 1-.602.295l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.643-.204-.658-.643.135-.953l11.566-4.458c.538-.196 1.006.128.832.941Z" />
    </svg>
  );
}
