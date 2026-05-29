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

export default function BumperBotDocsPage() {
  return (
    <DocLayout
      eyebrow="Feature reference"
      title="Bumper Bot"
      intro="Defend a price floor. The bumper polls the token's price and, whenever it drops below your configured threshold, fires a small buy from the wallet set to nudge it back up. Designed to absorb minor sell pressure during a launch — not to fight a real exit."
      breadcrumbs={[
        { href: "/docs", label: "Documentation" },
        { href: "/docs#feature-reference", label: "Feature reference" },
      ]}
      prev={{ href: "/docs/feature/volume-bot", label: "Volume Bot" }}
      next={{ href: "/docs/feature/wallet-warmer", label: "Wallet Warmer" }}
      toc={TOC}
    >
      <DocSection id="what" title="What it does">
        <p className="text-gray-300 leading-relaxed">
          The bot polls the token&rsquo;s price from Jupiter (or Birdeye if a
          key is configured). Every poll interval, if{" "}
          <DocCode>current_price &lt; floor_price</DocCode>, it executes a buy
          of <DocCode>buy_sol</DocCode> SOL. The buy size and frequency are
          tuned to absorb mild sell pressure — typically 5–20% of average
          minute volume.
        </p>
      </DocSection>

      <DocSection id="when" title="When to use it">
        <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-300">
          <li>During the first hours of a launch, when small sells from snipers can chain into a panic.</li>
          <li>Right before a planned announcement — keep the chart green for the moment of social attention.</li>
          <li>To establish a visible &ldquo;buy wall&rdquo; effect on screeners that aggregate small recurring buys.</li>
        </ul>
        <DocCallout variant="warn" title="Not infinite ammunition">
          The bumper is bounded by the SOL in its wallet set. A determined
          seller (whale exit) will burn through your defense in seconds. Use
          it for noise, not for a real defense.
        </DocCallout>
      </DocSection>

      <DocSection id="prereq" title="Pre-requisites">
        <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-300">
          <li>A token with a live pool and a Jupiter route.</li>
          <li>A funded wallet set — total ammo = sum of SOL across these wallets.</li>
          <li>(Optional) Birdeye API key for more reliable price reads on illiquid tokens.</li>
        </ul>
      </DocSection>

      <DocSection id="walkthrough" title="Walkthrough">
        <DocSteps
          steps={[
            { title: "Open /bumper", body: <>Existing bots and the New form.</> },
            { title: "Pick mint and wallet set", body: <>Single mint per bot. Wallet set rotates round-robin to spread footprint.</> },
            { title: "Set floor price", body: <>USD or SOL — match whichever your price source returns. The page lets you toggle.</> },
            { title: "Set buy size", body: <>Small. 0.05–0.5 SOL per fire is typical.</> },
            { title: "Set poll interval", body: <>Default 5–15s. Faster polling spends RPC budget but reacts sooner.</> },
            { title: "Start", body: <>The bot enters the poll loop. Stop any time.</> },
          ]}
        />
      </DocSection>

      <DocSection id="reference" title="Field reference">
        <DocTable
          headers={["Field", "Type", "Notes"]}
          rows={[
            [<DocCode key="m">mint</DocCode>, "base58", "Target token."],
            [<DocCode key="w">wallet_ids[]</DocCode>, "string[]", "Rotated round-robin per fire."],
            [<DocCode key="fp">floor_price</DocCode>, "f64", "Threshold. Below this, fire a buy."],
            [<DocCode key="fu">floor_unit</DocCode>, "&quot;usd&quot; | &quot;sol&quot;", "Match your price feed."],
            [<DocCode key="b">buy_sol</DocCode>, "f64", "SOL per fire. Small."],
            [<DocCode key="pi">poll_interval_seconds</DocCode>, "u32", "5–60 typical."],
            [<DocCode key="s">slippage_bps</DocCode>, "u16", "Default 500."],
            [<DocCode key="ps">price_source</DocCode>, "&quot;jupiter&quot; | &quot;birdeye&quot;", "Birdeye more reliable for thin liquidity."],
          ]}
        />
      </DocSection>

      <DocSection id="internals" title="Under the hood">
        <ul className="list-disc list-inside space-y-2 text-sm text-gray-300 leading-relaxed">
          <li>Price poll uses the configured source. Jupiter is free; Birdeye uses your API key from Settings.</li>
          <li>If the threshold is crossed, the next wallet in the rotation builds a Jupiter swap and submits it via the same path as Manual Trade.</li>
          <li>The bot tracks &ldquo;total ammunition spent&rdquo; and pauses automatically if the wallet set drops below a configurable safety floor (so you don&rsquo;t accidentally drain every wallet trying to defend an impossible price).</li>
        </ul>
      </DocSection>

      <DocSection id="pitfalls" title="Pitfalls & errors">
        <DocTable
          headers={["Error", "Cause", "Fix"]}
          rows={[
            [<DocCode key="e1">Price source returned 0</DocCode>, "Pool has no liquidity or Jupiter has no route.", "Confirm pool exists; consider Birdeye as a backup."],
            [<DocCode key="e2">All wallets empty — paused</DocCode>, "You spent your ammo defending too aggressive a floor.", "Re-fund or lower the floor."],
            [<DocCode key="e3">Bot fires too often</DocCode>, "Floor set too high — price oscillates around it.", "Lower the floor or widen the implied dead zone."],
          ]}
        />
      </DocSection>

      <DocSection id="related" title="Related">
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-300">
          <li><Link href="/docs/feature/volume-bot" className="text-offivex-purple-light underline">Volume Bot</Link> — pair for sustained activity + floor support.</li>
          <li><Link href="/docs/feature/monitor" className="text-offivex-purple-light underline">Monitor</Link> — watch your bumper hits land in real time.</li>
        </ul>
      </DocSection>
    </DocLayout>
  );
}
