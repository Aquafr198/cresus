"use client";

import Link from "next/link";
import {
  DocLayout,
  DocSection,
  DocCode,
  DocCodeBlock,
  DocTable,
} from "../_components/DocLayout";
import { DocCallout } from "../_components/DocCallout";

const TOC = [
  { id: "step-1", label: "1 — Get an invite" },
  { id: "step-2", label: "2 — Receive your API key" },
  { id: "step-3", label: "3 — First login + master password" },
  { id: "step-4", label: "4 — Back up your seed phrase" },
  { id: "step-5", label: "5 — Unlock the vault" },
  { id: "step-6", label: "6 — Create your first wallet" },
  { id: "step-7", label: "7 — Fund the wallet" },
  { id: "step-8", label: "8 — Generate sub-wallets" },
  { id: "step-9", label: "9 — Anti-bubble distribution" },
  { id: "step-10", label: "10 — Warm wallets (optional)" },
  { id: "step-11", label: "11 — Randomize profiles (optional)" },
  { id: "step-12", label: "12 — Prepare token assets" },
  { id: "step-13", label: "13 — Mint the SPL token" },
  { id: "step-14", label: "14 — Choose your launch path" },
  { id: "step-15", label: "15 — Monitor the launch" },
  { id: "step-16", label: "16 — Sustain activity" },
  { id: "step-17", label: "17 — Sell strategy" },
  { id: "step-18", label: "18 — Withdraw & lock" },
];

function Step({
  num,
  id,
  title,
  children,
}: {
  num: number;
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mb-12 scroll-mt-24">
      <div className="flex items-center gap-3 mb-4">
        <span className="shrink-0 w-9 h-9 rounded-full bg-offivex-purple/15 border border-offivex-purple/40 text-offivex-purple-light text-sm font-bold flex items-center justify-center">
          {num}
        </span>
        <h2 className="text-2xl font-semibold text-gray-100">{title}</h2>
      </div>
      <div className="ml-12 space-y-3 text-sm text-gray-300 leading-relaxed">
        {children}
      </div>
    </section>
  );
}

