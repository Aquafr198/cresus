"use client";

import Link from "next/link";
import {
  DocLayout,
  DocSection,
  DocCode,
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
  { id: "internals", label: "Under the hood" },
  { id: "pitfalls", label: "Pitfalls & errors" },
  { id: "related", label: "Related" },
];

export default function WalletWarmerDocsPage() {
  return (
    <DocLayout
      eyebrow="Feature reference"
      title="Wallet Warmer"
      intro="Generate organic-looking on-chain history on a wallet set: random transfers, swaps of established tokens (USDC, BONK, JUP), and idle periods. Reduces the signal that a wallet is a freshly-spawned bot."
      breadcrumbs={[
        { href: "/docs", label: "Documentation" },
        { href: "/docs#feature-reference", label: "Feature reference" },
      ]}
      prev={{ href: "/docs/feature/bumper-bot", label: "Bumper Bot" }}
      next={{ href: "/docs/feature/distribution", label: "Distribution" }}
      toc={TOC}
    >
      <DocSection id="what" title="What it does">
        <p className="text-gray-300 leading-relaxed">
          Over a configurable window (hours to days), the warmer schedules a
          random sequence of actions on each wallet in the set:
        </p>
        <ul className="list-disc list-inside mt-3 space-y-1 text-sm text-gray-300">
          <li>Small swap into an established token (USDC, BONK, JUP, WIF).</li>
          <li>Small swap back to SOL.</li>
          <li>Self-transfer between wallets in the set.</li>
          <li>Idle stretches with no actions.</li>
        </ul>
        <p className="text-sm text-gray-300 mt-3 leading-relaxed">
          Actions are interleaved with random delays (5 min to 6 h) and small
          random amounts so the timeline doesn&rsquo;t look programmatic.
        </p>
      </DocSection>

      <DocSection id="when" title="When to use it">
        <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-300">
          <li>Brand-new sub-wallets that will participate in a high-profile launch.</li>
          <li>Building a fleet with believable activity histories ahead of time.</li>
          <li>Recovering reputational baseline after a wallet has only ever held one specific token.</li>
        </ul>
      </DocSection>

      <DocSection id="prereq" title="Pre-requisites">
        <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-300">
          <li>Funded wallet set — each wallet needs 0.05–0.5 SOL of working capital.</li>
          <li>Time. Useful warming is measured in hours/days, not minutes.</li>
        </ul>
      </DocSection>

      <DocSection id="walkthrough" title="Walkthrough">
        <DocSteps
          steps={[
            { title: "Open /warmer", body: <>Existing runs and the New form.</> },
            { title: "Pick wallet set", body: <>Any combination. The warmer treats them as independent agents.</> },
            { title: "Pick action mix", body: <>Tick which actions to include. Default includes all four.</> },
            { title: "Pick duration", body: <>Hours to days. Longer = more believable.</> },
            { title: "Pick action density", body: <>Low/medium/high. Low ≈ 3–6 actions per wallet per day; high ≈ 15–30.</> },
            { title: "Start", body: <>The warmer runs in the background. Stop anytime; state persists.</> },
          ]}
        />
      </DocSection>

      <DocSection id="reference" title="Field reference">
        <DocTable
          headers={["Field", "Type", "Notes"]}
          rows={[
            [<DocCode key="w">wallet_ids[]</DocCode>, "string[]", "Wallets to warm."],
            [<DocCode key="d">duration_hours</DocCode>, "u32", "Total run window."],
            [<DocCode key="dn">density</DocCode>, "&quot;low&quot; | &quot;medium&quot; | &quot;high&quot;", "Action frequency per wallet."],
            [<DocCode key="a">enabled_actions[]</DocCode>, "string[]", "Subset of [swap_in, swap_out, transfer, idle]."],
            [<DocCode key="ts">target_tokens[]</DocCode>, "base58[]", "Tokens to swap into. Defaults to USDC, BONK, JUP."],
          ]}
        />
      </DocSection>

      <DocSection id="internals" title="Under the hood">
        <ul className="list-disc list-inside space-y-2 text-sm text-gray-300 leading-relaxed">
          <li>The warmer pre-computes a schedule of <DocCode>(timestamp, wallet, action, params)</DocCode> tuples sampled from a Poisson process scaled by density, with random gaps that exclude unreasonable patterns (5-second-apart actions, exact-minute boundaries).</li>
          <li>Each action runs as a Tokio task at its scheduled time. Failures don&rsquo;t cascade — one failed swap doesn&rsquo;t kill the whole schedule.</li>
          <li>Self-transfers move trivial amounts (0.001–0.01 SOL) between wallets in the same set. Swaps use Jupiter with small slippage (200 bps) since the target tokens are highly liquid.</li>
        </ul>
      </DocSection>

      <DocSection id="pitfalls" title="Pitfalls & errors">
        <DocTable
          headers={["Error", "Cause", "Fix"]}
          rows={[
            [<DocCode key="e1">Wallet drained mid-run</DocCode>, "Density too high relative to balance; each round-trip costs fees + spread.", "Lower density or top up wallets first."],
            [<DocCode key="e2">All actions failed</DocCode>, "Jupiter rate-limited or RPC offline.", <>Switch to a paid RPC in <Link href="/docs/feature/settings" className="text-offivex-purple-light underline">Settings</Link>.</>],
            [<DocCode key="e3">Pattern still looks programmatic</DocCode>, "Too short a window or too uniform density.", "Run for 24h+ at medium density; mix manual sends in among the automated ones."],
          ]}
        />
      </DocSection>

      <DocCallout variant="info" title="The warmer is a soft signal">
        Wallet warming improves your odds of bypassing simple heuristics (no
        prior tx, perfectly round amounts). It does not bypass any real
        compliance system or chain-analysis tooling. Don&rsquo;t use it for
        anything that requires actual anonymity.
      </DocCallout>

      <DocSection id="related" title="Related">
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-300">
          <li><Link href="/docs/feature/profiles" className="text-offivex-purple-light underline">Profiles</Link> — pair with identity-diversity for stronger anti-flag signals.</li>
          <li><Link href="/docs/recipes" className="text-offivex-purple-light underline">Recipes → Anti-Detect Setup</Link>.</li>
        </ul>
      </DocSection>
    </DocLayout>
  );
}
