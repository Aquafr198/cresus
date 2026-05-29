import Image from "next/image";
import Link from "next/link";
import { FeatureBubbles } from "@/components/landing/FeatureBubbles";
import { SiteFooter } from "@/components/landing/SiteFooter";

export function LandingPage() {
  return (
    <div className="relative min-h-screen bg-offivex-bg-base text-offivex-text-primary overflow-hidden noise-grain">
      <Nav />
      <Hero />
      <HeroMockup />
      <FeaturesIntro />
      <WalletManagerShowcase />
      <TransactionMonitorShowcase />
      <QuickSetupShowcase />
      <FeatureBubbles />
      <SiteFooter />
    </div>
  );
}

/* ============================================================
   Nav — sticky glassmorphism
   ============================================================ */
function Nav() {
  return (
    <nav className="relative z-50">
      <div className="mx-auto max-w-7xl px-6 h-20 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <Image src="/logo.png" alt="Offivex" width={48} height={40} priority />
          <span className="text-[1.35rem] font-display font-semibold tracking-tight">Offivex</span>
        </Link>

        <div className="hidden md:flex items-center gap-8 text-sm text-offivex-text-secondary">
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link>
          <Link href="/docs" className="hover:text-white transition-colors">Documentation</Link>
        </div>

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
  );
}

/* ============================================================
   Hero — centered, sober (Kinesis-style)
   ============================================================ */
