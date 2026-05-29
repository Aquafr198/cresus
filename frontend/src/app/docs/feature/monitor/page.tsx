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
  { id: "reference", label: "Event reference" },
  { id: "internals", label: "Under the hood" },
  { id: "pitfalls", label: "Pitfalls & errors" },
  { id: "related", label: "Related" },
];

export default function MonitorDocsPage() {
  return (
    <DocLayout
      eyebrow="Feature reference"
      title="Monitor"
      intro="Subscribe to any SPL mint and stream every relevant on-chain event as it lands — buys, sells, transfers, LP changes. Backed by a backend WebSocket that hooks into the cluster's account subscriptions, so latency is bounded by Solana's confirmation time, not by polling."
      breadcrumbs={[
        { href: "/docs", label: "Documentation" },
        { href: "/docs#feature-reference", label: "Feature reference" },
      ]}
      prev={{ href: "/docs/feature/profiles", label: "Profiles" }}
      next={{ href: "/docs/feature/referral", label: "Referral" }}
      toc={TOC}
    >
      <DocSection id="what" title="What it does">
        <p className="text-gray-300 leading-relaxed">
          <DocCode>/monitor</DocCode> opens a WebSocket between your browser
          and the backend. The backend subscribes to relevant program
          accounts on the configured cluster and pushes filtered events back
          to you in near real time. Events include token transfers,
          Raydium/Jupiter swaps, LP mints/burns, and Pump.fun curve actions.
        </p>
      </DocSection>

      <DocSection id="when" title="When to use it">
        <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-300">
          <li>Watching a launch land — every snipe, every external buy, every sell.</li>
          <li>Tracking whether a Volume Bot is actually executing on-chain.</li>
          <li>Spotting a whale exit early.</li>
          <li>Coordinating multi-wallet manual dev sells against live data.</li>
        </ul>
      </DocSection>

      <DocSection id="prereq" title="Pre-requisites">
        <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-300">
          <li>Active plan with the monitor entitlement.</li>
          <li>RPC that supports WebSocket subs (paid providers all do).</li>
        </ul>
      </DocSection>

      <DocSection id="walkthrough" title="Walkthrough">
        <DocSteps
          steps={[
            { title: "Open /monitor", body: <>You see active subscriptions plus an add form.</> },
            { title: "Add a subscription", body: <>Paste the mint address. Add a label so you can tell multiple subscriptions apart.</> },
            { title: "Watch the feed", body: <>Events stream in newest-first. Each row shows: timestamp, kind, wallet, amount, signature link.</> },
            { title: "(Optional) filter", body: <>Toggle event kinds — buys only, sells only, transfers only.</> },
            { title: "Pause / resume", body: <>Pause freezes the rolling display; events keep being recorded. Resume to release the buffer.</> },
            { title: "Unsubscribe", body: <>Removes the backend WS sub. Idle subscriptions consume your RPC budget.</> },
          ]}
        />
      </DocSection>

      <DocSection id="reference" title="Event reference">
        <DocTable
          headers={["Kind", "Source", "Meaning"]}
          rows={[
            [<DocCode key="b">buy</DocCode>, "Raydium / Jupiter swap", "Net token flow into a non-LP wallet."],
            [<DocCode key="s">sell</DocCode>, "Raydium / Jupiter swap", "Net token flow out of a non-LP wallet."],
            [<DocCode key="t">transfer</DocCode>, "SPL Token program", "Direct transfer between wallets, no swap."],
            [<DocCode key="lpa">lp_add</DocCode>, "Raydium AMM", "LP deposit."],
            [<DocCode key="lpr">lp_remove</DocCode>, "Raydium AMM", "LP withdrawal — usually meaningful pre-rug."],
            [<DocCode key="pf">pump_fun</DocCode>, "Pump.fun program", "Curve buy/sell pre-migration."],
            [<DocCode key="mig">migration</DocCode>, "Pump.fun", "Curve graduated to Raydium."],
          ]}
        />
        <DocCodeBlock lang="example event">{`{
  "ts": 1716480000123,
  "kind": "buy",
  "mint": "DezX…",
  "wallet": "7m4t…",
  "amount_tokens": 1500000.0,
  "amount_sol": 0.42,
  "price_sol_per_token": 0.00000028,
  "signature": "5JZ…"
}`}</DocCodeBlock>
      </DocSection>

      <DocSection id="internals" title="Under the hood">
        <ul className="list-disc list-inside space-y-2 text-sm text-gray-300 leading-relaxed">
          <li>For each subscription the backend opens an RPC <DocCode>programSubscribe</DocCode> on the token program plus the relevant AMM programs, filtered to accounts that involve the mint.</li>
          <li>Raw account updates are decoded server-side, classified into the event kinds above, and pushed to your WS connection as JSON.</li>
          <li>If the upstream RPC disconnects, the backend auto-reconnects with exponential backoff. Your front-end WS stays open, so you may see a brief gap in the feed but no manual intervention.</li>
        </ul>
      </DocSection>

      <DocSection id="pitfalls" title="Pitfalls & errors">
        <DocTable
          headers={["Symptom", "Cause", "Fix"]}
          rows={[
            [<DocCode key="e1">WS disconnected (1006)</DocCode>, "Network blip, HMR in dev.", "Auto-reconnects. No action needed."],
            [<DocCode key="e2">No events visible</DocCode>, "Pool not yet created, or RPC subscription delay.", "Check that a buy actually happened on Solscan. If yes, the WS may be lagging — refresh the page."],
            [<DocCode key="e3">Cannot subscribe — quota exceeded</DocCode>, "Plan caps the concurrent subscription count.", "Unsubscribe an idle mint, or upgrade the plan."],
          ]}
        />
      </DocSection>

      <DocCallout variant="tip" title="Tab-friendly">
        Subscriptions live on the backend. You can close the Monitor tab and
        re-open it later — your subs are still active, and you&rsquo;ll see
        recent events on reconnect.
      </DocCallout>

      <DocSection id="related" title="Related">
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-300">
          <li><Link href="/docs/feature/bundle" className="text-offivex-purple-light underline">Bundle Launch</Link> — confirm a bundle landed via Monitor.</li>
          <li><Link href="/docs/feature/volume-bot" className="text-offivex-purple-light underline">Volume Bot</Link> — verify bot activity on-chain.</li>
        </ul>
      </DocSection>
    </DocLayout>
  );
}
