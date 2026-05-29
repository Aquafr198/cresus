"use client";

import Link from "next/link";
import {
  AcademicCapIcon,
  RocketLaunchIcon,
  ShieldCheckIcon,
  BoltIcon,
  CpuChipIcon,
  WrenchScrewdriverIcon,
  BookOpenIcon,
  BeakerIcon,
  ChartBarIcon,
  CogIcon,
  CreditCardIcon,
  CurrencyDollarIcon,
  PaintBrushIcon,
  PhotoIcon,
  SignalIcon,
  SparklesIcon,
  UserGroupIcon,
  WalletIcon,
  ArrowsRightLeftIcon,
  GiftIcon,
  FireIcon,
  PuzzlePieceIcon,
  CommandLineIcon,
  EyeSlashIcon,
  ClipboardDocumentListIcon,
} from "@heroicons/react/24/solid";
import type { ElementType } from "react";

interface IntentCard {
  href: string;
  title: string;
  description: string;
  color: string;
  bg: string;
  border: string;
  icon: ElementType;
  badge?: string;
}

interface FeatureCard {
  href: string;
  title: string;
  description: string;
  icon: ElementType;
}

const INTENT_CARDS: IntentCard[] = [
  {
    href: "/docs/quick-start",
    title: "New here — start in 5 minutes",
    description:
      "Cluster choice, master password, your first wallet. The shortest path from login to a funded keypair.",
    color: "text-green-300",
    bg: "bg-green-500/[0.05]",
    border: "border-green-500/30",
    icon: BoltIcon,
    badge: "5 min",
  },
  {
    href: "/docs/tutorial",
    title: "I want to launch a token",
    description:
      "The full Master Tutorial — 18 steps from apply form to post-launch wind-down. Read it linearly.",
    color: "text-offivex-purple-light",
    bg: "bg-offivex-purple/[0.06]",
    border: "border-offivex-purple/40",
    icon: AcademicCapIcon,
    badge: "Recommended",
  },
  {
    href: "/docs/troubleshooting",
    title: "I hit an error",
    description:
      "25+ error messages with cause, fix, and the exact command or button to click next. Searchable.",
    color: "text-amber-300",
    bg: "bg-amber-500/[0.05]",
    border: "border-amber-500/30",
    icon: WrenchScrewdriverIcon,
  },
  {
    href: "/docs/recipes",
    title: "Show me proven patterns",
    description:
      "Six end-to-end launch recipes — sniper bundle, fair launch, Pump.fun migration, multi-bot stealth setup.",
    color: "text-cyan-300",
    bg: "bg-cyan-500/[0.05]",
    border: "border-cyan-500/30",
    icon: BeakerIcon,
  },
];

