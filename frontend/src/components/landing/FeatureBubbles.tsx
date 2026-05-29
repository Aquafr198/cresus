import Image from "next/image";
import Link from "next/link";
import {
  AnimatedNetworkIcon,
  AnimatedShieldIcon,
  AnimatedBarsIcon,
} from "@/components/animate-ui/icons";

/**
 * FeatureBubbles — replaces the old PricingPreview on the landing page.
 * Asymmetric bento with a HERO Referral card (white background to pop the
 * illustration) + 5 dark glassmorphism feature bubbles around it.
 */
export function FeatureBubbles() {
  return (
    <section id="features-grid" className="relative py-24 px-6 border-t border-white/[0.04]">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] halo-purple opacity-40 pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-xs uppercase tracking-[0.2em] text-offivex-purple-light mb-3">
            What Offivex unlocks
          </div>
          <h2 className="font-display text-4xl md:text-5xl font-bold tracking-tight leading-[1.05]">
            Everything serious launchers need —
            <br />
            <span className="text-solana-gradient">and a referral program that pays back.</span>
          </h2>
        </div>

        {/* Bento grid */}
        <div className="grid grid-cols-12 gap-5">
          {/* HERO Referral card (white bg, pop) */}
          <div className="col-span-12 lg:col-span-7 row-span-2 rounded-3xl bg-white text-offivex-bg-base p-8 md:p-10 relative overflow-hidden flex flex-col">
            <h3 className="font-display text-3xl md:text-4xl font-bold tracking-tight leading-[1.05] mb-4">
              Refer &amp; earn{" "}
              <span className="text-offivex-purple">10% recurring</span>
              <br />
              on every subscription.
            </h3>

            <p className="text-offivex-bg-base/60 text-sm md:text-base mb-6 max-w-md leading-relaxed">
              Share your unique code. Every time a referee subscribes, you receive
              10% of their payment credited to your next bill — for as long as they
              remain subscribed. No cap, no expiration.
            </p>

            <div className="flex-1 flex items-center justify-center my-4">
              <Image
                src="/referall.png"
                alt="Referral program illustration"
                width={1448}
                height={1086}
                className="w-full max-w-md h-auto"
                loading="lazy"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/apply"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl btn-purple text-sm"
              >
                Apply for access
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center text-sm text-offivex-bg-base/70 hover:text-offivex-bg-base transition-colors underline underline-offset-4"
              >
                See pricing →
              </Link>
            </div>
          </div>

          {/* Right column — 2 stacked cards (with the bottom row this gives us 3 small + 2 wide = 5 features) */}
          <BubbleCard
            className="col-span-12 md:col-span-6 lg:col-span-5"
            icon={<AnimatedNetworkIcon />}
            title="Integrated RPC, proxies &amp; captcha"
            desc="Premium Helius RPC, 200+ residential proxies, and bot-resilient captcha — bundled with every subscription. No extra invoices to juggle."
          />
          <BubbleCard
            className="col-span-12 md:col-span-6 lg:col-span-5"
            icon={<AnimatedShieldIcon />}
            title="Anti-flag updated daily"
            desc="Our research team monitors Pump.fun and BullX detection patterns continuously. New evasion fingerprints push to your dashboard every 24h."
          />

          {/* Bottom row — 2 wide cards */}
          <BubbleCard
            className="col-span-12 md:col-span-6"
            icon={<AnimatedBarsIcon />}
            title="Volume bot &amp; Bumper"
            desc="Mimic real retail patterns across wallets. Same-block buy/sell. Configurable cycles, slippage and rotation logic."
          />
          {/* Fast / Secure / Premium — second white card to balance the layout (diagonal to the HERO Referral) */}
          <div className="col-span-12 md:col-span-6 rounded-3xl bg-white text-offivex-bg-base p-7 relative overflow-hidden flex flex-col md:flex-row gap-5 items-center">
            <div className="flex-1 order-2 md:order-1">
              <h3 className="font-display text-xl md:text-2xl font-bold tracking-tight leading-[1.1] mb-2">
                Fast, secure &amp; premium experience
              </h3>
              <p className="text-sm text-offivex-bg-base/60 leading-relaxed">
                Sub-second bundle submission, encrypted-at-rest wallets, dedicated RPC nodes,
                24/7 monitoring. The platform stays out of your way so you can focus on the launch.
              </p>
            </div>
            <div className="order-1 md:order-2 shrink-0 md:w-2/5 flex justify-center">
              <Image
                src="/fast.png"
                alt="Fast, secure and premium experience"
                width={1672}
                height={941}
                className="w-full max-w-[220px] h-auto"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   Bubble card primitive — dark glassmorphism
   ============================================================ */
function BubbleCard({
  className,
  icon,
  title,
  desc,
}: {
  className?: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div
      className={`${className} rounded-3xl border border-white/[0.08] bg-white/[0.02] p-7 hover:border-offivex-purple/30 hover:bg-white/[0.03] transition-colors`}
    >
      <div className="w-11 h-11 rounded-xl bg-offivex-purple/15 border border-offivex-purple/30 flex items-center justify-center text-offivex-purple-light mb-5">
        {icon}
      </div>
      <h3
        className="font-display text-lg font-semibold mb-2 text-white"
        dangerouslySetInnerHTML={{ __html: title }}
      />
      <p
        className="text-sm text-offivex-text-secondary leading-relaxed"
        dangerouslySetInnerHTML={{ __html: desc }}
      />
    </div>
  );
}

/* (static icons removed — replaced by AnimatedNetworkIcon / AnimatedShieldIcon / AnimatedBarsIcon
   from @/components/animate-ui/icons, motion-powered) */
