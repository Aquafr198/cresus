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

export default function ManualTradeDocsPage() {
  return (
    <DocLayout
      eyebrow="Feature reference"
      title="Manual Trade"
      intro="One-off buy or sell on any SPL token from any of your wallets, routed through Jupiter's aggregator for best execution. No bot, no schedule — just a single trade with explicit slippage and priority-fee controls."
      breadcrumbs={[
        { href: "/docs", label: "Documentation" },
        { href: "/docs#feature-reference", label: "Feature reference" },
      ]}
      prev={{ href: "/docs/feature/meme-library", label: "Meme Library" }}
      next={{ href: "/docs/feature/quick-sell", label: "Quick-Sell Keybinds" }}
      toc={TOC}
    >
      <DocSection id="what" title="What it does">
        <p className="text-gray-300 leading-relaxed">
          <DocCode>/trade</DocCode> sends a single swap to Jupiter&rsquo;s
          quote API, then submits the returned transaction signed by the wallet
          you selected. You see the quote (route, expected output, price
          impact) before you confirm.
        </p>
      </DocSection>

      <DocSection id="when" title="When to use it">
        <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-300">
          <li>Taking profits on a position (sell N tokens for SOL).</li>
          <li>Adding to a position from a specific sub-wallet without touching the others.</li>
          <li>Verifying that a token is actually tradeable post-launch (smoke test).</li>
          <li>Re-balancing — selling a small position before a Volume Bot run.</li>
        </ul>
      </DocSection>

      <DocSection id="prereq" title="Pre-requisites">
        <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-300">
          <li>Wallet has the funds: SOL for a buy, the token for a sell, plus a few thousand lamports for fees.</li>
          <li>An RPC that can submit the resulting transaction (any of the configured ones — see <Link href="/docs/feature/settings" className="text-offivex-purple-light underline">Settings</Link>).</li>
        </ul>
      </DocSection>

      <DocSection id="walkthrough" title="Walkthrough">
        <DocSteps
          steps={[
            { title: "Open /trade", body: <>Source wallet on the left, swap form on the right.</> },
            { title: "Pick source wallet", body: <>Filter by group or parent if you have many.</> },
            { title: "Enter input/output mints", body: <>For a buy: input = SOL (<DocCode>So111…</DocCode>), output = your token. For a sell: reverse them. The page autofills SOL for the side that&rsquo;s SOL.</> },
            { title: "Set amount", body: <>UI amount in the input token&rsquo;s decimals.</> },
            { title: "Slippage & priority fee", body: <>Default slippage <DocCode>DEFAULT_SLIPPAGE_BPS</DocCode> (typically 500 = 5%). Bump on volatile launches.</> },
            { title: "Get quote", body: <>Page fetches the Jupiter quote. Inspect route (which AMMs are hit), expected output, and price impact. If price impact &gt; ~3%, your slippage may be too tight.</> },
            { title: "Confirm", body: <>The signed swap tx is submitted. You get the signature and a Solscan button.</> },
          ]}
        />
      </DocSection>

      <DocSection id="reference" title="Field reference">
        <DocTable
          headers={["Field", "Type", "Notes"]}
          rows={[
            [<DocCode key="w">wallet_id</DocCode>, "string", "Source wallet for the swap."],
            [<DocCode key="im">input_mint</DocCode>, "base58", "Token you&rsquo;re selling. SOL = <DocCode>So111…</DocCode>."],
            [<DocCode key="om">output_mint</DocCode>, "base58", "Token you&rsquo;re buying."],
            [<DocCode key="a">amount</DocCode>, "u64 (raw units)", "UI amount × 10^decimals of input mint."],
            [<DocCode key="s">slippage_bps</DocCode>, "u16", "0–10 000. Typical: 50 (stable), 500 (memecoin), 1500+ (high-vol launch)."],
            [<DocCode key="p">priority_fee_micro_lamports</DocCode>, "u64", "Default from env. Bump during congestion."],
          ]}
        />
      </DocSection>

      <DocSection id="internals" title="Under the hood">
        <ul className="list-disc list-inside space-y-2 text-sm text-gray-300 leading-relaxed">
          <li>The page calls Jupiter&rsquo;s <DocCode>/quote</DocCode> endpoint with your params, then <DocCode>/swap</DocCode> to get a serialized transaction.</li>
          <li>The backend deserializes the tx, prepends a compute-budget priority-fee instruction, signs with the in-memory keypair, and submits via the active RPC.</li>
          <li>If the swap involves a token your wallet doesn&rsquo;t hold an ATA for, Jupiter&rsquo;s tx includes the <DocCode>createAssociatedTokenAccount</DocCode> instruction automatically.</li>
        </ul>
      </DocSection>

      <DocSection id="pitfalls" title="Pitfalls & errors">
        <DocTable
          headers={["Error", "Cause", "Fix"]}
          rows={[
            [<DocCode key="e1">Slippage exceeded</DocCode>, "Price moved more than your tolerance between quote and execution.", "Increase slippage_bps. Memecoin launches often need 1500+."],
            [<DocCode key="e2">Route not found</DocCode>, "Jupiter has no path for the input→output pair.", "Token is brand new or has no LP. Wait or use a direct Raydium swap."],
            [<DocCode key="e3">Insufficient funds</DocCode>, "Wallet doesn&rsquo;t hold the input amount, or insufficient SOL for fees.", "Check balance on /wallets."],
            [<DocCode key="e4">Custom program error: 0x1</DocCode>, "Onchain swap failed — usually slippage at the AMM level.", "Same as above — raise slippage."],
          ]}
        />
      </DocSection>

      <DocCallout variant="tip" title="Smoke test new launches">
        Right after a bundle or PF launch, do a 0.01-SOL buy through Manual
        Trade to confirm the token is actually swappable. Sniper bundle
        success ≠ &ldquo;the public can buy this&rdquo;.
      </DocCallout>

      <DocSection id="related" title="Related">
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-300">
          <li><Link href="/docs/feature/quick-sell" className="text-offivex-purple-light underline">Quick-Sell Keybinds</Link> — single-key panic exit across every holding wallet, when speed matters more than the per-swap control this page gives you.</li>
          <li><Link href="/docs/feature/volume-bot" className="text-offivex-purple-light underline">Volume Bot</Link> — automate cycles of buys/sells.</li>
          <li><Link href="/docs/feature/bumper-bot" className="text-offivex-purple-light underline">Bumper Bot</Link> — automate price-floor defense.</li>
          <li><Link href="/docs/recipes" className="text-offivex-purple-light underline">Recipes → Multi-Wallet Dev Sell</Link>.</li>
        </ul>
      </DocSection>
    </DocLayout>
  );
}