const FEATURE_CARDS: FeatureCard[] = [
  {
    href: "/docs/feature/wallets",
    title: "Wallets",
    description: "Create, fund, sub-wallet, export, send. The vault basics.",
    icon: WalletIcon,
  },
  {
    href: "/docs/feature/mint",
    title: "Mint Token",
    description: "SPL token creation with Metaplex metadata + IPFS auto-pin.",
    icon: SparklesIcon,
  },
  {
    href: "/docs/feature/bundle",
    title: "Bundle Launch",
    description:
      "Atomic Jito bundle: market + Raydium pool + snipe wallets in one tx.",
    icon: RocketLaunchIcon,
  },
  {
    href: "/docs/feature/pump-fun",
    title: "Pump.fun",
    description: "Bonding-curve launch with initial dev buy and migration path.",
    icon: FireIcon,
  },
  {
    href: "/docs/feature/meme-library",
    title: "Meme Library",
    description: "Upload images, pin to IPFS, manage metadata templates.",
    icon: PhotoIcon,
  },
  {
    href: "/docs/feature/tasks",
    title: "Tasks (Templates)",
    description: "Save a launch config now, re-execute it later with one click.",
    icon: ClipboardDocumentListIcon,
  },
  {
    href: "/docs/feature/manual-trade",
    title: "Manual Trade",
    description: "Single-wallet buy/sell via Jupiter with slippage controls.",
    icon: ArrowsRightLeftIcon,
  },
  {
    href: "/docs/feature/quick-sell",
    title: "Quick-Sell Keybinds",
    description: "Single-key panic exit across every wallet holding the active token.",
    icon: CommandLineIcon,
  },
  {
    href: "/docs/feature/volume-bot",
    title: "Volume Bot",
    description: "Buy/sell cycles across wallet sets — sustained activity.",
    icon: ChartBarIcon,
  },
  {
    href: "/docs/feature/bumper-bot",
    title: "Bumper Bot",
    description: "Price-floor support — small buys to defend a threshold.",
    icon: ChartBarIcon,
  },
  {
    href: "/docs/feature/wallet-warmer",
    title: "Wallet Warmer",
    description: "Generate organic on-chain history to reduce flag risk.",
    icon: PuzzlePieceIcon,
  },
  {
    href: "/docs/feature/distribution",
    title: "Distribution",
    description: "Multi-hop SOL spread to sub-wallets with variance & delays.",
    icon: ArrowsRightLeftIcon,
  },
  {
    href: "/docs/feature/profiles",
    title: "Profiles",
    description: "Random identity generator — diversity for anti-flag.",
    icon: PaintBrushIcon,
  },
  {
    href: "/docs/feature/monitor",
    title: "Monitor",
    description: "WebSocket live feed for any mint — events as they land.",
    icon: SignalIcon,
  },
  {
    href: "/docs/feature/referral",
    title: "Referral",
    description: "Share codes, track conversions, claim earnings.",
    icon: GiftIcon,
  },
  {
    href: "/docs/feature/settings",
    title: "Settings",
    description: "RPC endpoints, priority fees, environment config.",
    icon: CogIcon,
  },
  {
    href: "/docs/feature/billing",
    title: "Billing",
    description: "Plans, subscription state, renewal, payment history.",
    icon: CreditCardIcon,
  },
  {
    href: "/docs/feature/security",
    title: "Security",
    description: "Master password, seed phrase, vault, recovery & rotation.",
    icon: ShieldCheckIcon,
  },
  {
    href: "/docs/feature/privacy-mode",
    title: "Privacy Mode",
    description: "Blur balances & sensitive values to stream / record safely.",
    icon: EyeSlashIcon,
  },
];

const REFERENCE_CARDS: IntentCard[] = [
  {
    href: "/docs/features",
    title: "Features deep dive",
    description:
      "Long-form technical reference — every feature, every config knob, every edge case in one searchable doc.",
    color: "text-purple-300",
    bg: "bg-purple-500/[0.05]",
    border: "border-purple-500/30",
    icon: CpuChipIcon,
  },
  {
    href: "/docs/user-guide",
    title: "Architecture & concepts",
    description:
      "How wallet encryption, RPC failover, IPFS pinning, and the API actually work under the hood.",
    color: "text-blue-300",
    bg: "bg-blue-500/[0.05]",
    border: "border-blue-500/30",
    icon: BookOpenIcon,
  },
  {
    href: "/docs/security",
    title: "Security guide",
    description:
      "Threat model, key rotation, seed phrase recovery, operational hygiene. Read once, then every quarter.",
    color: "text-red-300",
    bg: "bg-red-500/[0.05]",
    border: "border-red-500/30",
    icon: ShieldCheckIcon,
  },
];

function IntentTile({ doc }: { doc: IntentCard }) {
  const Icon = doc.icon;
  return (
    <Link
      href={doc.href}
      className={`group relative block p-6 rounded-2xl border ${doc.bg} ${doc.border} hover:scale-[1.01] hover:border-opacity-80 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-950 focus:ring-offivex-purple`}
    >
      {doc.badge ? (
        <span className="absolute top-3 right-3 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-white/[0.06] text-gray-200 border border-white/[0.10]">
          {doc.badge}
        </span>
      ) : null}
      <div className="flex items-start gap-3 mb-3">
        <div className="p-2 rounded-lg bg-white/[0.04] border border-white/[0.06]">
          <Icon className={`w-5 h-5 ${doc.color}`} />
        </div>
        <h3 className={`text-lg font-semibold ${doc.color} mt-1`}>
          {doc.title}
        </h3>
      </div>
      <p className="text-gray-400 text-sm leading-relaxed">{doc.description}</p>
    </Link>
  );
}

