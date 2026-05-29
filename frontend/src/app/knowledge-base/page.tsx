"use client";

import Link from "next/link";
import { useState } from "react";
import { MarketingShell } from "@/components/landing/MarketingShell";

interface Article {
  title: string;
  desc: string;
  href: string;
}

interface Category {
  icon: React.ReactNode;
  slug: string;
  title: string;
  desc: string;
  articles: Article[];
}

const CATEGORIES: Category[] = [
  {
    icon: <RocketIcon />,
    slug: "getting-started",
    title: "Getting Started",
    desc: "From application approval to your first token launch.",
    articles: [
      { title: "How the application process works", desc: "What we look for, response timeline, next steps.", href: "/knowledge-base/application-process" },
      { title: "Your first 24 hours on Offivex", desc: "Onboarding consultant call, wallet setup, RPC config.", href: "/knowledge-base/first-24-hours" },
      { title: "Choosing between Monthly and Yearly", desc: "Feature differences and when each makes sense.", href: "/knowledge-base/monthly-vs-yearly" },
    ],
  },
  {
    icon: <WalletIcon />,
    slug: "wallets-custody",
    title: "Wallets & Custody",
    desc: "Encrypt, organize, and rotate your Solana wallets.",
    articles: [
      { title: "How encryption works on Offivex", desc: "AES-256-GCM with Argon2id, client-side derivation.", href: "/knowledge-base/encryption" },
      { title: "Creating wallet groups", desc: "Logical grouping for snipe, distribution, dev wallets.", href: "/knowledge-base/wallet-groups" },
      { title: "Exporting your seed phrase", desc: "When you need it, how it&apos;s displayed safely.", href: "/knowledge-base/export-seed" },
      { title: "Consolidating SOL across wallets", desc: "Step-by-step using the distribution panel.", href: "/knowledge-base/consolidate-sol" },
    ],
  },
  {
    icon: <TokenIcon />,
    slug: "token-launches",
    title: "Token Launches",
    desc: "Mint SPL tokens, launch on Pump.fun, and bundle snipes.",
    articles: [
      { title: "Minting your first SPL token", desc: "Metadata, supply, vanity address grinding.", href: "/knowledge-base/mint-spl-token" },
      { title: "Jito bundle anatomy", desc: "Multi-tx atomic execution and tip strategy.", href: "/knowledge-base/jito-bundles" },
      { title: "Pump.fun launches with custom profiles", desc: "Profile randomizer and dev wallet setup.", href: "/knowledge-base/pump-fun-profiles" },
      { title: "Anti-bubble distribution patterns", desc: "Avoiding cluster detection on chain.", href: "/knowledge-base/anti-bubble-distribution" },
    ],
  },
  {
    icon: <BotIcon />,
    slug: "trading-bots",
    title: "Trading Bots",
    desc: "Volume, bumper, warmer — automated trading patterns.",
    articles: [
      { title: "Configuring the Volume Bot", desc: "Cycle parameters, slippage tolerance, wallet rotation.", href: "/knowledge-base/volume-bot" },
      { title: "Bumper bot strategy", desc: "Same-block buy/sell for price action.", href: "/knowledge-base/bumper-bot" },
      { title: "Wallet Warmer best practices", desc: "Building organic-looking transaction history.", href: "/knowledge-base/wallet-warmer" },
      { title: "Stopping & resuming bots safely", desc: "Graceful shutdown without leaving open positions.", href: "/knowledge-base/stop-resume-bots" },
    ],
  },
  {
    icon: <CreditCardIcon />,
    slug: "billing-payments",
    title: "Billing & Payments",
    desc: "Subscriptions, crypto payments, refunds, invoices.",
    articles: [
      { title: "Paying with crypto", desc: "SOL / USDC / USDT-TRC20 — how invoices work.", href: "/knowledge-base/paying-crypto" },
      { title: "Switching from Monthly to Yearly", desc: "Pro-rata credit and timing.", href: "/knowledge-base/monthly-to-yearly" },
      { title: "Refund policy", desc: "7-day Monthly · 30-day Yearly · how to request.", href: "/knowledge-base/refund-policy" },
      { title: "Updating your payout wallet", desc: "Rotate the Solana wallet used for auto-renewal.", href: "/knowledge-base/payout-wallet" },
    ],
  },
  {
    icon: <ShieldIcon />,
    slug: "security",
    title: "Security & Best Practices",
    desc: "Protect your wallets, password, and Telegram account.",
    articles: [
      { title: "Password requirements & rotation", desc: "Why 12+ chars and how often to rotate.", href: "/knowledge-base/password-rotation" },
      { title: "Backing up your seed phrase", desc: "Cold storage recommendations, never digital.", href: "/knowledge-base/backup-seed" },
      { title: "Recognizing phishing attempts", desc: "We never DM you first asking for credentials.", href: "/knowledge-base/phishing" },
      { title: "Reporting a security issue", desc: "Responsible disclosure to security@offivex.io.", href: "/knowledge-base/security-disclosure" },
    ],
  },
];

const POPULAR: Article[] = [
  { title: "How long does the application process take?", desc: "Most reviews resolve in under 24 hours.", href: "/knowledge-base/application-process" },
  { title: "Can I use Offivex without doxxing my project?", desc: "Yes — pseudonymous teams are accepted.", href: "/knowledge-base/application-process" },
  { title: "What happens if I lose my password?", desc: "Without your seed phrase, wallets are unrecoverable.", href: "/knowledge-base/password-rotation" },
  { title: "Does Offivex run my wallets in the cloud?", desc: "No — keys are encrypted and never decrypted server-side.", href: "/knowledge-base/encryption" },
];

