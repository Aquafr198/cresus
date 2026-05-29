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

export default function PumpFunDocsPage() {
  return (
    <DocLayout
      eyebrow="Feature reference"
      title="Pump.fun Launch"
      intro="Launch a token directly on Pump.fun's bonding curve in one step. The page handles mint, metadata, curve creation, and (optionally) an initial dev buy. When the curve hits its $69k market cap threshold, Pump.fun auto-migrates the liquidity to Raydium."
      breadcrumbs={[
        { href: "/docs", label: "Documentation" },
        { href: "/docs#feature-reference", label: "Feature reference" },
      ]}
      prev={{ href: "/docs/feature/bundle", label: "Bundle Launch" }}
      next={{ href: "/docs/feature/meme-library", label: "Meme Library" }}
      toc={TOC}
    >
      <DocSection id="what" title="What it does">
        <p className="text-gray-300 leading-relaxed">
          <DocCode>/pump-fun</DocCode> creates a new Pump.fun token: mint +
          metadata + bonding curve account, all in one transaction. The
          bonding curve starts at ~30 SOL implied market cap and graduates to
          Raydium when total SOL committed crosses the threshold (~$69k MC at
          the time of writing).
        </p>
      </DocSection>

      <DocSection id="when" title="When to use it">
        <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-300">
          <li>You want PF&rsquo;s built-in audience and trending discovery.</li>
          <li>You want a lower upfront cost than seeding a Raydium pool yourself (PF launch ≈ 0.02 SOL vs. 3+ SOL for bundle).</li>
          <li>You&rsquo;re happy with the bonding curve&rsquo;s pricing function (concave — early buyers get more tokens per SOL).</li>
        </ul>
        <DocCallout variant="info" title="PF vs Bundle">
          PF is cheaper, audience-driven, and slower to fill. Bundle is
          atomic, lets you control entry price, but costs more upfront and
          gives you no built-in audience. See{" "}
          <Link href="/docs/recipes" className="text-offivex-purple-light underline">Recipes</Link>{" "}
          for both patterns.
        </DocCallout>
      </DocSection>

      <DocSection id="prereq" title="Pre-requisites">
        <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-300">
          <li>Mainnet cluster. PF doesn&rsquo;t exist on devnet.</li>
          <li>A dev wallet with ~0.05 SOL minimum (more if you plan an initial buy).</li>
          <li>Image, name, symbol, and socials prepared.</li>
        </ul>
      </DocSection>

      <DocSection id="walkthrough" title="Walkthrough">
        <DocSteps
          steps={[
            { title: "Fill name, symbol, description", body: <>Same conventions as <Link href="/docs/feature/mint" className="text-offivex-purple-light underline">Mint Token</Link>. PF caps description at ~280 chars.</> },
            { title: "Upload image", body: <>≤4 MB (PF&rsquo;s own limit, stricter than ours). Square recommended.</> },
            { title: "Socials (optional)", body: <>Twitter, Telegram, website. They render on the PF token page.</> },
            { title: "(Optional) Initial dev buy", body: <>Tick <strong>Buy on launch</strong> and set a SOL amount. The buy is appended to the launch transaction, so you get the very first allocation on the curve.</> },
            { title: "Click Launch", body: <>The page submits the PF launch tx via the official Pump.fun program. On success you get the mint and the PF URL.</> },
          ]}
        />
      </DocSection>

      <DocSection id="reference" title="Field reference">
        <DocTable
          headers={["Field", "Type", "Notes"]}
          rows={[
            [<DocCode key="n">name</DocCode>, "string", "≤32 chars."],
            [<DocCode key="s">symbol</DocCode>, "string", "Uppercase, 3–8 chars typical."],
            [<DocCode key="d">description</DocCode>, "string", "≤280 chars; displayed on the PF page."],
            [<DocCode key="i">image</DocCode>, "file", "≤4 MB. Pinned to IPFS via Pinata."],
            [<DocCode key="ib">initial_buy_sol</DocCode>, "f64 (optional)", "If set, executes a buy on the same tx. Typical range 0.1–2 SOL."],
            [<DocCode key="x">socials.{`{twitter,telegram,website}`}</DocCode>, "url?", "Embedded in PF metadata."],
          ]}
        />
      </DocSection>

      <DocSection id="internals" title="Under the hood">
        <ul className="list-disc list-inside space-y-2 text-sm text-gray-300 leading-relaxed">
          <li>The launch transaction calls the official Pump.fun program with a <DocCode>create</DocCode> instruction that initializes the mint, the bonding curve PDA, and the associated metadata account.</li>
          <li>If <DocCode>initial_buy_sol</DocCode> is set, a second instruction <DocCode>buy</DocCode> is appended in the same tx, paying out tokens at the curve&rsquo;s starting price.</li>
          <li>Image and metadata JSON are pinned to IPFS via Pinata before the tx is built. The IPFS URI is what PF stores on-chain.</li>
          <li>The curve fills as people buy. At a configurable bonding-curve threshold (set by the PF program), liquidity migrates to a Raydium pool automatically — no action required from you.</li>
        </ul>
      </DocSection>

      <DocSection id="pitfalls" title="Pitfalls & errors">
        <DocTable
          headers={["Error", "Cause", "Fix"]}
          rows={[
            [<DocCode key="e1">Image too large</DocCode>, "Exceeds PF&rsquo;s 4 MB cap.", "Compress or downscale to ~1 MB to be safe."],
            [<DocCode key="e2">Insufficient SOL</DocCode>, "Dev wallet has &lt; 0.05 SOL (or less than initial_buy_sol + fees).", <>Top up via <Link href="/docs/feature/wallets" className="text-offivex-purple-light underline">Wallets</Link>.</>],
            [<DocCode key="e3">Cluster mismatch</DocCode>, "Trying to launch on devnet.", "Pump.fun is mainnet-only."],
            [<DocCode key="e4">Migration didn&rsquo;t happen</DocCode>, "Curve hasn&rsquo;t filled yet, or filled but PF migration tx pending.", "Wait — migration runs automatically once the threshold is hit. Check the PF UI for status."],
          ]}
        />
      </DocSection>

      <DocSection id="related" title="Related">
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-300">
          <li><Link href="/docs/feature/monitor" className="text-offivex-purple-light underline">Monitor</Link> — watch curve fills in real time.</li>
          <li><Link href="/docs/feature/volume-bot" className="text-offivex-purple-light underline">Volume Bot</Link> — sustain activity after the PF→Raydium migration.</li>
          <li><Link href="/docs/recipes" className="text-offivex-purple-light underline">Recipes → Pump.fun → Raydium Migration</Link>.</li>
        </ul>
      </DocSection>
    </DocLayout>
  );
}
