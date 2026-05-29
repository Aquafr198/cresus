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
  { id: "internals", label: "Under the hood" },
  { id: "pitfalls", label: "Pitfalls & errors" },
  { id: "related", label: "Related" },
];

export default function BundleDocsPage() {
  return (
    <DocLayout
      eyebrow="Feature reference"
      title="Bundle Launch (Jito)"
      intro="The headline feature: atomically open an OpenBook market, seed a Raydium AMM v4 pool, and execute N snipe buys from designated wallets — all in a single Jito bundle. If any leg fails, the whole launch reverts. No partial-state cleanup."
      breadcrumbs={[
        { href: "/docs", label: "Documentation" },
        { href: "/docs#feature-reference", label: "Feature reference" },
      ]}
      prev={{ href: "/docs/feature/mint", label: "Mint Token" }}
      next={{ href: "/docs/feature/pump-fun", label: "Pump.fun" }}
      toc={TOC}
    >
      <DocSection id="what" title="What it does">
        <p className="text-gray-300 leading-relaxed">
          A &ldquo;bundle launch&rdquo; submits a Jito bundle to the block
          engine. Jito bundles are sets of transactions that land together or
          not at all in a single block, with a tip paid to a Jito validator
          for inclusion priority. Offivex packs the following into one
          bundle:
        </p>
        <ol className="list-decimal list-inside mt-3 space-y-1 text-sm text-gray-300">
          <li>Create OpenBook market (3 legs).</li>
          <li>Initialize the Raydium pool with your base/quote amounts.</li>
          <li>
            Each snipe wallet executes a buy on the freshly-opened pool.
          </li>
          <li>A small SOL tip to the Jito tip account.</li>
        </ol>
        <p className="text-sm text-gray-300 mt-3 leading-relaxed">
          The result: snipe wallets get the very first buys against your own
          LP, before any external sniper can see the pool exists.
        </p>
      </DocSection>

      <DocSection id="when" title="When to use it">
        <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-300">
          <li>You want a Raydium-native launch (skip Pump.fun&rsquo;s bonding curve).</li>
          <li>You want to pre-allocate supply to a handful of sub-wallets via the very first trades.</li>
          <li>You want atomic LP + market + buys — no race between bot scripts.</li>
          <li>You expect intense external sniper competition.</li>
        </ul>
      </DocSection>

      <DocSection id="prereq" title="Pre-requisites">
        <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-300">
          <li>An existing mint (see <Link href="/docs/feature/mint" className="text-offivex-purple-light underline">Mint Token</Link>).</li>
          <li>The dev wallet holding the full supply plus ~3 SOL for market/LP rent and the Jito tip.</li>
          <li>N sub-wallets, each funded with the SOL it should spend (use <Link href="/docs/feature/distribution" className="text-offivex-purple-light underline">Distribution</Link>).</li>
          <li>An RPC that can submit Jito bundles — Helius, QuickNode, Triton all work; public RPC will not.</li>
          <li><DocCode>OFFIVEX_SOLANA_CLUSTER=mainnet</DocCode> if you&rsquo;re going live (devnet has no Jito).</li>
        </ul>
      </DocSection>

      <DocSection id="walkthrough" title="Walkthrough">
        <DocSteps
          steps={[
            {
              title: "Open /bundle",
              body: <>You see panels: mint, LP config, snipe set, tip.</>,
            },
            {
              title: "Select mint",
              body: (
                <>
                  Either paste a mint address or pick from the dropdown of
                  tokens you&rsquo;ve minted via Offivex.
                </>
              ),
            },
            {
              title: "Configure LP",
              body: (
                <>
                  Set <DocCode>base_amount</DocCode> (tokens you&rsquo;re
                  seeding) and <DocCode>quote_amount</DocCode> (SOL — your
                  starting market cap depends on this ratio). A reasonable
                  starting MC for a memecoin is 5–25 SOL of quote.
                </>
              ),
            },
            {
              title: "Add snipe wallets",
              body: (
                <>
                  Pick from your sub-wallet list and set a SOL spend per
                  wallet. The page shows the implied buy price post-pool. Total
                  spend across snipes is hard-capped at 25% of LP value to
                  prevent self-rugging the pool.
                </>
              ),
            },
            {
              title: "Set Jito tip",
              body: (
                <>
                  Default is <DocCode>JITO_TIP_LAMPORTS</DocCode> from your env
                  (typically 10 000–50 000). For competitive launches go
                  100 000+. The tip is paid from the dev wallet on top of all
                  other costs.
                </>
              ),
            },
            {
              title: "Click Launch bundle",
              body: (
                <>
                  Confirmation modal shows total SOL flow per wallet. Click{" "}
                  <strong>Launch</strong>. The bundle is submitted; you get
                  back the bundle UUID and a list of signatures.
                </>
              ),
            },
            {
              title: "Confirm landing",
              body: (
                <>
                  Open <Link href="/docs/feature/monitor" className="text-offivex-purple-light underline">Monitor</Link>,
                  subscribe to the mint, and watch the bundle&rsquo;s signatures
                  resolve in the live feed. Or check each signature on Solscan.
                </>
              ),
            },
          ]}
        />
      </DocSection>

      <DocSection id="reference" title="Field reference">
        <DocTable
          headers={["Field", "Type", "Notes"]}
          rows={[
            [<DocCode key="m">mint</DocCode>, "base58", "Existing SPL mint address."],
            [<DocCode key="b">base_amount</DocCode>, "u64 (UI)", "Tokens to seed into the LP. Determines circulating supply."],
            [<DocCode key="q">quote_amount</DocCode>, "f64 (SOL)", "SOL counterpart in the LP."],
            [<DocCode key="s">snipes[]</DocCode>, "{ wallet_id, spend_sol }[]", "One entry per snipe wallet. Total spend ≤ 25% of quote_amount."],
            [<DocCode key="t">tip_lamports</DocCode>, "u64", "Default from env. Bump for competitive launches."],
            [<DocCode key="sl">slippage_bps</DocCode>, "u16", "Per-snipe slippage tolerance. Default 500 bps (5%)."],
            [<DocCode key="lp">lp_disposition</DocCode>, '"burn" | "keep"', "Default \"burn\" — an spl-token::burn instruction is appended to the pool-init tx so all received LP tokens are destroyed atomically (passes DEXTools/RugCheck \"LP Locked\"). Set \"keep\" only if you intend to lock/migrate LP off-platform."],
          ]}
        />
      </DocSection>

      <DocSection id="internals" title="Under the hood">
        <ul className="list-disc list-inside space-y-2 text-sm text-gray-300 leading-relaxed">
          <li>
            <strong>OpenBook market creation</strong> is three transactions
            (create accounts → initialize market → place no orders). They are
            split into separate txs because of compute-unit ceilings.
          </li>
          <li>
            <strong>Raydium pool init</strong> is one transaction that creates
            the AMM and seeds it from the dev wallet&rsquo;s mint token account
            plus its SOL.
          </li>
          <li>
            <strong>Snipe buys</strong> are one tx per wallet, each containing
            a Raydium swap instruction. They cannot share a tx because each
            wallet must sign its own.
          </li>
          <li>
            <strong>Tip</strong> is a system-program transfer to one of the 8
            official Jito tip accounts (rotated per request — see{" "}
            <DocCode>bundle/jito.rs</DocCode>).
          </li>
          <li>
            <strong>Atomicity:</strong> The Jito block engine guarantees all
            txs land in the same block in order, or none do. If a snipe fails
            simulation, the whole bundle is rejected before it reaches the
            chain.
          </li>
          <li>
            <strong>LP burn (default):</strong> when{" "}
            <DocCode>lp_disposition = burn</DocCode>, an{" "}
            <DocCode>spl_token::burn</DocCode> instruction is appended to the
            pool-init tx with{" "}
            <DocCode>amount ≈ sqrt(coin × pc) − safety_margin</DocCode>{" "}
            (Raydium v4&rsquo;s LP-mint formula minus a small reserve to
            absorb the protocol&rsquo;s <DocCode>MINIMUM_LIQUIDITY</DocCode>{" "}
            lock). Result: nobody — including the creator — can withdraw the
            pooled liquidity. The leftover dust (&lt; 0.001% of LP) is
            economically negligible. See the{" "}
            <Link href="/docs/recipes#pass-dextools-rugcheck" className="text-offivex-purple-light underline">
              Pass DEXTools / RugCheck
            </Link>{" "}
            recipe.
          </li>
        </ul>
      </DocSection>

      <DocSection id="pitfalls" title="Pitfalls & errors">
        <DocTable
          headers={["Error", "Cause", "Fix"]}
          rows={[
            [<DocCode key="e1">Bundle dropped</DocCode>, "Tip too low — outbid in the auction.", "Bump tip_lamports to 100k+."],
            [<DocCode key="e2">Bundle simulation failed</DocCode>, "A snipe wallet has insufficient SOL.", "Top up the wallet via Distribution or manually."],
            [<DocCode key="e3">Snipe spend too high</DocCode>, "Total snipe SOL > 25% of LP.", "Reduce per-wallet spend or add more LP."],
            [<DocCode key="e4">Cluster mismatch</DocCode>, "Trying to bundle on devnet.", "Jito only runs on mainnet."],
            [<DocCode key="e5">Bundle landed but tx N failed</DocCode>, "Edge case: slippage exceeded on snipe N due to upstream snipes already moving price.", <>Raise <DocCode key="sl">slippage_bps</DocCode> for snipes ordered last.</>],
          ]}
        />
      </DocSection>

      <DocSection id="related" title="Related">
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-300">
          <li><Link href="/docs/feature/distribution" className="text-offivex-purple-light underline">Distribution</Link> — fund the snipe set before bundling.</li>
          <li><Link href="/docs/feature/monitor" className="text-offivex-purple-light underline">Monitor</Link> — watch the bundle land in real time.</li>
          <li><Link href="/docs/recipes" className="text-offivex-purple-light underline">Recipes → Sniper Bundle Launch</Link> — end-to-end walkthrough.</li>
        </ul>
      </DocSection>

      <DocCallout variant="warn" title="Atomicity ≠ unconditional success">
        Even an atomic bundle can fail to land if you&rsquo;re outbid in the
        Jito auction. The protection is against partial-state corruption, not
        against losing the priority race. Watch the bundle status; if it
        drops, you can re-submit immediately with a higher tip — your LP and
        snipe state are unchanged.
      </DocCallout>
    </DocLayout>
  );
}
