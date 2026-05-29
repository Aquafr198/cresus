"use client";

import Link from "next/link";
import { MarketingShell } from "@/components/landing/MarketingShell";

const MONTHLY_FEATURES = [
  "Access to all features",
  "Integrated RPC, proxies & captcha",
  "24/7 dedicated support",
  "Anti-flag updates",
];

const YEARLY_FEATURES = [
  "Access to all features",
  "Integrated RPC, proxies & captcha",
  "24/7 dedicated support",
  "Anti-flag updates",
  "Priority queue",
  "Onboarding consultant",
];

const FAQ = [
  {
    q: "Why is access restricted to applications?",
    a: "We screen for serious launchers, not retail. This keeps our anti-flag patterns effective, support quality high, and community tight. Tell us about your project — we review every application within 24 hours.",
  },
  {
    q: "How does crypto payment work?",
    a: "After your application is approved, you choose Crypto or Card in checkout. For crypto, we generate a unique payment address (SOL, USDC-Solana, or USDT-TRC20). Subscription activates within 2 confirmations.",
  },
  {
    q: "What's included in the Helius RPC?",
    a: "Monthly: dedicated Standard endpoint (50M CU/month). Yearly: shared Professional priority endpoint (300M CU/month). Both with gRPC access on request.",
  },
  {
    q: "Can I switch between Monthly and Yearly?",
    a: "Yes. Upgrade Monthly → Yearly anytime with pro-rata credit on the unused portion of your current month. Downgrade takes effect at the end of your current billing period.",
  },
  {
    q: "What about refunds?",
    a: "7-day refund on Monthly if you haven't launched. 30-day refund on Yearly, same conditions. Both refunded to original payment method (or stable equivalent for crypto).",
  },
];