function Hero() {
  return (
    <section className="relative pt-16 pb-16 px-6">
      <div className="absolute top-[5%] left-1/2 -translate-x-1/2 w-[900px] h-[500px] halo-purple pointer-events-none" />

      <div className="max-w-3xl mx-auto text-center relative z-10">
        <h1 className="font-display text-5xl md:text-7xl font-bold tracking-tight leading-[0.98] mb-7 animate-fade-up">
          Introducing the ultimate
          <br />
          <span className="text-solana-gradient">Solana toolkit.</span>
        </h1>

        <p
          className="text-base md:text-lg text-offivex-text-secondary max-w-xl mx-auto mb-10 leading-relaxed animate-fade-up"
          style={{ animationDelay: "0.1s" }}
        >
          Take control of your token launches and unlock new growth opportunities,
          all from a single platform.
        </p>

        <div
          className="flex flex-col sm:flex-row items-center justify-center gap-3 animate-fade-up"
          style={{ animationDelay: "0.2s" }}
        >
          <Link href="/apply" className="px-7 py-3 rounded-xl btn-purple text-sm">
            Get started
          </Link>
          <Link href="/docs" className="px-7 py-3 text-sm text-offivex-text-secondary hover:text-white transition-colors underline underline-offset-4">
            Read the documentation
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   HeroMockup — large dashboard preview below hero
   ============================================================ */
function HeroMockup() {
  return (
    <section className="relative px-6 pb-24">
      <div className="max-w-6xl mx-auto relative z-10 animate-fade-up" style={{ animationDelay: "0.35s" }}>
        <div className="rounded-2xl glass-card overflow-hidden">
          {/* Window chrome */}
          <div className="h-10 bg-white/[0.03] flex items-center px-4 border-b border-white/[0.06]">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
              <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
              <div className="w-3 h-3 rounded-full bg-[#28c840]" />
            </div>
            <div className="flex-1 flex justify-center">
              <div className="px-4 py-1 rounded-md bg-white/[0.04] text-[11px] text-offivex-text-muted font-mono">
                app.offivex.io / dashboard
              </div>
            </div>
            <div className="w-14" />
          </div>

          <div className="flex bg-offivex-bg-base">
            {/* Sidebar */}
            <div className="hidden md:flex w-56 border-r border-white/[0.06] bg-offivex-bg-surface flex-col py-5 px-3 shrink-0">
              <div className="flex items-center gap-2 px-2 mb-6">
                <Image src="/logo.png" alt="Offivex" width={29} height={24} loading="lazy" />
                <div>
                  <div className="text-xs font-display font-bold tracking-wider">OFFIVEX</div>
                  <div className="text-[9px] text-offivex-text-muted">Solana Launch Platform</div>
                </div>
              </div>

              <SidebarSection label="Overview" items={[
                { label: "Dashboard", active: true },
                { label: "Wallets" },
              ]} />
              <SidebarSection label="Token Launch" items={[
                { label: "Mint Token" },
                { label: "Bundle / Launch" },
                { label: "Pump.fun" },
                { label: "Meme Library" },
              ]} />
              <SidebarSection label="Trading Bots" items={[
                { label: "Manual Trade" },
                { label: "Volume Bot" },
                { label: "Bumper Bot" },
                { label: "Wallet Warmer" },
              ]} />
              <SidebarSection label="Tools" items={[
                { label: "Distribution" },
                { label: "Profiles" },
                { label: "Monitor" },
              ]} />
            </div>

            {/* Main content */}
            <div className="flex-1 p-6 space-y-5 min-w-0">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-2xl font-bold">Dashboard</h3>
                <button className="text-xs text-offivex-purple-light hover:text-white transition-colors">
                  Refresh stats →
                </button>
              </div>

              {/* Stat cards 4x2 multicolor border-left */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Wallets", value: "24", border: "border-l-offivex-purple", sub: "+3 this week" },
                  { label: "Tokens", value: "7", border: "border-l-offivex-purple-light", sub: "+1 today" },
                  { label: "Bundles", value: "156", border: "border-l-offivex-green", sub: "98% landed" },
                  { label: "Distributions", value: "42", border: "border-l-amber-400", sub: "+8 today" },
                  { label: "Profiles", value: "31", border: "border-l-cyan-400", sub: "active" },
                  { label: "Meme Assets", value: "184", border: "border-l-pink-400", sub: "uploaded" },
                  { label: "Active RPCs", value: "3", border: "border-l-offivex-green", sub: "all healthy" },
                  { label: "Vol 24h", value: "$842k", border: "border-l-offivex-purple", sub: "+18.4%" },
                ].map((s) => (
                  <div key={s.label} className={`rounded-xl bg-offivex-bg-surface border border-white/[0.06] ${s.border} border-l-4 p-3.5`}>
                    <div className="text-[10px] text-offivex-text-muted uppercase tracking-wider">{s.label}</div>
                    <div className="text-xl font-bold mt-1">{s.value}</div>
                    <div className="text-[10px] text-offivex-text-secondary mt-0.5">{s.sub}</div>
                  </div>
                ))}
              </div>

              {/* Getting Started + Quick actions */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <div className="lg:col-span-2 rounded-xl bg-offivex-bg-surface border border-white/[0.06] p-5">
                  <div className="flex items-baseline justify-between mb-4">
                    <h4 className="text-sm font-semibold">Getting Started</h4>
                    <span className="text-[10px] text-offivex-text-muted">4 of 5 complete</span>
                  </div>
                  <div className="space-y-2.5">
                    {[
                      { l: "Set encryption password", done: true },
                      { l: "Configure premium RPC", done: true },
                      { l: "Create your first wallet", done: true },
                      { l: "Mint your token", done: true },
                      { l: "Launch your first bundle", done: false },
                    ].map((step, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                          step.done
                            ? "bg-offivex-green/20 border border-offivex-green/40 text-offivex-green"
                            : "bg-white/[0.04] border border-white/[0.10] text-offivex-text-muted"
                        }`}>
                          {step.done ? "✓" : i + 1}
                        </div>
                        <span className={`text-xs ${step.done ? "text-offivex-text-muted line-through" : "text-offivex-text-primary"}`}>
                          {step.l}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl bg-offivex-bg-surface border border-white/[0.06] p-5">
                  <h4 className="text-sm font-semibold mb-4">Quick actions</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {["Create Wallet", "Mint Token", "Launch Bundle", "Distribute SOL"].map((a) => (
                      <button key={a} className="px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[11px] text-offivex-text-secondary hover:bg-offivex-purple/15 hover:border-offivex-purple/30 hover:text-offivex-purple-light transition-colors">
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SidebarSection({ label, items }: { label: string; items: { label: string; active?: boolean }[] }) {
  return (
    <div className="mb-5">
      <div className="px-2 mb-2 text-[9px] uppercase tracking-wider text-offivex-text-muted font-semibold">{label}</div>
      <div className="space-y-0.5">
        {items.map((item) => (
          <div
            key={item.label}
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] ${
              item.active
                ? "bg-offivex-purple/15 text-offivex-purple-light border border-offivex-purple/30"
                : "text-offivex-text-muted"
            }`}
          >
            <div className={`w-3 h-3 rounded ${item.active ? "bg-offivex-purple/40" : "bg-white/[0.06]"}`} />
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   FeaturesIntro — "Powerful features at your fingertips"
   ============================================================ */
function FeaturesIntro() {
  return (
    <section id="features" className="relative py-24 px-6">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="font-display text-4xl md:text-6xl font-bold tracking-tight leading-[1.05] mb-5">
          <span className="text-solana-gradient">Powerful features</span> at
          <br />your fingertips
        </h2>
        <p className="text-offivex-text-secondary text-base md:text-lg max-w-xl mx-auto">
          Discover unique solutions designed to streamline your journey and improve your experience.
        </p>
      </div>
    </section>
  );
}

/* ============================================================
   WalletManagerShowcase — 4 wallet group cards mockup
   ============================================================ */
function WalletManagerShowcase() {
  const groups = [
    { name: "My Group 1", sol: "4.39", usd: "$684", wallets: 9 },
    { name: "Snipe Wallets", sol: "12.81", usd: "$1,991", wallets: 24 },
    { name: "Volume Bot", sol: "2.45", usd: "$381", wallets: 6 },
    { name: "Dev Wallets", sol: "8.07", usd: "$1,254", wallets: 12 },
  ];

  return (
    <section className="relative px-6 pb-24">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h3 className="font-display text-2xl md:text-3xl font-bold tracking-tight mb-2">Wallet Manager</h3>
          <p className="text-offivex-text-secondary text-sm md:text-base">
            Take full control of your wallets with smart grouping and easy management.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {groups.map((g) => (
            <div key={g.name} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 hover:border-offivex-purple/30 transition-colors">
              <div className="flex items-center justify-between mb-5">
                <div className="w-9 h-9 rounded-lg bg-offivex-purple/15 border border-offivex-purple/30 flex items-center justify-center text-offivex-purple-light">
                  <WalletGroupIcon />
                </div>
                <button className="text-[11px] text-offivex-purple-light hover:text-white transition-colors">
                  View Wallets
                </button>
              </div>
              <div className="text-sm font-semibold text-white mb-2">{g.name}</div>
              <div className="flex items-baseline gap-2">
                <span className="font-display text-2xl font-bold">{g.sol}</span>
                <span className="text-xs text-offivex-text-muted">SOL</span>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/[0.04]">
                <span className="text-xs text-offivex-text-muted">{g.usd}</span>
                <span className="text-xs text-offivex-text-muted">{g.wallets} wallets</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   TransactionMonitorShowcase — activity table mockup
   ============================================================ */
function TransactionMonitorShowcase() {
  const activity = [
    { i: "0s", w: "Esk...fkE", type: "Sell", amount: "0.20" },
    { i: "1s", w: "Awd...FIe", type: "Buy", amount: "0.20" },
    { i: "2s", w: "Lch...gkZ", type: "Sell", amount: "0.20" },
    { i: "3s", w: "Pmr...8tQ", type: "Buy", amount: "0.45" },
    { i: "5s", w: "Vxk...n3W", type: "Sell", amount: "0.12" },
    { i: "7s", w: "Jdf...4pY", type: "Buy", amount: "0.31" },
  ];

  return (
    <section className="relative px-6 pb-24">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h3 className="font-display text-2xl md:text-3xl font-bold tracking-tight mb-2">Built-In Transaction Monitor</h3>
          <p className="text-offivex-text-secondary text-sm md:text-base">
            Track live transactions across all of your mints in real-time.
          </p>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-offivex-green animate-pulse" />
              <span className="text-sm font-semibold">Activity</span>
            </div>
            <div className="flex items-center gap-3 flex-1 max-w-xs ml-6">
              <span className="text-[11px] text-offivex-text-muted whitespace-nowrap">Bonding curve</span>
              <div className="flex-1 h-1 rounded-full bg-white/[0.04] overflow-hidden">
                <div className="h-full bg-offivex-purple-light" style={{ width: "10%" }} />
              </div>
              <span className="text-[11px] font-mono text-offivex-purple-light">10%</span>
            </div>
          </div>

          <table className="w-full">
            <thead className="bg-white/[0.02]">
              <tr className="text-left text-[10px] uppercase tracking-wider text-offivex-text-muted">
                <th className="px-5 py-3 font-medium w-12">#</th>
                <th className="px-5 py-3 font-medium">Wallet</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {activity.map((row, i) => (
                <tr key={i} className="hover:bg-white/[0.01] transition-colors">
                  <td className="px-5 py-3 text-xs text-offivex-text-muted font-mono">{row.i}</td>
                  <td className="px-5 py-3 text-xs text-offivex-text-secondary font-mono">{row.w}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider ${
                      row.type === "Buy"
                        ? "bg-offivex-green/15 text-offivex-green border border-offivex-green/30"
                        : "bg-red-500/15 text-red-300 border border-red-500/30"
                    }`}>
                      {row.type}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-offivex-text-primary font-mono text-right">{row.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   QuickSetupShowcase — mint form mockup
   ============================================================ */
function QuickSetupShowcase() {
  return (
    <section className="relative px-6 pb-24">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] halo-purple opacity-50 pointer-events-none" />

      <div className="max-w-3xl mx-auto text-center relative z-10 mb-10">
        <div className="text-xs uppercase tracking-[0.2em] text-offivex-purple-light mb-3">Quick Setup</div>
        <h2 className="font-display text-4xl md:text-5xl font-bold tracking-tight leading-[1.05] mb-5">
          Launch your tokens
          <br />on Solana with ease
        </h2>
        <p className="text-offivex-text-secondary text-base max-w-lg mx-auto">
          Mint your own coin or clone existing ones, with early access to your contract address — all in just a few clicks.
        </p>
      </div>

      <div className="max-w-2xl mx-auto relative z-10">
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 space-y-4">
          <MockField label="Dev Private Key" placeholder="••••••••••••••••••••••••••••••••" type="password" />

          <div className="grid grid-cols-2 gap-3">
            <MockField label="Buy Amount" placeholder="0.5 SOL" />
            <MockField label="Auto Sell Amount" placeholder="50%" />
          </div>

          <MockField label="Your Mint" placeholder="bycExcs4WvjBHoRBhkqMKF81WxVtPHxbFPZ8fNNpump" mono />

          <div className="flex items-center justify-between py-2">
            <span className="text-xs text-offivex-text-secondary">Use Vanity</span>
            <div className="w-10 h-5 rounded-full bg-offivex-purple p-0.5 flex items-center justify-end">
              <div className="w-4 h-4 rounded-full bg-white" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <MintActionCard icon={<NewProfileIcon />} title="New Profile" desc="Setup a new mint profile" />
            <MintActionCard icon={<CloneIcon />} title="Clone" desc="Clone an existing mint" />
          </div>
        </div>
      </div>
    </section>
  );
}

function MockField({ label, placeholder, type = "text", mono = false }: { label: string; placeholder: string; type?: string; mono?: boolean }) {
  return (
    <div>
      <label className="block text-[10px] text-offivex-text-muted mb-1.5 uppercase tracking-wider">{label}</label>
      <div className={`w-full px-3 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-sm text-offivex-text-muted ${mono ? "font-mono truncate" : ""}`}>
        {type === "password" ? placeholder : placeholder}
      </div>
    </div>
  );
}

function MintActionCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 hover:border-offivex-purple/30 hover:bg-offivex-purple/5 transition-colors cursor-pointer">
      <div className="w-8 h-8 rounded-lg bg-offivex-purple/15 border border-offivex-purple/30 flex items-center justify-center text-offivex-purple-light mb-3">
        {icon}
      </div>
      <div className="text-sm font-semibold text-white mb-0.5">{title}</div>
      <div className="text-[11px] text-offivex-text-muted">{desc}</div>
    </div>
  );
}

/* (ThreeFeatureBoxes + SmallFeatureBox removed — moved into FeatureBubbles bento) */

/* (Footer extracted to @/components/landing/SiteFooter — single source of truth) */

/* ============================================================
   Inline SVG icons (sharp, no emoji, strokeWidth 1.5)
   ============================================================ */

function WalletGroupIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
      <rect x="3" y="6" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M16 13h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M3 10h18" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function NewProfileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="18" cy="5" r="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M18 4v2M17 5h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function CloneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
      <rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 16V6a2 2 0 0 1 2-2h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/* (XLogo / TelegramLogo moved into SiteFooter — single source) */