export default function KnowledgeBasePage() {
  const [q, setQ] = useState("");

  const filteredCategories = q.trim()
    ? CATEGORIES.map((c) => ({
        ...c,
        articles: c.articles.filter(
          (a) =>
            a.title.toLowerCase().includes(q.toLowerCase()) ||
            a.desc.toLowerCase().includes(q.toLowerCase())
        ),
      })).filter((c) => c.articles.length > 0)
    : CATEGORIES;

  return (
    <MarketingShell>
      {/* Hero */}
      <section className="relative pt-12 pb-12 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="text-xs uppercase tracking-[0.2em] text-offivex-purple-light mb-3">Knowledge base</div>
          <h1 className="font-display text-5xl md:text-7xl font-bold tracking-tight leading-[0.98] mb-5">
            How can we help?
          </h1>
          <p className="text-offivex-text-secondary text-base md:text-lg mb-9 max-w-xl mx-auto">
            Browse articles by topic or search across the entire knowledge base.
            For technical reference, see the <Link href="/docs" className="text-offivex-purple-light hover:text-white underline">Documentation</Link>.
          </p>

          {/* Search */}
          <div className="relative max-w-xl mx-auto">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search articles, e.g. &quot;bundle&quot;, &quot;wallet&quot;, &quot;refund&quot;…"
              className="w-full px-5 py-4 pl-12 rounded-xl bg-white/[0.04] border border-white/[0.08] text-offivex-text-primary placeholder-offivex-text-muted focus:outline-none focus:border-offivex-purple/50 focus:bg-white/[0.06] transition-colors text-base"
            />
            <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-offivex-text-muted">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
              <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="px-6 pb-16">
        <div className="max-w-6xl mx-auto">
          {filteredCategories.length === 0 ? (
            <div className="text-center py-16 text-offivex-text-muted">
              No articles match &ldquo;<span className="text-offivex-text-secondary">{q}</span>&rdquo;.
              Try a different keyword or <a href="mailto:hello@offivex.io" className="text-offivex-purple-light hover:text-white underline">email us</a>.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredCategories.map((cat) => (
                <div
                  key={cat.title}
                  id={cat.slug}
                  className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 hover:border-offivex-purple/30 transition-colors scroll-mt-28"
                >
                  <div className="w-11 h-11 rounded-xl bg-offivex-purple/15 border border-offivex-purple/30 flex items-center justify-center text-offivex-purple-light mb-4">
                    {cat.icon}
                  </div>
                  <h2 className="font-display text-lg font-semibold mb-1">{cat.title}</h2>
                  <p className="text-xs text-offivex-text-secondary mb-5">{cat.desc}</p>
                  <ul className="space-y-2.5">
                    {cat.articles.map((a) => (
                      <li key={a.title}>
                        <Link
                          href={a.href}
                          className="group flex items-start gap-2 text-sm hover:text-white transition-colors"
                        >
                          <span className="text-offivex-purple-light/60 group-hover:text-offivex-purple-light mt-0.5 shrink-0">›</span>
                          <span className="text-offivex-text-secondary group-hover:text-white">{a.title}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Popular */}
      {!q.trim() && (
        <section className="px-6 py-16 border-t border-white/[0.04]">
          <div className="max-w-4xl mx-auto">
            <div className="mb-8">
              <div className="text-xs uppercase tracking-[0.2em] text-offivex-purple-light mb-2">Popular</div>
              <h2 className="font-display text-2xl md:text-3xl font-bold tracking-tight">Top questions this month</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {POPULAR.map((a) => (
                <Link
                  key={a.title}
                  href={a.href}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 hover:border-offivex-purple/30 hover:bg-white/[0.04] transition-colors group"
                >
                  <div className="font-medium text-white mb-1 text-sm group-hover:text-offivex-purple-light transition-colors">{a.title}</div>
                  <div className="text-xs text-offivex-text-secondary leading-relaxed">{a.desc}</div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Still need help */}
      <section className="px-6 py-20 border-t border-white/[0.04]">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight mb-4">
            Still need help?
          </h2>
          <p className="text-offivex-text-secondary mb-8 leading-relaxed">
            Active subscribers get DM support on Telegram within 24h.
            Public inquiries — email us and we&apos;ll reply within 1 business day.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href="mailto:hello@offivex.io"
              className="px-7 py-3 rounded-xl btn-purple text-sm"
            >
              Email hello@offivex.io
            </a>
            <a
              href="https://t.me/offivex"
              className="px-7 py-3 rounded-xl btn-outline text-sm"
            >
              DM on Telegram
            </a>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}

/* Inline category icons */

function RocketIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" aria-hidden="true">
      {/* Body + nose */}
      <path
        d="M12 2.5c2.6 2.4 4.2 5.6 4.2 9.1V18H7.8v-6.4c0-3.5 1.6-6.7 4.2-9.1z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Porthole */}
      <circle cx="12" cy="10" r="1.6" stroke="currentColor" strokeWidth="1.5" />
      {/* Left fin */}
      <path
        d="M7.8 13.2 4.8 15.4v2.9l3-1.1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Right fin */}
      <path
        d="m16.2 13.2 3 2.2v2.9l-3-1.1"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Flame */}
      <path
        d="M10.3 18.5c0 1.7.8 3 1.7 3 1 0 1.7-1.3 1.7-3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
      <rect x="3" y="6" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M16 13h2M3 10h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function TokenIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 7v10M9 10l3-3 3 3M9 14l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BotIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
      <rect x="4" y="8" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 3v5M8 14h.01M16 14h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CreditCardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
      <rect x="2.5" y="6" width="19" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <line x1="2.5" y1="10.5" x2="21.5" y2="10.5" stroke="currentColor" strokeWidth="1.5" />
      <line x1="6" y1="15" x2="10" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