export default function MasterTutorialPage() {
  return (
    <DocLayout
      eyebrow="Master tutorial"
      title="Launch a token on Offivex, end to end"
      intro="The full sequence: from your first login to a fully wound-down launch with proceeds back in cold storage. Every step lists what you're trying to accomplish, the exact UI actions, the things that commonly go wrong, and what to do next. Read it linearly — each step assumes the previous one is done."
      breadcrumbs={[{ href: "/docs", label: "Documentation" }]}
      prev={{ href: "/docs/quick-start", label: "Quick start" }}
      next={{ href: "/docs/recipes", label: "Recipes" }}
      toc={TOC}
    >
      <DocCallout variant="info" title="Before you start">
        This tutorial assumes mainnet. If you&rsquo;re practising, switch{" "}
        <DocCode>OFFIVEX_SOLANA_CLUSTER</DocCode> to <DocCode>devnet</DocCode>{" "}
        and use devnet faucets — every step works identically except Pump.fun
        and Jito bundles, which are mainnet-only.
      </DocCallout>

      <Step num={1} id="step-1" title="Get an invite">
        <p>
          Offivex is invite-only. Open <DocCode>/apply</DocCode> and fill the
          form: contact info, what you want to launch, why now. The admin
          reviews applications manually; lead time is typically 24 hours.
        </p>
        <p>
          <strong className="text-gray-100">What you&rsquo;re doing:</strong>{" "}
          getting an account provisioned with a plan you can pay for. Without
          this, the rest of the platform returns <DocCode>401</DocCode> on
          everything.
        </p>
      </Step>

      <Step num={2} id="step-2" title="Receive your API key">
        <p>
          Once approved, you get an email with a one-shot key reveal link.
          The key is shown <em>once</em>. Copy it somewhere you can find it
          again — a password manager entry called &ldquo;Offivex API key&rdquo;
          is the easy answer.
        </p>
        <DocCallout variant="danger" title="If you lose it">
          You&rsquo;ll need the admin to rotate it. There is no &ldquo;forgot
          API key&rdquo; self-service. Save it now.
        </DocCallout>
      </Step>

      <Step num={3} id="step-3" title="First login + master password">
        <p>
          Open <DocCode>/login</DocCode>. The first prompt asks for your API
          key — paste, submit. The second prompt asks you to{" "}
          <strong className="text-gray-100">set a master password</strong>.
          This is the password that unlocks your wallet vault for the rest of
          your life on Offivex.
        </p>
        <p>Rules (all enforced):</p>
        <ul className="list-disc list-inside space-y-1">
          <li>12+ characters</li>
          <li>At least one uppercase, lowercase, digit, symbol</li>
          <li>Not a previously breached password (Have-I-Been-Pwned check, k-anonymity prefix only — your full password never leaves the browser)</li>
        </ul>
        <p>
          The password is run through Argon2id (64 MiB memory cost) to derive
          the symmetric key that encrypts every wallet&rsquo;s secret. The key
          never persists to disk.
        </p>
      </Step>

      <Step num={4} id="step-4" title="Back up your seed phrase">
        <p>
          Immediately after setting the password, you&rsquo;re shown a 12-word
          BIP39 seed phrase. <strong className="text-gray-100">This is
          shown exactly once</strong>. It is the root of every wallet
          you&rsquo;ll create here.
        </p>
        <p>What to do:</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Write it on paper, in the order shown.</li>
          <li>Store the paper offline — safe, lockbox, metal plate (Cryptosteel etc).</li>
          <li>
            Do <em>not</em> photograph, screenshot, cloud-doc, or chat-app it.
          </li>
        </ol>
        <DocCallout variant="warn" title="Lost-seed math">
          Lost seed + lost password = lost wallets, permanently. Lost password
          but kept seed = full recovery via the restore flow on{" "}
          <DocCode>/login</DocCode>.
        </DocCallout>
      </Step>

      <Step num={5} id="step-5" title="Unlock the vault">
        <p>
          You&rsquo;re now logged in but the vault is locked by default after
          a fresh load. Click the lock badge in the header (or visit{" "}
          <DocCode>/login</DocCode> if it&rsquo;s been a while). Enter the
          master password.
        </p>
        <p>
          The vault stays unlocked for{" "}
          <DocCode>SESSION_TIMEOUT_SECONDS</DocCode> (default 3600). After
          that, secret keys are zeroized in memory and you need to re-unlock.
        </p>
      </Step>

      <Step num={6} id="step-6" title="Create your first wallet">
        <p>
          Navigate to <DocCode>/wallets</DocCode>. Click{" "}
          <strong>New wallet</strong>. Give it a meaningful local name —{" "}
          <DocCode>dev-main</DocCode> is the convention for the wallet
          that&rsquo;ll hold your token supply and your dev SOL.
        </p>
        <p>
          On submit, a fresh Ed25519 keypair is derived from your seed phrase
          at the next free index, encrypted with the derived key, and saved
          to SQLite. The public address appears in the list. Click the
          Solscan button to verify the address looks right on-chain.
        </p>
      </Step>

      <Step num={7} id="step-7" title="Fund the wallet">
        <p>
          Send SOL from an exchange (or another wallet you control) to the
          dev wallet&rsquo;s public key. Budget:
        </p>
        <DocTable
          headers={["Bucket", "Why", "Typical SOL"]}
          rows={[
            [<>Mint + metadata</>, "Rent for mint account, metadata account, IPFS pinning is free.", "0.02"],
            [<>OpenBook market + Raydium pool</>, "Market account rent + LP seed (separate from the LP itself).", "0.5–1.0"],
            [<>LP seed</>, "The actual SOL that anchors the price.", "5–25"],
            [<>Jito tip + snipe spend</>, "Block-engine tip + however much SOL you want your snipe set to spend.", "1–10"],
            [<>Slack</>, "Fees, retries, dust.", "0.5"],
          ]}
        />
        <p>
          Confirm the deposit landed by clicking the wallet&rsquo;s Solscan
          button after a minute. Until you see a balance there, do not move
          to the next step.
        </p>
      </Step>

      <Step num={8} id="step-8" title="Generate sub-wallets">
        <p>
          On <DocCode>/wallets</DocCode>, click <strong>Generate
          sub-wallets</strong> on your dev wallet. Pick a count. For a snipe
          set, 5–20 is typical. The hard cap is 100 per call.
        </p>
        <p>
          Each sub-wallet is derived from your seed at a unique index and
          tagged with the parent&rsquo;s <DocCode>parent_id</DocCode>. They
          inherit the same group, so you can filter to just &ldquo;the snipe
          set&rdquo; in later screens.
        </p>
      </Step>

      <Step num={9} id="step-9" title="Anti-bubble distribution">
        <p>
          Open <DocCode>/distribution</DocCode>. Source = your dev wallet.
          Targets = the sub-wallets. Total = the SOL you want your snipe set
          to spend collectively. Variance = 20–40% (don&rsquo;t use 0 — equal
          amounts is a tell). Min/max delay = 30s/180s.
        </p>
        <p>
          (Optional) Add 1–2 hops. Each hop adds fee cost but breaks the
          fan-out graph that chain analytics tools look for.
        </p>
        <p>
          Click <strong>Preview</strong>. Sanity-check the per-wallet
          amounts. <strong>Start</strong>. The distribution runs in the
          background; you can leave the tab and come back. Move to the next
          step in parallel.
        </p>
      </Step>

      <Step num={10} id="step-10" title="Warm wallets (optional)">
        <p>
          For high-profile launches where snipe-set wallets&rsquo; histories
          will be inspected, open <DocCode>/warmer</DocCode>. Pick the
          sub-wallet set. Set duration (12–48h is realistic), density (medium),
          enable all four action types. <strong>Start</strong>.
        </p>
        <p>
          The warmer runs concurrently with everything else. Don&rsquo;t
          launch until it&rsquo;s had at least a few hours to lay down
          activity, or you defeat the point.
        </p>
        <DocCallout variant="info" title="Skip if speed matters">
          Time-sensitive launches (riding a meta) often skip warming.
          It&rsquo;s a soft signal, not a hard requirement.
        </DocCallout>
      </Step>

      <Step num={11} id="step-11" title="Randomize profiles (optional)">
        <p>
          Open <DocCode>/profiles</DocCode>. Generate N profiles where
          N = sub-wallet count. Auto-bind one-to-one. Done.
        </p>
        <p>
          Profiles affect HTTP headers and UI fingerprint when bots interact
          with external APIs from per-wallet contexts. They don&rsquo;t affect
          the on-chain transactions themselves.
        </p>
      </Step>

      <Step num={12} id="step-12" title="Prepare token assets">
        <p>
          Open <DocCode>/meme-library</DocCode>. Upload your token image
          (PNG, ≤4 MB if you might use Pump.fun, ≤10 MB otherwise). The page
          hashes it, stores it locally, and pins it to IPFS via Pinata.
          You&rsquo;ll see the CID once pinning completes.
        </p>
        <p>
          Optionally upload variants (light/dark logo, banner). They&rsquo;ll
          be re-usable across this and future launches.
        </p>
      </Step>

      <Step num={13} id="step-13" title="Mint the SPL token">
        <p>
          Open <DocCode>/mint</DocCode>. Fill: name, symbol (3–8 uppercase),
          decimals (6 unless you have a reason), supply (UI units). Pick the
          image from the meme library. Add socials.
        </p>
        <p>
          For mainnet I recommend <DocCode>revoke_mint_authority = true</DocCode>{" "}
          unless you explicitly plan to mint more later. Burnable supply is
          a strong signal of bad faith on screeners.
        </p>
        <p>
          Click <strong>Mint</strong>. On success, the mint address appears
          with a Solscan button. Click through and verify the metadata
          renders before moving on.
        </p>
      </Step>

      <Step num={14} id="step-14" title="Choose your launch path">
        <p>You have two paths from here. Pick one — they&rsquo;re mutually exclusive on the same mint.</p>

        <h3 className="text-base font-semibold text-gray-100 mt-4 mb-1">
          14a — Sniper bundle (Raydium-native)
        </h3>
        <p>
          Open <DocCode>/bundle</DocCode>. Select the mint. Set base_amount
          (tokens to seed) and quote_amount (SOL). Add snipe entries: each
          row pairs a sub-wallet with a SOL spend. Set the Jito tip (50k–200k
          lamports for competitive). Confirm and launch. The whole launch
          + snipe sequence lands in one Jito bundle.
        </p>

        <h3 className="text-base font-semibold text-gray-100 mt-4 mb-1">
          14b — Pump.fun bonding curve
        </h3>
        <p>
          Open <DocCode>/pump-fun</DocCode>. Fill name, symbol, description,
          image, socials. Optionally tick &ldquo;Buy on launch&rdquo; with a
          small SOL amount so you get the first allocation. Submit. You&rsquo;ll
          get the mint and the PF URL. From here the curve fills organically
          — your only further action is monitoring.
        </p>

        <DocCallout variant="tip" title="Bundle vs PF in one line">
          Bundle: more control, more upfront cost, no built-in audience.
          PF: cheaper, easier, ride the trending tab if you&rsquo;re lucky.
        </DocCallout>
      </Step>

      <Step num={15} id="step-15" title="Monitor the launch">
        <p>
          Open <DocCode>/monitor</DocCode> immediately after launching.
          Subscribe to the mint. Watch:
        </p>
        <ul className="list-disc list-inside space-y-1">
          <li>Your snipe transactions land (signature → confirmed).</li>
          <li>First external buys arriving.</li>
          <li>Volume rhythm. A long quiet stretch is a sign to step in with manual buys or kick off a Volume Bot.</li>
          <li>Any large LP-remove event — that&rsquo;s usually only you, but watch for it.</li>
        </ul>
      </Step>

      <Step num={16} id="step-16" title="Sustain activity">
        <p>
          After the initial rush quiets (first 5–30 min), volume often
          collapses. Two tools fill the gap:
        </p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <strong>Volume Bot</strong> (<DocCode>/volume</DocCode>) — random
            buy/sell cycles across a wallet set. Configure with min/max buy
            SOL, sell percent, intervals. Start it.
          </li>
          <li>
            <strong>Bumper Bot</strong> (<DocCode>/bumper</DocCode>) — defends
            a floor price with small buys. Use for the first hour, until
            organic flow is strong enough to stand on its own.
          </li>
        </ul>
      </Step>

      <Step num={17} id="step-17" title="Sell strategy">
        <p>
          When you&rsquo;re ready to take profit, you have three options
          ranging from instant to surgical:
        </p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <strong>Quick-sell keybind (F4 / F5)</strong>: the panic-button.
            One key press → backend parallelizes a sell on every wallet
            holding the token. Default 15% slippage. Wall-clock ~800 ms on
            paid RPC. Use this when 2 seconds of friction is too much. See{" "}
            <Link href="/docs/feature/quick-sell" className="text-offivex-purple-light underline">
              /docs/feature/quick-sell
            </Link>
            .
          </li>
          <li>
            <strong>Distributed sells</strong>: split the dev position across
            several wallets via a transfer, then sell from each on staggered
            intervals through Manual Trade. Less price impact, less visible
            on screeners. Slower but invisible.
          </li>
          <li>
            <strong>Algorithmic sells</strong>: a Volume Bot with high
            sell_percent and one-way (no buys back) is the lazy version.
          </li>
        </ul>
        <p>
          Slippage on Jupiter for memecoin exits is rarely below 1000 bps
          (10%). Set realistic tolerances or trades will fail in a chain.
        </p>
        <DocCallout variant="tip" title="Look at the sidebar before pressing F4">
          The HUD at the bottom of the sidebar shows which token is currently
          armed for quick-sell. If it says <DocCode>Armed $BLOB</DocCode>,
          F4 sells $BLOB across all your wallets that hold it. If it says
          <DocCode>(latest)</DocCode>, you&rsquo;re falling back to your
          most recent launched token — re-focus from <DocCode>/monitor</DocCode>{" "}
          if that&rsquo;s not what you want.
        </DocCallout>
      </Step>

      <Step num={18} id="step-18" title="Withdraw & lock">
        <p>
          When the proceeds are in SOL across your wallets, consolidate.
          From <DocCode>/wallets</DocCode>, send SOL from each wallet to a
          single cold address (a Phantom or hardware wallet you control).
          Skip exchanges if you can — re-deposit later from the cold wallet
          when you actually want to convert.
        </p>
        <p>
          Final hygiene: click the Lock App badge in the header. The vault
          locks, in-memory keys zeroize. Close the tab. The launch is done.
        </p>
        <DocCallout variant="success" title="What you should have">
          A funded cold wallet with the launch proceeds, a clean memorial of
          the launch in <DocCode>/monitor</DocCode> history and{" "}
          <DocCode>/wallets</DocCode> balances, no orphaned bots still
          running. If a bot is still on, stop it now — it will keep spending.
        </DocCallout>
      </Step>

      <DocSection id="next" title="What now?">
        <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-300">
          <li>
            Want patterns? Read{" "}
            <Link href="/docs/recipes" className="text-offivex-purple-light underline">Recipes</Link>{" "}
            — six concrete launch styles with specific settings.
          </li>
          <li>
            Hit an error? Try{" "}
            <Link href="/docs/troubleshooting" className="text-offivex-purple-light underline">Troubleshooting</Link>{" "}
            — 25+ messages with fixes.
          </li>
          <li>
            Want depth on any one feature?{" "}
            <Link href="/docs#feature-reference" className="text-offivex-purple-light underline">Feature reference</Link>{" "}
            has a page per sidebar entry.
          </li>
        </ul>
      </DocSection>
    </DocLayout>
  );
}
