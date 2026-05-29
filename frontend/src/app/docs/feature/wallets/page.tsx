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

export default function WalletsDocsPage() {
  return (
    <DocLayout
      eyebrow="Feature reference"
      title="Wallets"
      intro="Create encrypted Solana keypairs, generate deterministic sub-wallets from a parent, check balances, send SOL or SPL tokens, and export the secret key when you need to move a wallet to Phantom or a CLI tool. This is the foundation of every other feature."
      breadcrumbs={[
        { href: "/docs", label: "Documentation" },
        { href: "/docs#feature-reference", label: "Feature reference" },
      ]}
      prev={{ href: "/docs/quick-start", label: "Quick start" }}
      next={{ href: "/docs/feature/distribution", label: "Distribution" }}
      toc={TOC}
    >
      <DocSection id="what" title="What it does">
        <p className="text-gray-300 leading-relaxed">
          The <DocCode>/wallets</DocCode> page is your local keypair vault.
          Every wallet you create is encrypted with AES-256-GCM using a key
          derived from your master password through Argon2id, then stored in
          SQLite. The plaintext secret key only ever exists in RAM when the
          vault is unlocked, and it is zeroized the moment the auto-lock timer
          fires.
        </p>
        <p className="text-gray-300 leading-relaxed mt-3">
          You get four kinds of operations:{" "}
          <strong className="text-gray-100">create</strong> (parent or
          sub-wallets), <strong className="text-gray-100">inspect</strong>{" "}
          (balance + Solscan), <strong className="text-gray-100">move</strong>{" "}
          (send SOL or SPL tokens), and{" "}
          <strong className="text-gray-100">extract</strong> (encrypted secret
          key export).
        </p>
      </DocSection>

      <DocSection id="when" title="When to use it">
        <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-300">
          <li>
            You need a fresh keypair for a launch — a dev wallet, an LP wallet,
            or a snipe set.
          </li>
          <li>
            You want N sub-wallets that share a parent for anti-bubble
            distribution.
          </li>
          <li>
            You need to fund a wallet from an exchange and verify the deposit
            landed on-chain.
          </li>
          <li>
            You want to move a wallet from Offivex into Phantom (export the
            encrypted secret key, decrypt offline with the export password).
          </li>
          <li>
            You&rsquo;re winding down a launch and need to send the proceeds
            back to a cold wallet.
          </li>
        </ul>
      </DocSection>

      <DocSection id="prereq" title="Pre-requisites">
        <DocTable
          headers={["Need", "Why"]}
          rows={[
            [
              <span key="k1">Valid API key</span>,
              <span key="k2">
                Every wallet request goes through the{" "}
                <DocCode>require_api_key</DocCode> middleware.
              </span>,
            ],
            [
              <span key="p1">Master password set</span>,
              <span key="p2">
                Without a password the vault has no encryption key — the{" "}
                <DocCode>setup_password</DocCode> step issues the seed phrase
                that all wallets derive from.
              </span>,
            ],
            [
              <span key="u1">Vault unlocked</span>,
              <span key="u2">
                Locked vault returns <DocCode>403 vault_locked</DocCode> on any
                wallet endpoint.
              </span>,
            ],
            [
              <span key="b1">Active plan</span>,
              <span key="b2">
                Wallet endpoints are gated by{" "}
                <DocCode>require_active_plan</DocCode>. Expired plans return{" "}
                <DocCode>402 plan_inactive</DocCode>.
              </span>,
            ],
          ]}
        />
      </DocSection>

      <DocSection id="walkthrough" title="Walkthrough">
        <h3 className="text-base font-semibold text-gray-100 mt-2 mb-2">
          Create a parent wallet
        </h3>
        <DocSteps
          steps={[
            {
              title: "Open the wallets page",
              body: (
                <>
                  Navigate to <DocCode>/wallets</DocCode>. If you see &ldquo;App
                  is locked&rdquo;, unlock first via the lock badge in the
                  header or by visiting <DocCode>/login</DocCode>.
                </>
              ),
            },
            {
              title: "Click New wallet",
              body: (
                <>
                  A small form opens. Enter a name like{" "}
                  <DocCode>dev-main</DocCode> or{" "}
                  <DocCode>lp-funding</DocCode>. Names are local-only labels —
                  they never appear on-chain.
                </>
              ),
            },
            {
              title: "Confirm",
              body: (
                <>
                  A new Ed25519 keypair is generated from your seed phrase at
                  the next free derivation index, encrypted, and persisted.
                  The public key appears in the list immediately.
                </>
              ),
            },
          ]}
        />

        <h3 className="text-base font-semibold text-gray-100 mt-6 mb-2">
          Generate sub-wallets
        </h3>
        <DocSteps
          steps={[
            {
              title: "Find the parent in the list",
              body: <>Click <strong>Generate sub-wallets</strong> on that row.</>,
            },
            {
              title: "Pick a count",
              body: (
                <>
                  Typical: <DocCode>5</DocCode>–<DocCode>50</DocCode>. The
                  backend hard-caps this at <DocCode>MAX_SUBWALLET_COUNT</DocCode>{" "}
                  (currently 100) — anything higher returns{" "}
                  <DocCode>400 bad_request</DocCode>.
                </>
              ),
            },
            {
              title: "Confirm",
              body: (
                <>
                  Each sub-wallet derives from the same seed but at a unique
                  index, with <DocCode>parent_id</DocCode> set on the row. They
                  inherit the parent&rsquo;s <DocCode>group_id</DocCode> for
                  filtering.
                </>
              ),
            },
          ]}
        />

        <h3 className="text-base font-semibold text-gray-100 mt-6 mb-2">
          View balance
        </h3>
        <p className="text-sm text-gray-400 leading-relaxed">
          Click the balance icon on a wallet row. The page calls{" "}
          <DocCode>GET /api/v1/wallets/{`{id}`}/balance</DocCode> which fetches
          lamports + every SPL token account in parallel. SOL is shown to 9
          decimals; tokens show <DocCode>amount</DocCode> as a UI amount with
          per-mint decimals.
        </p>

        <h3 className="text-base font-semibold text-gray-100 mt-6 mb-2">
          Send SOL or tokens
        </h3>
        <DocSteps
          steps={[
            {
              title: "Click Send on the source wallet",
              body: <>The send modal appears.</>,
            },
            {
              title: "Paste recipient",
              body: (
                <>
                  Any valid Solana base58 address. Validation runs both
                  client-side (length + base58) and server-side (full Pubkey
                  parse).
                </>
              ),
            },
            {
              title: "Enter amount",
              body: (
                <>
                  For SOL, type a UI amount (e.g. <DocCode>0.5</DocCode>). For
                  tokens, the page converts using the mint&rsquo;s decimals.
                  Amount of <DocCode>0</DocCode> is rejected at the API layer.
                </>
              ),
            },
            {
              title: "Submit",
              body: (
                <>
                  The backend builds the transaction, sets a priority fee
                  (see <DocCode>OFFIVEX_PRIORITY_FEE_MICRO_LAMPORTS</DocCode>),
                  signs it with the in-memory keypair, and submits it. You get
                  back the signature — click Solscan to verify confirmation.
                </>
              ),
            },
          ]}
        />

        <h3 className="text-base font-semibold text-gray-100 mt-6 mb-2">
          Export an encrypted secret key
        </h3>
        <DocCallout variant="danger" title="Read this first">
          The encrypted blob you download contains your secret key. Anyone with
          both the blob and your <em>export password</em> can spend the wallet
          forever. Use a strong export password (12+ characters mixed) and
          store the blob like you&rsquo;d store the seed phrase itself.
        </DocCallout>
        <DocSteps
          steps={[
            {
              title: "Click Export",
              body: (
                <>You&rsquo;re prompted for a fresh export password.</>
              ),
            },
            {
              title: "Set the export password",
              body: (
                <>
                  This is <em>not</em> your master password — it&rsquo;s an
                  isolated key used only for this export. The same validation
                  rules apply (12+ chars, mixed case, digit, symbol).
                </>
              ),
            },
            {
              title: "Save the encrypted blob",
              body: (
                <>
                  You get back an AES-256-GCM ciphertext base64-encoded.
                  Decrypt offline with the matching password to recover the
                  raw 64-byte secret key bytes.
                </>
              ),
            },
          ]}
        />
      </DocSection>

      <DocSection id="reference" title="Field reference">
        <DocTable
          headers={["Field", "Where", "Type", "Notes"]}
          rows={[
            [
              <DocCode key="n">name</DocCode>,
              "Create form",
              "string",
              "Local label only. 1–64 chars. Never sent on-chain.",
            ],
            [
              <DocCode key="g">group_id</DocCode>,
              "Create form",
              "string?",
              "Optional grouping for filtering. Inherited by sub-wallets.",
            ],
            [
              <DocCode key="c">count</DocCode>,
              "Sub-wallets form",
              "int",
              "1 ≤ count ≤ 100. Higher counts are rejected by the API.",
            ],
            [
              <DocCode key="to">to_address</DocCode>,
              "Send form",
              "base58 string",
              "Validated as a Solana Pubkey before transaction build.",
            ],
            [
              <DocCode key="m">mint_address</DocCode>,
              "Send form (optional)",
              "base58 string?",
              "Provide for SPL token sends. Omit for SOL sends.",
            ],
            [
              <DocCode key="a">amount</DocCode>,
              "Send form",
              "integer (raw units)",
              "Lamports for SOL, raw token units (UI-amount × 10^decimals) for tokens. Zero is rejected.",
            ],
            [
              <DocCode key="ep">export_password</DocCode>,
              "Export modal",
              "string",
              "Independent password used for the export blob only. Min 12 chars.",
            ],
          ]}
        />
      </DocSection>

      <DocSection id="internals" title="Under the hood">
        <ul className="list-disc list-inside space-y-2 text-sm text-gray-300 leading-relaxed">
          <li>
            <strong>Derivation path:</strong>{" "}
            <DocCode>m/44&apos;/501&apos;/index&apos;/0&apos;</DocCode> on the
            seed phrase you set during password setup. Each wallet gets the
            next free index. Sub-wallets share the same derivation tree — they
            just live under a <DocCode>parent_id</DocCode> in the DB.
          </li>
          <li>
            <strong>Encryption:</strong> Per-wallet AES-256-GCM with a unique
            nonce. The key is derived from your master password via Argon2id
            (64 MiB memory cost, 3 iterations). Keys never touch disk; they
            live only in the unlocked <DocCode>WalletManager</DocCode>.
          </li>
          <li>
            <strong>Send transaction:</strong> The backend fetches the latest
            blockhash, adds a{" "}
            <DocCode>ComputeBudgetInstruction::SetComputeUnitPrice</DocCode>{" "}
            using your configured priority fee, builds the transfer (SOL or
            SPL), signs in-memory, and submits via the active RPC. The
            signature returns synchronously; confirmation happens out-of-band.
          </li>
          <li>
            <strong>Auto-lock:</strong> After <DocCode>SESSION_TIMEOUT_SECONDS</DocCode>{" "}
            of inactivity the keypairs are zeroized. The next wallet call
            returns <DocCode>403 vault_locked</DocCode> — unlock via{" "}
            <DocCode>/login</DocCode> to resume.
          </li>
        </ul>
      </DocSection>

      <DocSection id="pitfalls" title="Pitfalls & errors">
        <DocTable
          headers={["Error", "Cause", "Fix"]}
          rows={[
            [
              <DocCode key="e1">403 vault_locked</DocCode>,
              "Auto-lock timer fired or you locked manually.",
              <>
                Go to <DocCode>/login</DocCode>, enter master password, retry.
              </>,
            ],
            [
              <DocCode key="e2">400 bad_request: count</DocCode>,
              "Sub-wallet count out of [1, 100].",
              "Pick a value within range.",
            ],
            [
              <DocCode key="e3">400 invalid recipient</DocCode>,
              "Pasted address is not a valid Solana Pubkey.",
              "Verify the address — Solana addresses are 32 to 44 base58 chars.",
            ],
            [
              <DocCode key="e4">500 RPC error</DocCode>,
              "All configured RPC endpoints are unreachable.",
              <>
                Open <Link href="/docs/feature/settings" className="text-offivex-purple-light underline">Settings</Link>{" "}
                and add a paid endpoint (QuickNode/Helius).
              </>,
            ],
            [
              <DocCode key="e5">Send succeeds but balance unchanged</DocCode>,
              "Tx submitted but failed to land — bad blockhash, slippage, or insufficient funds for tx fee.",
              "Click Solscan on the signature to see the on-chain error. Top up the wallet if it’s short on lamports.",
            ],
            [
              <DocCode key="e6">Export password rejected</DocCode>,
              "Less than 12 chars or missing class.",
              "Use 12+ chars with uppercase, lowercase, digit, and symbol.",
            ],
          ]}
        />
      </DocSection>

      <DocSection id="related" title="Related">
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-300">
          <li>
            <Link href="/docs/feature/distribution" className="text-offivex-purple-light underline">Distribution</Link>{" "}
            — fan SOL out across sub-wallets with variance and delays.
          </li>
          <li>
            <Link href="/docs/feature/security" className="text-offivex-purple-light underline">Security</Link>{" "}
            — master password rotation, seed phrase recovery.
          </li>
          <li>
            <Link href="/docs/tutorial" className="text-offivex-purple-light underline">Master Tutorial</Link>{" "}
            — wallets in the context of a full launch flow (steps 5–7).
          </li>
        </ul>
      </DocSection>

      {/* SCREENSHOT: wallets-list-and-create */}
    </DocLayout>
  );
}