export default function PricingPage() {
  return (
    <MarketingShell>
      {/* Hero */}
      <section className="relative pt-12 pb-14 px-6">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] halo-purple opacity-50 pointer-events-none" />
        <div className="max-w-2xl mx-auto text-center relative z-10">
          <div className="text-xs uppercase tracking-[0.2em] text-offivex-purple-light mb-4">Pricing</div>
          <h1 className="font-display text-5xl md:text-7xl font-bold tracking-tight leading-[0.95] mb-6">
            Pricing
          </h1>
          <p className="text-offivex-text-secondary text-base md:text-lg leading-relaxed">
            Premium tooling for teams that ship serious tokens.
            <br className="hidden md:block" />
            Two plans. No upsells, no hidden tiers.
          </p>
          <div className="mt-7">
            <a href="#full-features" className="text-sm text-offivex-purple-light hover:text-white transition-colors">
              See complete feature list →
            </a>
          </div>
        </div>
      </section>

      {/* Pricing cards */}
      <section className="relative px-6 pb-24">
        <div className="max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-5 relative z-10">
          {/* Monthly */}
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-8 flex flex-col">
            <div className="w-12 h-12 rounded-xl bg-offivex-purple/15 border border-offivex-purple/30 flex items-center justify-center mb-5">
              <BoxIcon />
            </div>
            <h2 className="font-display text-3xl font-bold mb-2">Monthly</h2>
            <p className="text-sm text-offivex-text-secondary mb-7">
              Premium tooling, billed every month.
            </p>
            <div className="flex items-baseline gap-1.5 mb-8">
              <span className="font-display text-5xl font-bold tracking-tight">$1,000</span>
              <span className="text-sm text-offivex-text-muted">/ month</span>
            </div>
            <ul className="space-y-3.5 mb-8 flex-1">
              {MONTHLY_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5">
                  <Check />
                  <span className="text-sm text-offivex-text-primary">{f}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/apply?plan=monthly"
              className="block text-center py-3 rounded-xl btn-purple text-sm"
            >
              Apply for Monthly
            </Link>
          </div>

          {/* Yearly */}
          <div className="rounded-2xl border border-offivex-purple/30 bg-gradient-to-b from-offivex-purple/[0.10] via-offivex-purple/[0.02] to-transparent p-8 flex flex-col relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 halo-purple opacity-60 pointer-events-none" />
            <div className="relative">
              <div className="w-12 h-12 rounded-xl bg-offivex-purple/25 border border-offivex-purple/40 flex items-center justify-center mb-5">
                <BoxIcon />
              </div>
              <h2 className="font-display text-3xl font-bold mb-2">Yearly</h2>
              <p className="text-sm text-offivex-text-secondary mb-7">
                Premium tooling, all year long.
              </p>
              <div className="flex items-baseline gap-1.5 mb-8">
                <span className="font-display text-5xl font-bold tracking-tight">$7,000</span>
                <span className="text-sm text-offivex-text-muted">/ year</span>
              </div>
              <ul className="space-y-3.5 mb-8 flex-1">
                {YEARLY_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <Check />
                    <span className="text-sm text-offivex-text-primary">{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/apply?plan=yearly"
                className="block text-center py-3 rounded-xl btn-purple text-sm"
              >
                Apply for Yearly
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="relative px-6 py-12 border-y border-white/[0.04] bg-offivex-bg-surface/30">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          <TrustItem icon={<ShieldIcon />} title="Self-custody preserved" desc="Your keys, encrypted with your password. We never see plaintext." />
          <TrustItem icon={<CoinIcon />} title="Crypto only" desc="SOL · USDC (Solana) · USDT (TRC20). Pay direct, no card, no chargebacks." />
          <TrustItem icon={<ClockIcon />} title="Refund window" desc="7 days on Monthly · 30 days on Yearly. No questions, no friction." />
        </div>
      </section>

      {/* Full features section */}
      <section id="full-features" className="relative px-6 py-24">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <div className="text-xs uppercase tracking-[0.2em] text-offivex-purple-light mb-3">Comparison</div>
            <h2 className="font-display text-4xl md:text-5xl font-bold tracking-tight mb-3">
              Complete feature list
            </h2>
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
            <table className="w-full">
              <thead className="bg-white/[0.02]">
                <tr className="text-left text-xs uppercase tracking-wider text-offivex-text-muted">
                  <th className="px-6 py-4 font-medium">Feature</th>
                  <th className="px-6 py-4 font-medium text-center">Monthly</th>
                  <th className="px-6 py-4 font-medium text-center">Yearly</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04] text-sm">
                <FeatureRow label="All trading features" m="✓" y="✓" />
                <FeatureRow label="Volume bot, Bumper, Warmer" m="✓" y="✓" />
                <FeatureRow label="Pump.fun launches + comment bot" m="✓" y="✓" />
                <FeatureRow label="Multi-wallet bundle (Jito)" m="100 / mo" y="Unlimited" />
                <FeatureRow label="Dedicated Helius RPC" m="50M CU/mo" y="300M CU/mo" />
                <FeatureRow label="Residential proxies" m="50 / day" y="200 / day" />
                <FeatureRow label="Anti-flag updates" m="Weekly" y="Daily" />
                <FeatureRow label="Email support response" m="24h" y="12h" />
                <FeatureRow label="Onboarding consultant" m="—" y="1 session" />
                <FeatureRow label="Personal manager" m="—" y="✓" />
                <FeatureRow label="Priority queue" m="—" y="✓" />
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="relative px-6 py-24 border-t border-white/[0.04]">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <div className="text-xs uppercase tracking-[0.2em] text-offivex-purple-light mb-3">Questions</div>
            <h2 className="font-display text-4xl md:text-5xl font-bold tracking-tight mb-3">
              Pricing FAQ
            </h2>
            <p className="text-sm text-offivex-text-secondary">
              Still have questions? Email <a href="mailto:hello@offivex.io" className="text-offivex-purple-light hover:text-white transition-colors">hello@offivex.io</a>
            </p>
          </div>

          <div className="space-y-3">
            {FAQ.map((item, i) => (
              <details
                key={i}
                className="group rounded-xl border border-white/[0.06] bg-white/[0.02] hover:border-offivex-purple/30 transition-colors"
              >
                <summary className="px-6 py-4 cursor-pointer flex items-center justify-between text-sm font-medium text-white list-none">
                  <span>{item.q}</span>
                  <span className="text-offivex-purple-light text-lg group-open:rotate-45 transition-transform">+</span>
                </summary>
                <div className="px-6 pb-5 text-sm text-offivex-text-secondary leading-relaxed">{item.a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative px-6 py-24 border-t border-white/[0.04] overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] halo-purple opacity-50 pointer-events-none" />
        <div className="max-w-2xl mx-auto text-center relative z-10">
          <h2 className="font-display text-4xl md:text-5xl font-bold tracking-tight mb-5 leading-[1.05]">
            Ready to launch?
          </h2>
          <p className="text-offivex-text-secondary mb-9 leading-relaxed">
            Tell us about your project. We review every application within 24 hours.
          </p>
          <Link href="/apply" className="inline-block px-8 py-3.5 rounded-xl btn-purple text-sm">
            Apply for access
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}

function FeatureRow({ label, m, y }: { label: string; m: string; y: string }) {
  return (
    <tr>
      <td className="px-6 py-3.5 text-offivex-text-primary">{label}</td>
      <td className={`px-6 py-3.5 text-center font-mono ${m === "—" ? "text-offivex-text-muted" : m === "✓" ? "text-offivex-purple-light" : "text-offivex-text-primary"}`}>
        {m}
      </td>
      <td className={`px-6 py-3.5 text-center font-mono ${y === "—" ? "text-offivex-text-muted" : y === "✓" ? "text-offivex-purple-light" : "text-offivex-text-primary"}`}>
        {y}
      </td>
    </tr>
  );
}

function TrustItem({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-10 h-10 rounded-xl bg-offivex-purple/15 border border-offivex-purple/25 flex items-center justify-center shrink-0 text-offivex-purple-light">
        {icon}
      </div>
      <div>
        <div className="text-sm font-semibold text-white mb-0.5">{title}</div>
        <div className="text-xs text-offivex-text-secondary leading-relaxed">{desc}</div>
      </div>
    </div>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CoinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="6" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <path d="M9 9.5h5a1.5 1.5 0 0 1 0 3H10m0 0h4a1.5 1.5 0 0 1 0 3H9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <polyline points="12 7 12 12 15.5 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 mt-0.5 shrink-0">
      <path d="M3 8.5L6.5 12L13 4.5" stroke="#9945FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BoxIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" stroke="#B070FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m3.27 6.96 8.73 5.05 8.73-5.05M12 22.08V12" stroke="#B070FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
