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

export default function MintDocsPage() {
  return (
    <DocLayout
      eyebrow="Feature reference"
      title="Mint Token"
      intro="Create a Solana SPL token end-to-end: keypair → mint account → Metaplex on-chain metadata → IPFS-pinned JSON + image. The page handles all of that as a single user action so you don't juggle CLI commands."
      breadcrumbs={[
        { href: "/docs", label: "Documentation" },
        { href: "/docs#feature-reference", label: "Feature reference" },
      ]}
      prev={{ href: "/docs/feature/wallets", label: "Wallets" }}
      next={{ href: "/docs/feature/bundle", label: "Bundle Launch" }}
      toc={TOC}
    >
      <DocSection id="what" title="What it does">
        <p className="text-gray-300 leading-relaxed">
          <DocCode>/mint</DocCode> creates an SPL token in one transaction
          batch:
        </p>
        <ul className="list-decimal list-inside mt-3 space-y-1 text-sm text-gray-300">
          <li>Generates a fresh mint keypair (or grinds a vanity prefix).</li>
          <li>
            Creates the mint account and initializes it with the chosen
            decimals and your wallet as the mint authority.
          </li>
          <li>
            Pins your logo image to IPFS (via Pinata), constructs the Metaplex
            JSON, and pins that too.
          </li>
          <li>
            Calls the Metaplex Token Metadata program to attach the JSON URI
            to the mint.
          </li>
          <li>
            Mints the initial supply to your dev wallet and (by default)
            atomically revokes the mint authority so the supply is locked.
          </li>
          <li>
            Leaves the freeze authority disabled by default (creator
            cannot freeze holders&rsquo; tokens) — both defaults are tuned
            to pass DEXTools and RugCheck audits out of the box. See the{" "}
            <Link href="/docs/recipes#pass-dextools-rugcheck" className="text-offivex-purple-light underline">
              Pass DEXTools / RugCheck
            </Link>{" "}
            recipe for the full anti-rug matrix.
          </li>
        </ul>
      </DocSection>

      <DocSection id="when" title="When to use it">
        <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-300">
          <li>You&rsquo;re launching a new token and need the mint address.</li>
          <li>
            You want metadata that wallets (Phantom, Backpack) and explorers
            (Solscan, Birdeye) actually render — name, symbol, image, socials.
          </li>
          <li>
            You want a vanity address ending in a few chosen base58 characters
            (e.g. <DocCode>pump</DocCode>, <DocCode>moon</DocCode>).
          </li>
          <li>
            You want to <em>clone</em> an existing token&rsquo;s metadata
            (same image/name/symbol with a fresh mint).
          </li>
        </ul>
      </DocSection>

      <DocSection id="prereq" title="Pre-requisites">
        <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-300">
          <li>Vault unlocked, valid API key, active plan.</li>
          <li>
            A dev wallet with at least ~0.02 SOL for rent + tx fees (mint
            account ≈ 0.0014 SOL, metadata ≈ 0.0056 SOL, plus fees).
          </li>
          <li>
            Pinata configured if you want metadata pinned to IPFS — see{" "}
            <DocCode>PINATA_JWT</DocCode> in{" "}
            <Link href="/docs/feature/settings" className="text-offivex-purple-light underline">
              Settings
            </Link>
            . Without it the page falls back to local storage which is{" "}
            <em>not recommended</em> for mainnet.
          </li>
        </ul>
      </DocSection>

      <DocSection id="walkthrough" title="Walkthrough">
        <DocSteps
          steps={[
            {
              title: "Open /mint",
              body: <>The form has three panels: identity, supply, socials.</>,
            },
            {
              title: "Identity",
              body: (
                <>
                  Set <DocCode>name</DocCode> (e.g. <DocCode>OffivexCoin</DocCode>),{" "}
                  <DocCode>symbol</DocCode> (3–8 uppercase), and upload an{" "}
                  <strong>image</strong> (PNG/JPG/WebP, ≤10 MB). The image is
                  what wallets and Birdeye fetch — make it square and clean.
                </>
              ),
            },
            {
              title: "Supply & decimals",
              body: (
                <>
                  <DocCode>decimals</DocCode> is typically 6 or 9 (matches USDC
                  and SOL respectively). <DocCode>supply</DocCode> is the
                  initial mint amount in UI units — the page handles the{" "}
                  <DocCode>×10^decimals</DocCode> conversion. Tick{" "}
                  <strong>Revoke mint authority</strong> if the supply must be
                  immutable post-mint.
                </>
              ),
            },
            {
              title: "Socials (optional)",
              body: (
                <>
                  Add Twitter, Telegram, website. These go into the IPFS JSON
                  under <DocCode>extensions</DocCode> and show up on Solscan
                  and similar explorers.
                </>
              ),
            },
            {
              title: "(Optional) Vanity grind",
              body: (
                <>
                  Tick <strong>Vanity</strong> and enter 1–4 trailing base58
                  characters. Longer suffixes take dramatically longer (each
                  extra char ≈ 58× more work).
                </>
              ),
            },
            {
              title: "Click Mint",
              body: (
                <>
                  The backend grinds (if vanity), pins, builds the multi-instr
                  tx, signs, and submits. On success you get the mint address
                  and a Solscan button.
                </>
              ),
            },
          ]}
        />
      </DocSection>

      <DocSection id="reference" title="Field reference">
        <DocTable
          headers={["Field", "Type", "Range / default", "Notes"]}
          rows={[
            [<DocCode key="n">name</DocCode>, "string", "1–32 chars", "Stored in Metaplex on-chain metadata."],
            [<DocCode key="s">symbol</DocCode>, "string", "1–10 chars (typically 3–8)", "Convention: uppercase ASCII."],
            [<DocCode key="d">decimals</DocCode>, "int", "0–9, default 6", "Common values: 6 (USDC-like), 9 (SOL-like)."],
            [<DocCode key="su">supply</DocCode>, "u64 (UI)", "1 – 18 446 744 073", "Converted to raw via ×10^decimals."],
            [<DocCode key="i">image</DocCode>, "file", "≤10 MB", "PNG/JPG/WebP. Pinned to IPFS via Pinata."],
            [<DocCode key="r">revoke_mint_authority</DocCode>, "bool", "default true", "Atomically appends a SetAuthority(None) instruction. RugCheck/DEXTools require this for an anti-rug pass. Uncheck only for a deliberately mutable supply."],
            [<DocCode key="f">keep_freeze_authority</DocCode>, "bool", "default false", "Opt-in only. When false, the freeze authority is set to None at mint init — no one can ever freeze a holder's tokens. Set true for regulated tokens / anti-bot freeze use cases."],
            [<DocCode key="v">vanity_suffix</DocCode>, "string?", "1–4 base58 chars", "Each extra char roughly 58× the grind time."],
            [<DocCode key="x">socials.twitter / telegram / website</DocCode>, "url?", "—", "Stored in IPFS JSON under extensions."],
          ]}
        />
      </DocSection>

      <DocSection id="internals" title="Under the hood">
        <p className="text-sm text-gray-300 leading-relaxed">
          The mint flow is a single Solana transaction with the following
          instructions, in order:
        </p>
        <DocCodeBlock>{`createAccount(mint, lamports=rent, owner=TokenProgram)
initializeMint(mint, decimals, authority=dev,
               freezeAuthority = keep_freeze_authority ? Some(dev) : None)
createAssociatedTokenAccount(dev, mint)
mintTo(mint, dev_ata, amount=supply × 10^decimals)
[if metadata_uri]
  createMetadataAccountV3(mint, uri, name, symbol, sellerFeeBps=0)
[if revoke_mint_authority]  // default ON
  setAuthority(mint, newAuthority=None, AuthorityType::MintTokens)`}</DocCodeBlock>
        <p className="text-sm text-gray-300 leading-relaxed mt-3">
          The post-mint <Link href="/docs/recipes#pass-dextools-rugcheck" className="text-offivex-purple-light underline">Revoke
          Mint Authority</Link> button hits{" "}
          <DocCode>POST /api/v1/tokens/{`{mint}`}/revoke-mint-authority</DocCode>{" "}
          for tokens that were minted with a mutable supply originally.
        </p>
        <p className="text-sm text-gray-300 leading-relaxed mt-3">
          A priority-fee compute-budget instruction is prepended using your{" "}
          <DocCode>OFFIVEX_PRIORITY_FEE_MICRO_LAMPORTS</DocCode> setting.
          Pinata uploads happen in parallel with vanity grinding when possible
          to minimise wall-clock time.
        </p>
      </DocSection>

      <DocSection id="pitfalls" title="Pitfalls & errors">
        <DocTable
          headers={["Error", "Cause", "Fix"]}
          rows={[
            [
              <DocCode key="e1">IPFS pin failed</DocCode>,
              "Pinata JWT missing or invalid; file > 10 MB.",
              <>
                Add a valid <DocCode>PINATA_JWT</DocCode> in{" "}
                <Link href="/docs/feature/settings" className="text-offivex-purple-light underline">Settings</Link>,
                or shrink the image.
              </>,
            ],
            [
              <DocCode key="e2">Metaplex create failed</DocCode>,
              "Mint authority mismatch — usually a stale tx, or you used a different wallet between mint and metadata.",
              "Retry from a fresh tx; the page handles this in one batch so it shouldn’t recur.",
            ],
            [
              <DocCode key="e3">Vanity grind taking forever</DocCode>,
              "Suffix too long (5+ chars).",
              "Reduce to 3–4 chars. 4 chars typically grinds in seconds on a workstation.",
            ],
            [
              <DocCode key="e4">Insufficient funds for rent</DocCode>,
              "Dev wallet has < 0.02 SOL.",
              <>
                Top up via the <Link href="/docs/feature/wallets" className="text-offivex-purple-light underline">Wallets</Link> page.
              </>,
            ],
            [
              <DocCode key="e5">Phantom shows no image</DocCode>,
              "IPFS gateway cold cache, or wallet uses its own gateway with rate-limits.",
              "Wait a few minutes — Phantom re-fetches periodically. Solscan typically loads sooner.",
            ],
          ]}
        />
      </DocSection>

      <DocSection id="related" title="Related">
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-300">
          <li>
            <Link href="/docs/feature/meme-library" className="text-offivex-purple-light underline">Meme Library</Link>{" "}
            — manage reusable images and JSON templates.
          </li>
          <li>
            <Link href="/docs/feature/bundle" className="text-offivex-purple-light underline">Bundle Launch</Link>{" "}
            — what to do <em>after</em> the mint exists.
          </li>
          <li>
            <Link href="/docs/recipes" className="text-offivex-purple-light underline">Recipes</Link>{" "}
            — Sniper Bundle Launch and Fair Launch both start here.
          </li>
        </ul>
      </DocSection>

      <DocCallout variant="tip" title="Mint-first or bundle-first?">
        You can mint a token without launching it. If you&rsquo;re testing the
        metadata pipeline (image rendering, socials), do a devnet mint first;
        Phantom shows devnet metadata too, so you can verify the look before
        spending mainnet SOL.
      </DocCallout>
      {/* SCREENSHOT: mint-form-filled */}
    </DocLayout>
  );
}
