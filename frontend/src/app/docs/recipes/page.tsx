"use client";

import Link from "next/link";
import {
  DocLayout,
  DocSection,
  DocCode,
  DocTable,
} from "../_components/DocLayout";
import { DocCallout } from "../_components/DocCallout";

const TOC = [
  { id: "sniper-bundle", label: "1 — Sniper bundle launch" },
  { id: "fair-launch", label: "2 — Fair launch (no snipe)" },
  { id: "pumpfun-migration", label: "3 — Pump.fun → Raydium" },
  { id: "volume-warmup", label: "4 — Volume bot warmup" },
  { id: "multi-wallet-sell", label: "5 — Multi-wallet dev sell" },
  { id: "anti-detect", label: "6 — Anti-detect setup" },
  { id: "pass-dextools-rugcheck", label: "7 — Pass DEXTools / RugCheck" },
];

function Recipe({
  id,
  num,
  title,
  goal,
  when,
  prereqs,
  steps,
  settings,
  cost,
  fail,
}: {
  id: string;
  num: number;
  title: string;
  goal: string;
  when: string;
  prereqs: React.ReactNode;
  steps: React.ReactNode[];
  settings: { name: string; value: string }[];
  cost: { name: string; value: string }[];
  fail: { name: string; value: string }[];
}) {
  return (
    <section id={id} className="mb-14 scroll-mt-24">
      <div className="flex items-center gap-3 mb-3">
        <span className="shrink-0 w-9 h-9 rounded-full bg-offivex-purple/15 border border-offivex-purple/40 text-offivex-purple-light text-sm font-bold flex items-center justify-center">
          {num}
        </span>
        <h2 className="text-2xl font-semibold text-gray-100">{title}</h2>
      </div>
      <div className="ml-12 text-sm text-gray-300 leading-relaxed space-y-4">
        <p>
          <strong className="text-gray-100">Goal: </strong>
          {goal}
        </p>
        <p>
          <strong className="text-gray-100">When to use: </strong>
          {when}
        </p>
        <div>
          <strong className="text-gray-100">Pre-requisites:</strong>
          <div className="mt-1">{prereqs}</div>
        </div>
        <div>
          <strong className="text-gray-100">Steps:</strong>
          <ol className="list-decimal list-inside mt-1 space-y-1">
            {steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
        <div>
          <strong className="text-gray-100">Suggested settings:</strong>
          <ul className="mt-1 space-y-1">
            {settings.map((s, i) => (
              <li key={i} className="flex gap-2">
                <DocCode>{s.name}</DocCode>
                <span className="text-gray-400">→</span>
                <span>{s.value}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <strong className="text-gray-100">Approximate cost:</strong>
          <ul className="mt-1 space-y-1">
            {cost.map((c, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-gray-400">{c.name}:</span>
                <span>{c.value}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <strong className="text-gray-100">Failure modes:</strong>
          <ul className="list-disc list-inside mt-1 space-y-1">
            {fail.map((f, i) => (
              <li key={i}>
                <strong className="text-gray-200">{f.name}:</strong>{" "}
                {f.value}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export default function RecipesPage() {
  return (
    <DocLayout
      eyebrow="Recipes"
      title="Proven launch patterns"
      intro="Six end-to-end patterns. Each one is a specific combination of features with concrete settings, expected costs, and the failure modes I've actually seen in practice. Use them as starting points — every launch is different, but these get you 80% of the way."
      breadcrumbs={[{ href: "/docs", label: "Documentation" }]}
      prev={{ href: "/docs/tutorial", label: "Master tutorial" }}
      next={{ href: "/docs/troubleshooting", label: "Troubleshooting" }}
      toc={TOC}
    >
      <DocCallout variant="info" title="Pick one">
        Don&rsquo;t try to combine recipes 1, 2, and 3 on the same mint —
        they&rsquo;re mutually exclusive launch paths. Recipes 4, 5, 6 stack
        on top of any of the launch styles.
      </DocCallout>

      <Recipe
        id="sniper-bundle"
        num={1}
        title="Sniper bundle launch"
        goal="Get N snipe wallets the very first buys against your own LP, before any external sniper can act."
        when="Highest-conviction launches where you expect external sniper competition and want pre-allocated supply to a small set of wallets."
        prereqs={
          <ul className="list-disc list-inside space-y-1">
            <li>Mainnet, paid RPC, Jito-enabled.</li>
            <li>
              Dev wallet funded with ~10 SOL for LP + ~2 SOL for tip/fees.
            </li>
            <li>5–10 sub-wallets, each funded with 0.5–2 SOL.</li>
            <li>Token minted via <Link href="/docs/feature/mint" className="text-offivex-purple-light underline">/mint</Link>.</li>
          </ul>
        }
        steps={[
          <>Distribute funding to snipe wallets via <Link href="/docs/feature/distribution" className="text-offivex-purple-light underline">/distribution</Link>, 30% variance, 60–180s delays, 1 hop.</>,
          <>Open <Link href="/docs/feature/bundle" className="text-offivex-purple-light underline">/bundle</Link>, select mint, set base_amount and quote_amount (10 SOL of SOL-side is a strong floor).</>,
          <>Add each sub-wallet as a snipe row, spend = 0.5–2 SOL each, total snipe spend ≤ 25% of quote.</>,
          <>Bump tip to 100k–200k lamports for competitive blocks.</>,
          <>Click Launch. Verify the bundle landed via the returned signatures on Solscan.</>,
          <>Open <Link href="/docs/feature/monitor" className="text-offivex-purple-light underline">/monitor</Link>, subscribe to the mint, confirm snipes show up before any external buy.</>,
        ]}
        settings={[
          { name: "base_amount", value: "20–40% of supply" },
          { name: "quote_amount (SOL)", value: "10–25" },
          { name: "jito_tip_lamports", value: "100 000–250 000" },
          { name: "slippage_bps", value: "1500–3000 (snipes)" },
          { name: "snipes (count)", value: "5–10" },
        ]}
        cost={[
          { name: "Market + LP rent", value: "~0.5 SOL" },
          { name: "LP seed", value: "10–25 SOL (recoverable)" },
          { name: "Jito tip", value: "0.0001–0.00025 SOL" },
          { name: "Snipe spend", value: "Up to 25% of quote" },
          { name: "Total at risk", value: "11–35 SOL" },
        ]}
        fail={[
          { name: "Bundle dropped", value: "Tip too low. Re-submit with a higher tip — your state is unchanged." },
          { name: "Snipe N failed", value: "Slippage exceeded for the last snipe in line; raise its slippage." },
          { name: "Token not tradeable post-launch", value: "Something went wrong with market init. Verify via Solscan, contact admin." },
        ]}
      />

      <Recipe
        id="fair-launch"
        num={2}
        title="Fair launch (no snipe)"
        goal="Launch with LP + market but no pre-allocated snipe. Signal to the community that you have no insider position."
        when="Community-first projects where the anti-rugpull narrative is more valuable than a snipe head-start."
        prereqs={
          <ul className="list-disc list-inside space-y-1">
            <li>Mainnet, paid RPC.</li>
            <li>Dev wallet funded with LP seed + small buffer.</li>
            <li>Token minted, mint authority revoked.</li>
          </ul>
        }
        steps={[
          <>Open <Link href="/docs/feature/bundle" className="text-offivex-purple-light underline">/bundle</Link>, select mint, set base_amount and quote_amount.</>,
          <>Leave the snipe set empty. Total snipe spend = 0.</>,
          <>Tip can be modest (10k–25k) since you&rsquo;re not racing external snipers — they&rsquo;ll be there too, just at the same starting line.</>,
          <>Launch.</>,
          <>Post the mint on socials with a screenshot of the launch tx — proof of zero insider buys.</>,
          <>(Optional) Run a Bumper Bot for the first hour to defend against panic sells.</>,
        ]}
        settings={[
          { name: "base_amount", value: "40–60% of supply" },
          { name: "quote_amount (SOL)", value: "10–25" },
          { name: "jito_tip_lamports", value: "10 000–25 000" },
          { name: "snipes", value: "[] (empty)" },
          { name: "revoke_mint_authority", value: "true" },
        ]}
        cost={[
          { name: "Market + LP rent", value: "~0.5 SOL" },
          { name: "LP seed", value: "10–25 SOL (recoverable)" },
          { name: "Jito tip", value: "0.00001–0.000025 SOL" },
          { name: "Total at risk", value: "10–25 SOL" },
        ]}
        fail={[
          { name: "Public snipers take the first 10 buys", value: "Expected. The point is fairness, not capture." },
          { name: "Token dies in the first 5 minutes", value: "Without snipe pressure, organic interest has to be real. Validate your narrative before launching." },
        ]}
      />

      <Recipe
        id="pumpfun-migration"
        num={3}
        title="Pump.fun → Raydium graduation"
        goal="Launch on Pump.fun's bonding curve, ride to migration ($69k MC threshold), continue on Raydium."
        when="Audience-first launches that benefit from PF's discovery surface (trending tab, browse page)."
        prereqs={
          <ul className="list-disc list-inside space-y-1">
            <li>Mainnet (PF doesn&rsquo;t exist on devnet).</li>
            <li>0.05–2 SOL on the dev wallet.</li>
            <li>Image ≤ 4 MB.</li>
          </ul>
        }
        steps={[
          <>Open <Link href="/docs/feature/pump-fun" className="text-offivex-purple-light underline">/pump-fun</Link>, fill name/symbol/description/image/socials.</>,
          <>(Recommended) tick &ldquo;Buy on launch&rdquo; with 0.5–1 SOL so you have the first allocation on the curve.</>,
          <>Launch. Copy the PF URL and share.</>,
          <>Monitor curve progress on PF itself, or via <Link href="/docs/feature/monitor" className="text-offivex-purple-light underline">/monitor</Link> (event kind = <DocCode>pump_fun</DocCode>).</>,
          <>When the curve crosses threshold, PF auto-migrates LP to Raydium. You&rsquo;ll see a <DocCode>migration</DocCode> event in /monitor.</>,
          <>Post-migration, treat like a Raydium launch: monitor, sustain volume, sell.</>,
        ]}
        settings={[
          { name: "initial_buy_sol", value: "0.5–1.0" },
          { name: "description", value: "≤280 chars, hook-first" },
          { name: "image", value: "≤4 MB, square" },
        ]}
        cost={[
          { name: "Launch tx", value: "~0.02 SOL" },
          { name: "Initial buy", value: "0.5–1 SOL (recoverable as tokens)" },
          { name: "Migration", value: "Free (PF pays)" },
          { name: "Total at risk upfront", value: "0.5–1 SOL" },
        ]}
        fail={[
          { name: "Curve never fills", value: "No audience pickup. Most PF launches die here — this is the cheapest failure mode." },
          { name: "Curve fills but rugs at migration", value: "Doesn&rsquo;t happen — migration is automated by the PF program, you don&rsquo;t hold the LP." },
        ]}
      />

      <Recipe
        id="volume-warmup"
        num={4}
        title="Volume bot warmup post-launch"
        goal="Sustain on-chain activity in the hours after a launch when organic volume thins."
        when="Stacked on top of any launch style after the initial 5–30 minute rush ends."
        prereqs={
          <ul className="list-disc list-inside space-y-1">
            <li>An active mint on Raydium.</li>
            <li>5–10 funded wallets (0.2–1 SOL each).</li>
          </ul>
        }
        steps={[
          <>Open <Link href="/docs/feature/volume-bot" className="text-offivex-purple-light underline">/volume</Link>, pick mint and wallet set.</>,
          <>Set <DocCode>min_buy_sol = 0.05</DocCode>, <DocCode>max_buy_sol = 0.3</DocCode> for low-key.</>,
          <>Sell percent 70–90% (full round-trip leaves no inventory; partial round-trip slowly accumulates).</>,
          <>Intervals 60–300s for an organic rhythm.</>,
          <>Slippage 800–1500 bps depending on pool depth.</>,
          <>Start. Verify cycles land via /monitor.</>,
        ]}
        settings={[
          { name: "min_buy_sol", value: "0.05" },
          { name: "max_buy_sol", value: "0.3" },
          { name: "sell_percent", value: "75" },
          { name: "min_interval_seconds", value: "60" },
          { name: "max_interval_seconds", value: "300" },
          { name: "slippage_bps", value: "800–1500" },
        ]}
        cost={[
          { name: "Per cycle", value: "0.003–0.01 SOL (fees + spread)" },
          { name: "Per day at this density", value: "~0.5–2 SOL drift" },
          { name: "Watch", value: "Net loss compounds. Stop after diminishing returns." },
        ]}
        fail={[
          { name: "Wallets drained", value: "Spread + fees > net buys returning. Lower buy bounds or shorten the run." },
          { name: "Slippage failures repeating", value: "Pool too thin. Raise slippage or lower buy sizes." },
        ]}
      />

      <Recipe
        id="multi-wallet-sell"
        num={5}
        title="Multi-wallet dev sell"
        goal="Exit a large dev position without dropping a single visible whale sell."
        when="You&rsquo;re ready to take profit on a launch and want to minimize price impact + on-screener visibility."
        prereqs={
          <ul className="list-disc list-inside space-y-1">
            <li>Dev wallet holds the position.</li>
            <li>5–15 sub-wallets created.</li>
          </ul>
        }
        steps={[
          <>Transfer tokens from the dev wallet to N sub-wallets, similar amounts ±20% variance. Use staggered delays.</>,
          <>From each sub-wallet, use <Link href="/docs/feature/manual-trade" className="text-offivex-purple-light underline">/trade</Link> to sell on different time offsets (5–30 min apart).</>,
          <>Alternative: configure a Volume Bot with <DocCode>sell_percent = 100</DocCode>, <DocCode>min_buy_sol = max_buy_sol = 0</DocCode> doesn&rsquo;t work — instead, run it with tiny buy bounds and let the sell side dominate. (Simpler: just use Manual Trade rounds.)</>,
          <>Don&rsquo;t hit the same wallet twice within 60 s — looks programmatic on per-wallet histograms.</>,
          <>Consolidate proceeds back to dev wallet or cold wallet only after all sells are done.</>,
          <><strong>One-key exit if you don&rsquo;t care about stealth</strong>: <Link href="/docs/feature/quick-sell" className="text-offivex-purple-light underline">F4 quick-sell</Link> dumps from every holding wallet in parallel in ~800 ms. Faster than this recipe, but visible as a coordinated multi-wallet sell on screeners. Pick stealth (this recipe) or speed (quick-sell) — not both.</>,
        ]}
        settings={[
          { name: "Wallets per sell tranche", value: "5–15" },
          { name: "Tranche delay", value: "5–30 min" },
          { name: "Per-wallet position variance", value: "±20%" },
          { name: "Slippage", value: "1500+ (you&rsquo;re moving size)" },
        ]}
        cost={[
          { name: "Transfer fees", value: "~0.00001 SOL per transfer" },
          { name: "Sell slippage", value: "Varies — measure on Manual Trade quote before each tranche." },
        ]}
        fail={[
          { name: "Anti-bubble pattern detected by screener", value: "If transfers are perfectly uniform and immediate, screeners flag them. Use variance and delays." },
          { name: "Price collapses mid-exit", value: "Inevitable on weak liquidity. Either accept it or split across multiple days." },
        ]}
      />

      <Recipe
        id="anti-detect"
        num={6}
        title="Anti-detect setup (maximum stealth)"
        goal="Make a snipe-set look as unprogrammatic as possible to chain-analysis tools and screener filters."
        when="High-profile launches where bot detection (manual or automated) is part of the threat model."
        prereqs={
          <ul className="list-disc list-inside space-y-1">
            <li>48+ hours of lead time before the launch.</li>
            <li>Funded wallet set.</li>
            <li>Pinata + Birdeye keys configured.</li>
          </ul>
        }
        steps={[
          <>Day -2: <Link href="/docs/feature/distribution" className="text-offivex-purple-light underline">/distribution</Link> the funding from cold source → snipe set, with hops=2, variance=30%, 60–600 s delays.</>,
          <>Day -2 → -1: <Link href="/docs/feature/wallet-warmer" className="text-offivex-purple-light underline">/warmer</Link> on the snipe set, density=medium, all four action types enabled.</>,
          <>Day -1: <Link href="/docs/feature/profiles" className="text-offivex-purple-light underline">/profiles</Link>, generate one profile per wallet, auto-bind.</>,
          <>Day 0: Mint, then either launch via bundle, OR re-distribute with <strong>auto-buy enabled</strong> using <DocCode>buy_pattern=staggered</DocCode> (or <DocCode>batched</DocCode> for max stealth) + <DocCode>percent_variance=15</DocCode>. The staggered pattern alone defeats Bubblemaps sync + same-block signals on the buy phase.</>,
          <>Post-launch: <Link href="/docs/feature/volume-bot" className="text-offivex-purple-light underline">/volume</Link> with low density, varied wallets per cycle, plus a few manual buys mixed in by hand.</>,
        ]}
        settings={[
          { name: "Distribution hops", value: "2" },
          { name: "Distribution variance", value: "30%" },
          { name: "Auto-buy pattern", value: "staggered (1–8 s) or batched (size=3, delay=10 s)" },
          { name: "Auto-buy percent_variance", value: "15 (±)" },
          { name: "Warmer duration", value: "24–48 h" },
          { name: "Warmer density", value: "medium" },
          { name: "Volume bot density", value: "low (intervals 120–600 s)" },
        ]}
        cost={[
          { name: "Distribution hop fees", value: "+2× transfer fees vs hops=0" },
          { name: "Warmer per wallet", value: "0.05–0.15 SOL of working capital, ~half returned" },
          { name: "Time", value: "48 h of calendar setup, ~10 min of operator attention total" },
        ]}
        fail={[
          { name: "Lead time too short", value: "Warming for 1 h does nothing. Either do it properly or skip it." },
          { name: "All wallets share one IP", value: "Profiles don&rsquo;t mask network identity. Use a proxy fleet if real anonymity matters (out of scope for Offivex)." },
        ]}
      />

      <Recipe
        id="pass-dextools-rugcheck"
        num={7}
        title="Pass DEXTools / RugCheck audits"
        goal="Launch a memecoin that comes up as LOW RISK on RugCheck and all-green on the DEXTools Audit tab, so retail screeners don't skip the token because of an avoidable critical flag."
        when="Any retail-facing launch — DEXTools and RugCheck are the most-checked discovery tools, and a single 'critical' flag is enough to kill organic interest."
        prereqs={
          <ul className="list-disc list-inside space-y-1">
            <li>Mainnet, Jito-enabled RPC.</li>
            <li>Funded dev wallet (LP + Jito tip + small buffer).</li>
            <li>5–10 funded snipe sub-wallets (kept under ~25% of LP value).</li>
          </ul>
        }
        steps={[
          <><Link href="/docs/feature/mint" className="text-offivex-purple-light underline">/mint</Link> the token. Leave the two new anti-rug toggles at their defaults: <strong>Auto-revoke mint authority = ON</strong>, <strong>Keep freeze authority = OFF</strong>.</>,
          <>Fund the snipe set via <Link href="/docs/feature/distribution" className="text-offivex-purple-light underline">/distribution</Link> with hops ≥ 1, variance ≥ 15%, staggered delays — keeps Bubblemaps from flagging the cluster.</>,
          <>Open <Link href="/docs/feature/bundle" className="text-offivex-purple-light underline">/bundle</Link>, select the mint. Under <strong>LP after launch</strong>, leave the default <DocCode>Burn LP atomically</DocCode>. The burn instruction is appended to the pool-init tx — LP gone the instant the pool exists.</>,
          <>Keep total snipe spend under ~25% of <DocCode>quote_amount</DocCode> so RugCheck&rsquo;s &ldquo;Sniped %&rdquo; stays under the typical 30% flag threshold.</>,
          <>Launch. Once the bundle lands, open the mint on rugcheck.xyz and the DEXTools Audit tab — both should show green on Mint Authority, Freeze Authority, LP Locked, and Top 10 Holders.</>,
          <>(If you minted earlier without auto-revoke) Click <strong>Revoke Mint Authority</strong> on the /mint result panel — this hits <DocCode>POST /tokens/{`{mint}`}/revoke-mint-authority</DocCode> and flips the score from MODERATE to LOW retroactively.</>,
        ]}
        settings={[
          { name: "/mint → revoke_mint_authority", value: "true (default)" },
          { name: "/mint → keep_freeze_authority", value: "false (default)" },
          { name: "/bundle → lp_disposition", value: '"burn" (default)' },
          { name: "/distribution → hops", value: "≥ 1" },
          { name: "/distribution → variance", value: "≥ 15%" },
          { name: "Snipe total / quote_amount", value: "≤ 25%" },
        ]}
        cost={[
          { name: "Extra rent / fees vs unsafe defaults", value: "~0 — burn + set_authority are < 5 000 CU each" },
          { name: "LP fees forfeited (Burn mode)", value: "Marginal on memecoins; meaningful on long-tail serious projects" },
          { name: "Opt-out cost", value: "Keep LP instead — accept the 'LP Not Locked' flag and lock off-platform later" },
        ]}
        fail={[
          { name: "RugCheck still flags 'Mint Authority'", value: "You unchecked auto-revoke or pre-existed the mint without it. Use the post-mint Revoke button." },
          { name: "RugCheck flags 'Sniped %'", value: "Your snipe total exceeded ~30% of quote. Lower per-wallet spend or raise LP." },
          { name: "Bubblemaps shows a cluster", value: "Funding hops = 0 or no variance. See recipe 6 (Anti-detect)." },
          { name: "LP burn aborted the bundle", value: "Shouldn&rsquo;t happen — the safety margin is sized to absorb Raydium&rsquo;s MINIMUM_LIQUIDITY. If it does, retry without burn and lock off-platform." },
        ]}
      />

      <DocSection id="next" title="What now?">
        <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-300">
          <li>
            Want depth on any feature mentioned above? Open the{" "}
            <Link href="/docs#feature-reference" className="text-offivex-purple-light underline">Feature reference</Link>.
          </li>
          <li>
            Hit an error in one of these recipes? Check{" "}
            <Link href="/docs/troubleshooting" className="text-offivex-purple-light underline">Troubleshooting</Link>.
          </li>
        </ul>
      </DocSection>
    </DocLayout>
  );
}
