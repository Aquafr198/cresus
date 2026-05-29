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

export default function VolumeBotDocsPage() {
  return (
    <DocLayout
      eyebrow="Feature reference"
      title="Volume Bot"
      intro="Run buy/sell cycles across a wallet set on a configurable schedule. Generates organic-looking on-chain activity that keeps the token from looking dead between manual events. Pause and resume at will — the bot persists its state in SQLite."
      breadcrumbs={[
        { href: "/docs", label: "Documentation" },
        { href: "/docs#feature-reference", label: "Feature reference" },
      ]}
      prev={{ href: "/docs/feature/quick-sell", label: "Quick-Sell Keybinds" }}
      next={{ href: "/docs/feature/bumper-bot", label: "Bumper Bot" }}
      toc={TOC}
    >
      <DocSection id="what" title="What it does">
        <p className="text-gray-300 leading-relaxed">
          For each cycle the bot:
        </p>
        <ol className="list-decimal list-inside mt-3 space-y-1 text-sm text-gray-300">
          <li>Picks a wallet from the set (round-robin or random).</li>
          <li>Buys a randomized SOL amount within your configured bounds.</li>
          <li>Waits a randomized interval.</li>
          <li>Sells a configured percentage of the position.</li>
          <li>Waits the inter-cycle interval, then repeats.</li>
        </ol>
        <p className="text-sm text-gray-300 mt-3 leading-relaxed">
          State (cycles completed, current wallet index, last error) is
          persisted so the bot survives crashes and restarts without skipping
          ahead.
        </p>
      </DocSection>

      <DocSection id="when" title="When to use it">
        <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-300">
          <li>Post-launch volume sustain — keep the token from looking dead between organic buys.</li>
          <li>Pre-listing warm-up (build a multi-day trade history on a fresh mint).</li>
          <li>Generating PnL/holder churn for screener filters that reward activity.</li>
        </ul>
      </DocSection>

      <DocSection id="prereq" title="Pre-requisites">
        <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-300">
          <li>A token with a live Raydium/Jupiter-reachable pool.</li>
          <li>A funded wallet set — each wallet needs SOL for the buy + fees + ATA rent the first time it touches the mint.</li>
          <li>The mint address.</li>
        </ul>
      </DocSection>

      <DocSection id="walkthrough" title="Walkthrough">
        <DocSteps
          steps={[
            { title: "Open /volume", body: <>Existing bot configs appear at the top; the New bot form is below.</> },
            { title: "Pick mint and wallet set", body: <>Wallet set = parent + sub-wallets, or a custom selection.</> },
            { title: "Set buy bounds", body: <><DocCode>min_buy_sol</DocCode> and <DocCode>max_buy_sol</DocCode>. The bot picks uniformly between these.</> },
            { title: "Set sell percentage", body: <><DocCode>sell_percent</DocCode> — e.g. 80 means each cycle dumps 80% of the just-bought tokens. 100 = fully round-trip the position.</> },
            { title: "Set intervals", body: <><DocCode>min_interval_seconds</DocCode> / <DocCode>max_interval_seconds</DocCode> control the random delay between cycles. Typical: 60–300s.</> },
            { title: "Start", body: <>The bot enters the run loop. Stop it any time via the Stop button; state is preserved.</> },
          ]}
        />
      </DocSection>

      <DocSection id="reference" title="Field reference">
        <DocTable
          headers={["Field", "Type", "Notes"]}
          rows={[
            [<DocCode key="m">mint</DocCode>, "base58", "Target token."],
            [<DocCode key="w">wallet_ids[]</DocCode>, "string[]", "1–N. Each wallet runs one cycle at a time."],
            [<DocCode key="bm">min_buy_sol</DocCode>, "f64", "Lower bound of randomized buy size."],
            [<DocCode key="bM">max_buy_sol</DocCode>, "f64", "Upper bound. Must be ≥ min_buy_sol."],
            [<DocCode key="sp">sell_percent</DocCode>, "u8", "0–100. Percentage of position to dump per cycle."],
            [<DocCode key="im">min_interval_seconds</DocCode>, "u32", "Lower bound between cycles."],
            [<DocCode key="iM">max_interval_seconds</DocCode>, "u32", "Upper bound."],
            [<DocCode key="s">slippage_bps</DocCode>, "u16", "Applied to both legs. Default 500."],
            [<DocCode key="mc">max_cycles</DocCode>, "u32?", "Optional. Unbounded if unset."],
          ]}
        />
      </DocSection>

      <DocSection id="internals" title="Under the hood">
        <ul className="list-disc list-inside space-y-2 text-sm text-gray-300 leading-relaxed">
          <li>The bot runs as a Tokio task in the backend with the bot ID as the key. Stopping kills the task; restarting reads state from <DocCode>volume_bot_state</DocCode> and resumes at the next cycle.</li>
          <li>Each leg uses the same Jupiter swap pipeline as Manual Trade.</li>
          <li>If a leg fails (slippage, network), the cycle is marked failed and the bot pauses with the error so you can investigate. It does <em>not</em> retry forever.</li>
          <li>Per-wallet ATA creation lamports are deducted from the buy budget on the first cycle for each wallet — budget accordingly.</li>
        </ul>
      </DocSection>

      <DocSection id="pitfalls" title="Pitfalls & errors">
        <DocTable
          headers={["Error", "Cause", "Fix"]}
          rows={[
            [<DocCode key="e1">Bot stopped after N cycles</DocCode>, "A leg failed (usually slippage).", "Check the bot row for the error message. Bump slippage and click Resume."],
            [<DocCode key="e2">Wallet has zero balance</DocCode>, "Wallet drained during the run (sells routed elsewhere, or buys exceeded sell proceeds).", "Top up the wallet or remove it from the set."],
            [<DocCode key="e3">Slippage exceeded repeatedly</DocCode>, "Pool too thin for your buy size.", "Lower max_buy_sol, or raise slippage."],
            [<DocCode key="e4">All cycles too fast / too slow</DocCode>, "Intervals misconfigured.", "Tune min_interval / max_interval — typical organic rhythm is 60–600s."],
          ]}
        />
      </DocSection>

      <DocCallout variant="warn" title="This generates a tax footprint">
        Every buy and sell is a taxable event in most jurisdictions. The bot
        keeps a per-cycle log; export it if you need to reconcile.
      </DocCallout>

      <DocSection id="related" title="Related">
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-300">
          <li><Link href="/docs/feature/wallet-warmer" className="text-offivex-purple-light underline">Wallet Warmer</Link> — broader organic-history simulation.</li>
          <li><Link href="/docs/feature/bumper-bot" className="text-offivex-purple-light underline">Bumper Bot</Link> — pair with floor support during ramps.</li>
          <li><Link href="/docs/recipes" className="text-offivex-purple-light underline">Recipes → Volume Bot Warmup Post-Launch</Link>.</li>
        </ul>
      </DocSection>
    </DocLayout>
  );
}