function FeatureTile({ card }: { card: FeatureCard }) {
  const Icon = card.icon;
  return (
    <Link
      href={card.href}
      className="group block p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:border-offivex-purple/30 hover:bg-offivex-purple/[0.04] transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-950 focus:ring-offivex-purple"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className="w-4 h-4 text-offivex-purple-light" />
        <h4 className="text-sm font-semibold text-gray-100 group-hover:text-offivex-purple-light transition-colors">
          {card.title}
        </h4>
      </div>
      <p className="text-xs text-gray-500 leading-relaxed">{card.description}</p>
    </Link>
  );
}

export default function DocsPage() {
  return (
    <div className="max-w-6xl mx-auto px-6 pt-12 pb-24">
      {/* Header */}
      <header className="mb-12">
        <div className="text-[11px] uppercase tracking-[0.22em] text-offivex-purple-light mb-3">
          Documentation
        </div>
        <h1 className="font-display text-5xl md:text-6xl font-bold tracking-tight leading-[0.98] mb-4">
          Help center
        </h1>
        <p className="text-offivex-text-secondary text-base md:text-lg max-w-2xl">
          Everything you need to launch, monitor, and wind down a token on
          Offivex. Pick the entry point that matches what you&rsquo;re trying to
          do right now.
        </p>
      </header>

      {/* By intent */}
      <section className="mb-14">
        <div className="flex items-center gap-2 mb-5">
          <h2 className="text-[11px] uppercase tracking-[0.22em] text-offivex-text-muted">
            By intent
          </h2>
          <div className="flex-1 h-px bg-white/[0.06]" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {INTENT_CARDS.map((c) => (
            <IntentTile key={c.href} doc={c} />
          ))}
        </div>
      </section>

      {/* Feature reference */}
      <section id="feature-reference" className="mb-14 scroll-mt-24">
        <div className="flex items-center gap-2 mb-5">
          <h2 className="text-[11px] uppercase tracking-[0.22em] text-offivex-text-muted">
            Feature reference
          </h2>
          <div className="flex-1 h-px bg-white/[0.06]" />
        </div>
        <p className="text-sm text-gray-500 mb-5 max-w-2xl">
          One page per sidebar entry. Same template every time: what it does,
          when to use it, walkthrough, config reference, pitfalls.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {FEATURE_CARDS.map((c) => (
            <FeatureTile key={c.href} card={c} />
          ))}
        </div>
      </section>

      {/* Reference / long-form */}
      <section className="mb-6">
        <div className="flex items-center gap-2 mb-5">
          <h2 className="text-[11px] uppercase tracking-[0.22em] text-offivex-text-muted">
            Long-form reference
          </h2>
          <div className="flex-1 h-px bg-white/[0.06]" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {REFERENCE_CARDS.map((c) => (
            <IntentTile key={c.href} doc={c} />
          ))}
        </div>
      </section>

      {/* Footer note */}
      <div className="mt-12 p-5 rounded-xl border border-white/[0.06] bg-white/[0.02]">
        <div className="flex items-start gap-3">
          <UserGroupIcon className="w-5 h-5 text-offivex-purple-light mt-0.5 shrink-0" />
          <div className="text-sm text-gray-400 leading-relaxed">
            <strong className="text-gray-200">Need a human?</strong> Anything
            that&rsquo;s not in these pages — billing edge cases, mainnet
            launch coordination, RPC partnership intros — reach out via the
            channel your admin shared with you when your invite was approved.
          </div>
        </div>
      </div>

      {/* Silence "unused" linter for unused fallback icons */}
      <span className="hidden">
        <CurrencyDollarIcon className="w-0 h-0" />
      </span>
    </div>
  );
}
