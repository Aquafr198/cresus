"use client";

import Image from "next/image";

interface LandingPageProps {
  onLogin: () => void;
}

export function LandingPage({ onLogin }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-[#060a14] text-gray-100 overflow-hidden">
      {/* Navbar — glassmorphism */}
      <nav className="fixed top-0 left-0 right-0 z-50">
        <div className="mx-auto max-w-6xl mt-4 px-4">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl px-6 h-14 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Image src="/logo.svg" alt="Cresus" width={30} height={30} className="rounded-lg" />
              <span className="text-lg font-semibold tracking-tight">Cresus</span>
            </div>

            <div className="hidden md:flex items-center gap-7 text-[13px] text-gray-400">
              <a href="#features" className="hover:text-white transition-colors">Features</a>
              <a href="#about" className="hover:text-white transition-colors">About</a>
            </div>

            <button
              onClick={onLogin}
              className="px-5 py-1.5 rounded-lg bg-white text-[#060a14] text-sm font-semibold hover:bg-gray-200 transition-colors"
            >
              Sign In
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-40 pb-32 px-6">
        {/* Blue light rays */}
        <div className="landing-rays absolute inset-0 pointer-events-none" />
        {/* Central glow */}
        <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-blue-600/20 rounded-full blur-[150px] pointer-events-none" />
        <div className="absolute top-[20%] left-[30%] w-[400px] h-[300px] bg-blue-500/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute top-[15%] right-[20%] w-[350px] h-[250px] bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none" />

        <div className="max-w-4xl mx-auto text-center relative z-10">
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight mb-6 leading-[0.95]">
            Dominate Your
            <br />
            <span className="landing-liquid-text bg-clip-text text-transparent">
              Token Launch.
            </span>
          </h1>

          <p className="text-base md:text-lg text-gray-500 max-w-xl mx-auto mb-12 leading-relaxed">
            Cresus helps you create tokens, bundle transactions, manage wallets, and automate trading with full encryption and zero third-party risk.
          </p>

          <button
            onClick={onLogin}
            className="px-8 py-3 rounded-xl bg-white text-[#060a14] font-semibold text-sm hover:bg-gray-200 transition-all hover:shadow-lg hover:shadow-blue-500/10"
          >
            Get Started
          </button>
        </div>

        {/* App preview mockup */}
        <div className="max-w-5xl mx-auto mt-20 relative z-10">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-md overflow-hidden shadow-2xl shadow-blue-500/5">
            {/* Window chrome */}
            <div className="h-9 bg-white/[0.03] flex items-center px-4 border-b border-white/[0.06]">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
              </div>
              <div className="flex-1 flex justify-center">
                <div className="px-4 py-0.5 rounded-md bg-white/[0.04] text-[11px] text-gray-600 font-mono">
                  cresus — dashboard
                </div>
              </div>
              <div className="w-14" />
            </div>

            <div className="flex">
              {/* Sidebar mock */}
              <div className="hidden md:flex w-48 border-r border-white/[0.06] bg-white/[0.01] flex-col py-4 px-3 gap-0.5 shrink-0">
                <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-blue-500/10 text-blue-400 text-xs font-medium">
                  <div className="w-3.5 h-3.5 rounded bg-blue-500/30" />
                  Dashboard
                </div>
                {["Wallets", "Mint Token", "Bundle", "Pump.fun", "Volume Bot", "Distribution"].map((item) => (
                  <div key={item} className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-gray-600 text-xs">
                    <div className="w-3.5 h-3.5 rounded bg-white/[0.06]" />
                    {item}
                  </div>
                ))}
              </div>

              {/* Main content */}
              <div className="flex-1 p-5 md:p-6 space-y-4">
                {/* Stats row */}
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: "Wallets", value: "24", change: "+3" },
                    { label: "Tokens", value: "7", change: "+1" },
                    { label: "Bundles", value: "156", change: "+12" },
                    { label: "Volume", value: "842", change: "+89" },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
                      <div className="text-[10px] text-gray-600 uppercase tracking-wider">{stat.label}</div>
                      <div className="flex items-baseline gap-1.5 mt-1">
                        <span className="text-xl font-semibold">{stat.value}</span>
                        <span className="text-[10px] text-green-400/80">{stat.change}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Chart + Activity */}
                <div className="grid grid-cols-5 gap-3">
                  {/* Chart area */}
                  <div className="col-span-3 rounded-xl bg-white/[0.02] border border-white/[0.05] p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs text-gray-500">Transaction volume</span>
                      <div className="flex gap-1">
                        {["1H", "1D", "1W"].map((t) => (
                          <div key={t} className={`px-2 py-0.5 rounded text-[10px] ${t === "1D" ? "bg-blue-500/15 text-blue-400" : "text-gray-600"}`}>
                            {t}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-[3px] items-end h-20">
                      {[20, 35, 28, 45, 38, 55, 42, 65, 50, 72, 58, 80, 62, 75, 68, 85, 70, 90, 78, 95, 82, 88, 76, 92].map((h, i) => (
                        <div
                          key={i}
                          className="flex-1 rounded-sm bg-gradient-to-t from-blue-500/40 to-blue-400/20"
                          style={{ height: `${h}%` }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Activity feed */}
                  <div className="col-span-2 rounded-xl bg-white/[0.02] border border-white/[0.05] p-4">
                    <div className="text-xs text-gray-500 mb-3">Live activity</div>
                    <div className="space-y-2.5">
                      {[
                        { action: "Token created", detail: "CRESUS", color: "bg-blue-400" },
                        { action: "Bundle landed", detail: "4 txns", color: "bg-green-400" },
                        { action: "SOL dispersed", detail: "12 wallets", color: "bg-purple-400" },
                        { action: "Volume cycle", detail: "swap #89", color: "bg-cyan-400" },
                      ].map((item, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <div className={`w-1.5 h-1.5 rounded-full ${item.color} mt-1.5 shrink-0`} />
                          <div>
                            <div className="text-[11px] text-gray-400">{item.action}</div>
                            <div className="text-[10px] text-gray-600">{item.detail}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* Gradient fade */}
          <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#060a14] to-transparent" />
        </div>
      </section>

      {/* Features — Bento grid */}
      <section id="features" className="relative py-24 px-6">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-blue-600/5 rounded-full blur-[120px] pointer-events-none" />

        <div className="max-w-5xl mx-auto relative z-10">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-5xl font-bold mb-4 tracking-tight">
              Everything you need
            </h2>
            <p className="text-gray-500 text-base max-w-md mx-auto">
              One platform. Full control over your Solana token lifecycle.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            {/* Wallet Manager — wide */}
            <div className="md:col-span-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 flex flex-col justify-between min-h-[200px] overflow-hidden relative group hover:border-white/[0.10] transition-colors">
              <div>
                <h3 className="text-lg font-semibold mb-1">Wallet Manager</h3>
                <p className="text-gray-500 text-sm max-w-xs">Generate and manage Solana wallets. AES-256 encrypted at rest.</p>
              </div>
              <div className="mt-4 flex gap-2">
                {["7xK9..m2Fq", "BvR3..nL8p", "Qw5t..jY4e", "Mn8k..dR2s"].map((addr) => (
                  <div key={addr} className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs text-gray-500 font-mono">
                    {addr}
                  </div>
                ))}
              </div>
            </div>

            {/* Self-Hosted — tall right */}
            <div className="md:col-span-2 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 flex flex-col justify-between min-h-[200px] hover:border-white/[0.10] transition-colors">
              <div>
                <h3 className="text-lg font-semibold mb-1">Self-Hosted</h3>
                <p className="text-gray-500 text-sm">Runs on your machine. No cloud. No third parties.</p>
              </div>
              <div className="mt-4 space-y-1.5">
                <div className="flex items-center gap-2 text-xs text-gray-600 font-mono">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400/80" />
                  localhost:3001
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-600 font-mono">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400/80" />
                  keys encrypted
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-600 font-mono">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400/80" />
                  zero telemetry
                </div>
              </div>
            </div>

            {/* Token Launcher — square */}
            <div className="md:col-span-2 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 flex flex-col justify-between min-h-[200px] hover:border-white/[0.10] transition-colors">
              <div>
                <h3 className="text-lg font-semibold mb-1">Token Launcher</h3>
                <p className="text-gray-500 text-sm">SPL tokens & Pump.fun launches with metadata and initial buys.</p>
              </div>
              <div className="mt-4 flex flex-col gap-1">
                <div className="h-7 rounded-md bg-white/[0.04] border border-white/[0.06] px-2.5 flex items-center text-[11px] text-gray-600 font-mono">name: &quot;CRESUS&quot;</div>
                <div className="h-7 rounded-md bg-white/[0.04] border border-white/[0.06] px-2.5 flex items-center text-[11px] text-gray-600 font-mono">supply: 1,000,000,000</div>
                <div className="h-7 rounded-md bg-blue-500/10 border border-blue-500/20 px-2.5 flex items-center text-[11px] text-blue-400 font-mono">→ deploy</div>
              </div>
            </div>

            {/* Bundle Engine — wide center */}
            <div className="md:col-span-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 flex flex-col justify-between min-h-[200px] overflow-hidden hover:border-white/[0.10] transition-colors">
              <div>
                <h3 className="text-lg font-semibold mb-1">Bundle Engine</h3>
                <p className="text-gray-500 text-sm max-w-sm">Atomic multi-tx bundles with Jito MEV protection. Front-run resistant.</p>
              </div>
              <div className="mt-4 flex items-center gap-2">
                {["TX 1", "TX 2", "TX 3", "TX 4"].map((tx, i) => (
                  <div key={tx} className="flex items-center gap-2">
                    <div className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs text-gray-400 font-mono">
                      {tx}
                    </div>
                    {i < 3 && <div className="text-gray-700 text-xs">→</div>}
                  </div>
                ))}
                <div className="ml-1 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-400 font-mono">
                  Bundle ✓
                </div>
              </div>
            </div>

            {/* Volume Bots — wide */}
            <div className="md:col-span-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 flex flex-col justify-between min-h-[180px] hover:border-white/[0.10] transition-colors">
              <div>
                <h3 className="text-lg font-semibold mb-1">Volume & Trading Bots</h3>
                <p className="text-gray-500 text-sm">Automated volume, price bumping, and wallet warming.</p>
              </div>
              <div className="mt-4 flex gap-1 items-end h-16">
                {[30, 45, 35, 60, 50, 75, 55, 80, 65, 90, 70, 85, 75, 95, 80].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-sm bg-blue-500/30"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
            </div>

            {/* Distribution — square */}
            <div className="md:col-span-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 flex flex-col justify-between min-h-[180px] hover:border-white/[0.10] transition-colors">
              <div>
                <h3 className="text-lg font-semibold mb-1">Distribution</h3>
                <p className="text-gray-500 text-sm">Disperse SOL & tokens across wallets with real-time tracking.</p>
              </div>
              <div className="mt-4 space-y-1.5">
                {[
                  { addr: "7xK9..m2Fq", pct: "85%" },
                  { addr: "BvR3..nL8p", pct: "62%" },
                  { addr: "Qw5t..jY4e", pct: "41%" },
                ].map((row) => (
                  <div key={row.addr} className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-600 font-mono w-20">{row.addr}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                      <div className="h-full rounded-full bg-blue-500/40" style={{ width: row.pct }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="about" className="relative py-24 px-6">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="max-w-2xl mx-auto text-center relative z-10">
          <h2 className="text-3xl md:text-5xl font-bold mb-4 tracking-tight">
            Your keys. Your <span className="italic text-blue-400">rules.</span>
          </h2>
          <p className="text-gray-500 text-base mb-10 leading-relaxed">
            Cresus runs entirely on your local machine. Wallet private keys are encrypted with AES-256 and never leave your device. No cloud, no trust assumptions.
          </p>
          <button
            onClick={onLogin}
            className="px-8 py-3 rounded-xl bg-white text-[#060a14] font-semibold text-sm hover:bg-gray-200 transition-all hover:shadow-lg hover:shadow-blue-500/10"
          >
            Start Using Cresus
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] py-8 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Image src="/logo.svg" alt="Cresus" width={22} height={22} className="rounded-md" />
            <span className="text-sm text-gray-600">Cresus</span>
          </div>
          <div className="text-xs text-gray-700">
            Self-hosted. Encrypted. Your keys, your rules.
          </div>
        </div>
      </footer>
    </div>
  );
}
