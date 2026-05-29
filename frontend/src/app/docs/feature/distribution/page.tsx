"use client";

import Link from "next/link";
import {
  DocLayout,
  DocSection,
  DocCode,
  DocCodeBlock,
  DocTable,
  DocSteps,
} from "../../_components/DocLayout";
import { DocCallout } from "../../_components/DocCallout";

const TOC = [
  { id: "what", label: "What it does" },
  { id: "when", label: "When to use it" },
  { id: "prereq", label: "Pre-requisites" },
  { id: "walkthrough", label: "Walkthrough" },
  { id: "reference", label: "Field reference" },
  { id: "anti-bubble-deep-dive", label: "Anti-bubble deep dive" },
  { id: "internals", label: "Under the hood" },
  { id: "pitfalls", label: "Pitfalls & errors" },
  { id: "related", label: "Related" },
];

export default function DistributionDocsPage() {
  return (
    <DocLayout
      eyebrow="Feature reference"
      title="Distribution"
      intro="Spread SOL from a source wallet across many sub-wallets in a way that doesn't draw a straight line back to the source on a chain explorer. Amount variance, random delays, optional intermediate hops — all configurable, all resumable if interrupted."
      breadcrumbs={[
        { href: "/docs", label: "Documentation" },
        { href: "/docs#feature-reference", label: "Feature reference" },
      ]}
      prev={{ href: "/docs/feature/wallet-warmer", label: "Wallet Warmer" }}
      next={{ href: "/docs/feature/profiles", label: "Profiles" }}
      toc={TOC}
    >
      <DocSection id="what" title="What it does">
        <p className="text-gray-300 leading-relaxed">
          You pick a source wallet, a target set, and a total SOL amount.
          Distribution figures out a per-wallet allocation (uniform with
          variance), schedules the transfers with random delays, and
          optionally hops through 1–2 intermediate wallets so the on-chain
          graph from source to target isn&rsquo;t a single fan-out.
        </p>
      </DocSection>

      <DocSection id="when" title="When to use it">
        <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-300">
          <li>Funding a snipe set before a bundle launch.</li>
          <li>Pre-funding wallets for a Volume Bot or Warmer run.</li>
          <li>Moving treasury SOL to operational wallets without obvious round-numbered transfers.</li>
        </ul>
      </DocSection>

      <DocSection id="prereq" title="Pre-requisites">
        <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-300">
          <li>A source wallet with the full total plus a buffer for fees (rule of thumb: + 0.5%).</li>
          <li>The target wallet set already exists (created via <Link href="/docs/feature/wallets" className="text-offivex-purple-light underline">Wallets</Link>).</li>
        </ul>
      </DocSection>

      <DocSection id="walkthrough" title="Walkthrough">
        <DocSteps
          steps={[
            { title: "Open /distribution", body: <>Configure form on the left, schedule preview on the right.</> },
            { title: "Pick source", body: <>One wallet with enough SOL.</> },
            { title: "Pick targets", body: <>Multi-select sub-wallets. The page shows the count.</> },
            { title: "Total SOL & variance", body: <>Total to distribute, plus variance in % (e.g. 20% → each wallet gets ±20% of mean).</> },
            { title: "Delays", body: <>Min and max seconds between sends. Typical 30–180s.</> },
            { title: "(Optional) hops", body: <>1 or 2 intermediate wallets to break the fan-out graph. Each hop adds fee cost.</> },
            { title: "Preview", body: <>You see the per-wallet amounts and the projected end time. Adjust if needed.</> },
            { title: "Start", body: <>Distribution runs in the background. Stop and resume any time — state is persisted.</> },
            { title: "(Optional) Auto-buy after distribute", body: <>Tick <strong>Auto-buy after distribute</strong> in the plan card. Paste the mint, set % of each wallet's SOL to spend, slippage, and pick the buy pattern (Staggered default = anti-bubble safe). On Execute the SOL distribution lands first, then the buys fan out according to the pattern — one click instead of two pages. See the deep dive below for the trade-offs between Parallel / Staggered / Batched.</> },
          ]}
        />
      </DocSection>

      <DocSection id="reference" title="Field reference">
        <DocTable
          headers={["Field", "Type", "Notes"]}
          rows={[
            [<DocCode key="s">source_wallet_id</DocCode>, "string", "The SOL origin."],
            [<DocCode key="t">target_wallet_ids[]</DocCode>, "string[]", "1–500 entries."],
            [<DocCode key="ts">total_sol</DocCode>, "f64", "Total to distribute, before fees."],
            [<DocCode key="v">variance_percent</DocCode>, "u8", "0–80. Variance around the mean per-wallet amount."],
            [<DocCode key="md">min_delay_seconds</DocCode>, "u32", "Lower bound between sends."],
            [<DocCode key="mD">max_delay_seconds</DocCode>, "u32", "Upper bound."],
            [<DocCode key="h">hops</DocCode>, "0 | 1 | 2", "Number of intermediate wallets per transfer."],
            [<DocCode key="hw">hop_wallet_ids[]</DocCode>, "string[]", "Pool of intermediates. Required if hops &gt; 0."],
            [<DocCode key="cb">chain_buy</DocCode>, "{ mint, percent, slippage_bps }?", "Optional auto-buy. After SOL distribution lands, each target wallet spends `percent`% of its post-distribution balance (after reserving ~0.005 SOL for fees) on the mint via Jupiter."],
          ]}
        />
      </DocSection>

      <DocSection id="anti-bubble-deep-dive" title="Anti-bubble deep dive">
        <p className="text-sm text-gray-300 leading-relaxed mb-4">
          You picked a launchpad tool to evade bubble-map detection, so
          you deserve to know exactly what each option defeats — and where
          the limit is. The sections below are the threat model and the
          per-strategy mitigation in plain terms.
        </p>

        <h3 className="text-base font-semibold text-gray-100 mt-2 mb-2">
          What a bubble map detects
        </h3>
        <p className="text-sm text-gray-300 leading-relaxed">
          Tools like bubblemaps.io, Birdeye holder analysis, and the
          built-in screeners on DexScreener walk SOL flows around any
          address and look for these patterns:
        </p>
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-300 mt-2">
          <li>
            <strong className="text-gray-100">Fan-out</strong> — 1 source
            funds N targets in a short window. Classic dev-wallet
            signature.
          </li>
          <li>
            <strong className="text-gray-100">Time-clustering</strong> —
            many transfers landing in the same Solana slot (~400 ms) or
            same minute. Bots.
          </li>
          <li>
            <strong className="text-gray-100">Amount fingerprinting</strong>{" "}
            — identical or round-number amounts (10 wallets each receive
            exactly 0.5 SOL). Bots.
          </li>
          <li>
            <strong className="text-gray-100">Common source</strong> —
            every wallet's first-ever funding came from the same address.
            Same entity.
          </li>
        </ul>

        <h3 className="text-base font-semibold text-gray-100 mt-6 mb-2">
          Strategy comparison
        </h3>
        <DocTable
          headers={["Strategy", "What it defeats", "Limit"]}
          rows={[
            [
              <DocCode key="d">Direct</DocCode>,
              "Nothing fan-out-related. Only amount + timing variance help here.",
              "Bubble map sees a textbook fan-out from your source. Fast but visible.",
            ],
            [
              <DocCode key="m">MultiHop</DocCode>,
              "The fan-out itself — each target's apparent funder is a random relay wallet, not your source. The graph stops looking like a star.",
              "Multi-level tracing (3+ hops back) on pro tools can still link the relays to the source. Defeats free / basic tooling, not Chainalysis.",
            ],
            [
              <DocCode key="l">Layered</DocCode>,
              "Time-clustering — by spreading targets across batches with inter-batch delays, no two targets are funded in the same slot.",
              "Still uses your source as funder for every batch — the fan-out pattern survives, just spread over time.",
            ],
          ]}
        />

        <h3 className="text-base font-semibold text-gray-100 mt-6 mb-2">
          MultiHop in concrete terms
        </h3>
        <p className="text-sm text-gray-300 leading-relaxed">
          With <DocCode>hops = 2</DocCode>, SOL passes through two relay
          wallets — randomly picked from your other targets — before
          reaching the destination. Relays get reused across targets so the
          on-chain graph is a web, not a star:
        </p>
        <DocCodeBlock lang="example with 3 targets, hops=2">{`source ─► relayA ─► relayB ─► target1
source ─► relayC ─► relayA ─► target2     (relays reused)
source ─► relayB ─► relayC ─► target3`}</DocCodeBlock>
        <p className="text-sm text-gray-300 leading-relaxed mt-2">
          From each target&rsquo;s perspective, its funder is{" "}
          <em>relayB</em> / <em>relayA</em> / <em>relayC</em> — not the
          source. A bubble map that only traces 1 hop back groups them as
          three independent funding events.
        </p>

        <h3 className="text-base font-semibold text-gray-100 mt-6 mb-2">
          Layered in concrete terms
        </h3>
        <DocCodeBlock lang="example with 9 targets, batch_size=3, batch_delay_ms=10000 (±30%)">{`T = 0s    batch1: target1, target2, target3
T = 12s   batch2: target4, target5, target6   (delay=10s ±30% → 12s)
T = 27s   batch3: target7, target8, target9   (delay=10s ±30% → 14s)`}</DocCodeBlock>
        <p className="text-sm text-gray-300 leading-relaxed mt-2">
          Each batch still has internal randomization (200–1500 ms
          between transfers within a batch). The 9 wallets appear across
          ~30 seconds = 75 distinct slots instead of 1 slot.
        </p>

        <h3 className="text-base font-semibold text-gray-100 mt-6 mb-2">
          Variance: amounts & timing
        </h3>
        <DocTable
          headers={["Variance", "Example before", "Example after"]}
          rows={[
            [
              <span key="a">
                <DocCode>amount_variation</DocCode> ±15%
              </span>,
              "1.0, 1.0, 1.0, 1.0, 1.0 SOL",
              "0.93, 1.08, 0.97, 1.04, 0.98 SOL",
            ],
            [
              <span key="t">
                <DocCode>timing_variation</DocCode> [500, 5000] ms
              </span>,
              "tx1 at 0s, tx2 at 0s, tx3 at 0s (same slot)",
              "tx1 at 0s, tx2 at 2.3s, tx3 at 4.1s (different slots)",
            ],
          ]}
        />
        <DocCallout variant="tip" title="Zero-drift guarantee">
          The amount split is computed in integer math (u64/u128 with
          basis-point weights) and re-normalized so the sum equals your
          stated total to the lamport — no rounding loss. You don&rsquo;t
          lose 0.001 SOL to drift across 50 wallets.
        </DocCallout>

        <h3 className="text-base font-semibold text-gray-100 mt-6 mb-2">
          Recommended combo for max coverage
        </h3>
        <p className="text-sm text-gray-300 leading-relaxed">
          No single strategy is enough. The setup that defeats public
          bubble-map tools without exotic configuration:
        </p>
        <DocCodeBlock>{`strategy        : MultiHop { hops: 2 }
amount_variation: ±20%   (vs. default ±15%, slightly more chaotic)
timing_variation: [1000, 8000] ms   (vs. default [500, 5000], more spread)`}</DocCodeBlock>
        <p className="text-sm text-gray-300 leading-relaxed mt-2">
          Want layering too? Run <em>two separate distributions</em> —
          half the wallets via MultiHop, the other half via Layered, kick
          them off 5 minutes apart. Combining stratifies the temporal
          signature on top of the graph signature.
        </p>

        <h3 className="text-base font-semibold text-gray-100 mt-6 mb-2">
          Auto-buy patterns — the buy-side anti-bubble
        </h3>
        <p className="text-sm text-gray-300 leading-relaxed">
          Distribution alone protects the funding phase. But if you then
          fire N buys in parallel right after, you recreate the exact
          signal Bubblemaps detects (synchronized behavior + same-block
          activity). The <DocCode>buy_pattern</DocCode> field on the
          auto-buy panel controls how the swaps are sequenced:
        </p>
        <DocTable
          headers={["Pattern", "Behavior", "Wall-clock (10 wallets)", "Anti-bubble"]}
          rows={[
            [
              <span key="par"><DocCode>parallel</DocCode></span>,
              "All buys fired concurrently",
              "~1–2 s",
              "❌ Bundles detected by Bubblemaps + screeners",
            ],
            [
              <span key="stg"><DocCode>staggered</DocCode> (default)</span>,
              "Random delay [min, max] between EACH buy. First buy fires immediately, then sleeps before the next.",
              "~30–80 s with [1, 8] s default",
              "✅ Defeats sync + same-block signals",
            ],
            [
              <span key="bat"><DocCode>batched</DocCode></span>,
              "Buys grouped in batches of N, batches in parallel, inter-batch wait (±30% jitter)",
              "~30 s with batch=3, delay=10 s, 10 wallets",
              "✅✅ Defeats sync + spreads across many slots",
            ],
          ]}
        />
        <DocCallout variant="warn" title="Parallel = fast, NOT anti-bubble">
          Use Parallel only when speed beats stealth — typical case: an
          urgent dev allocation right at a chart pump where every second
          counts. For any other launch the Staggered or Batched default is
          the right choice. The UI shows a warning callout when Parallel
          is selected.
        </DocCallout>

        <h3 className="text-base font-semibold text-gray-100 mt-6 mb-2">
          Buy-size variance — the 4th signal
        </h3>
        <p className="text-sm text-gray-300 leading-relaxed">
          Even with staggered timing, if every wallet spends EXACTLY 80%
          of its balance, that&rsquo;s a fingerprint a screener can spot
          (&ldquo;all 10 wallets emptied the same fraction&rdquo;). The{" "}
          <DocCode>percent_variance</DocCode> slider (default ±10) samples
          each wallet&rsquo;s spend uniformly in{" "}
          <DocCode>[percent − variance, percent + variance]</DocCode>:
        </p>
        <DocCodeBlock lang="example: percent=80, variance=10, 5 wallets">{`wallet 1: spends 74%
wallet 2: spends 87%
wallet 3: spends 81%
wallet 4: spends 78%
wallet 5: spends 85%`}</DocCodeBlock>
        <p className="text-sm text-gray-300 leading-relaxed mt-2">
          Set variance = 0 to disable (every wallet spends exactly{" "}
          <DocCode>percent</DocCode>%, back-compat with v1). 50 is the
          cap.
        </p>

        <h3 className="text-base font-semibold text-gray-100 mt-6 mb-2">
          Honest limits — coverage matrix
        </h3>
        <DocTable
          headers={["Detection tool", "Direct only", "MultiHop + variance"]}
          rows={[
            [
              "bubblemaps.io (free, 1-hop trace)",
              "Detected",
              "Bypassed",
            ],
            [
              "bubblemaps.io Pro (multi-hop trace)",
              "Detected",
              "Partial bypass",
            ],
            [
              "Birdeye / DexScreener built-in holder analysis",
              "Detected",
              "Bypassed",
            ],
            [
              "Chainalysis / TRM Labs (forensic-grade)",
              "Detected",
              "Detected (no consumer tool defeats this)",
            ],
            [
              "Human detective digging by hand",
              "Detected fast",
              "Traceable but slow",
            ],
          ]}
        />
        <DocCallout variant="warn" title="Anti-bubble ≠ anonymity">
          This feature obscures the dev-wallet-to-fleet relationship from
          casual screeners and the retail audience inspecting your launch
          on bubblemaps. It does NOT defeat professional chain analysis —
          if your launch attracts the attention of Chainalysis or a
          competent investigator, they will eventually trace your source.
          Build your launch on the assumption that determined parties
          can connect the dots.
        </DocCallout>
      </DocSection>

      <DocSection id="internals" title="Under the hood">
        <ul className="list-disc list-inside space-y-2 text-sm text-gray-300 leading-relaxed">
          <li>Per-wallet amount is sampled uniformly in <DocCode>[mean × (1 − v), mean × (1 + v)]</DocCode> then post-normalized so the sum matches your total exactly.</li>
          <li>Delays are sampled uniformly in <DocCode>[min, max]</DocCode>.</li>
          <li>Hop selection: for each target, hops are sampled with replacement from the hop pool. The path is recorded in the schedule before any tx runs.</li>
          <li>The full schedule is persisted at start. If the bot crashes mid-run, the next start picks up at the next unconfirmed transfer.</li>
          <li>Failed transfers are retried up to 3 times (default), then marked permanent and the distribution pauses for you to inspect.</li>
        </ul>
      </DocSection>

      <DocSection id="pitfalls" title="Pitfalls & errors">
        <DocTable
          headers={["Error", "Cause", "Fix"]}
          rows={[
            [<DocCode key="e1">Insufficient SOL on source</DocCode>, "Variance + fees pushed total above source balance.", "Reduce total or fund the source."],
            [<DocCode key="e2">Hop wallet empty during run</DocCode>, "Hop wallet drained from elsewhere mid-run.", "Use the same hop pool for one distribution at a time."],
            [<DocCode key="e3">Distribution &ldquo;completed&rdquo; but balances wrong</DocCode>, "A transfer failed silently and was retried elsewhere.", "Open the schedule table — every row records its final signature or error."],
          ]}
        />
      </DocSection>

      <DocCallout variant="tip" title="Realistic variance">
        20–40% variance with 60–180s delays produces a fan-out that looks
        much less programmatic than uniform amounts and constant spacing.
        Lower variance (e.g. 5%) is a tell.
      </DocCallout>

      <DocSection id="related" title="Related">
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-300">
          <li><Link href="/docs/feature/wallets" className="text-offivex-purple-light underline">Wallets</Link> — create the source and the target set first.</li>
          <li><Link href="/docs/feature/bundle" className="text-offivex-purple-light underline">Bundle Launch</Link> — Distribution is the typical funding step before bundling.</li>
        </ul>
      </DocSection>
    </DocLayout>
  );
}
