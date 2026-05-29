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
  { id: "what", label: "Threat model in one minute" },
  { id: "password", label: "Master password" },
  { id: "seed", label: "Seed phrase" },
  { id: "lock", label: "Auto-lock" },
  { id: "export", label: "Wallet export" },
  { id: "rotate", label: "Rotating the master password" },
  { id: "recovery", label: "Disaster recovery" },
  { id: "checklist", label: "Operational checklist" },
];

export default function SecurityFeatureDocsPage() {
  return (
    <DocLayout
      eyebrow="Feature reference"
      title="Security"
      intro="What protects your wallets, how each protection actually works, and the small set of things you have to do as the operator. Read this once before mainnet, and revisit every quarter."
      breadcrumbs={[
        { href: "/docs", label: "Documentation" },
        { href: "/docs#feature-reference", label: "Feature reference" },
      ]}
      prev={{ href: "/docs/feature/billing", label: "Billing" }}
      next={{ href: "/docs/feature/privacy-mode", label: "Privacy Mode" }}
      toc={TOC}
    >
      <DocSection id="what" title="Threat model in one minute">
        <p className="text-gray-300 leading-relaxed">
          The thing we&rsquo;re protecting is the secret keys of the wallets
          you create here. The realistic threats are: (1) someone steals your
          local <DocCode>data/offivex.db</DocCode> file, (2) someone gets
          shell on your machine while the vault is unlocked, (3) you write
          your seed phrase somewhere it shouldn&rsquo;t be.
        </p>
        <p className="text-gray-300 leading-relaxed mt-3">
          The defenses are: (1) per-wallet AES-256-GCM with Argon2id-derived
          keys, (2) keys never persist to disk plaintext and are zeroized on
          auto-lock, (3) seed phrase is shown exactly once at setup, never
          again until you explicitly request it, and the response is
          uncacheable.
        </p>
      </DocSection>

      <DocSection id="password" title="Master password">
        <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-300">
          <li>Rules: 12+ chars, mixed case, at least one digit, at least one symbol. Enforced both client- and server-side.</li>
          <li>Derived to a 32-byte key via Argon2id — memory cost 64 MiB, 3 iterations. Brute-forcing a strong password against this is impractical on commodity hardware.</li>
          <li>The derived key never touches disk. It lives only in <DocCode>WalletManager</DocCode> after unlock.</li>
          <li>Lose the password → the only recovery is your seed phrase (see below). There is no &ldquo;forgot password&rdquo; email.</li>
        </ul>
      </DocSection>

      <DocSection id="seed" title="Seed phrase">
        <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-300">
          <li>BIP39 12- or 24-word phrase, shown <em>once</em> when you set your master password.</li>
          <li>You can re-display it later via <DocCode>GET /api/v1/auth/seed-phrase</DocCode>, which requires an unlocked vault and returns with <DocCode>Cache-Control: no-store</DocCode> so it never sits in any cache.</li>
          <li>The seed derives every wallet&rsquo;s keypair at path <DocCode>m/44&apos;/501&apos;/index&apos;/0&apos;</DocCode>. Anyone with the seed can recreate every wallet.</li>
        </ul>
        <DocCallout variant="danger" title="Storage rules">
          Write it on paper, store the paper offline (safe / lockbox / metal
          plate). Do not paste it into any cloud doc, password manager
          accessible from a phone, or chat app. Do not photograph it.
        </DocCallout>
      </DocSection>

      <DocSection id="lock" title="Auto-lock">
        <p className="text-sm text-gray-300 leading-relaxed">
          After <DocCode>SESSION_TIMEOUT_SECONDS</DocCode> (default 3600) of
          inactivity, the in-memory keypairs are zeroized. Every subsequent
          wallet call returns <DocCode>403 vault_locked</DocCode>. Lock
          manually any time via the lock badge in the header.
        </p>
      </DocSection>

      <DocSection id="export" title="Wallet export">
        <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-300">
          <li>Export a single wallet&rsquo;s secret key by supplying a fresh <em>export password</em> (independent of your master password).</li>
          <li>The response is the secret key bytes encrypted with the export password (AES-256-GCM, same scheme as the at-rest vault).</li>
          <li>Decrypt offline with the matching password to recover 64-byte secret key bytes, suitable for Phantom/Solflare import.</li>
          <li>Use a strong export password and store the blob with the same care as the seed phrase.</li>
        </ul>
      </DocSection>

      <DocSection id="rotate" title="Rotating the master password">
        <DocSteps
          steps={[
            { title: "From your account → security page (or admin panel for managed deploys)", body: <>The rotate flow asks for both the current and new password.</> },
            { title: "On submit", body: <>The backend decrypts every wallet&rsquo;s secret key with the old derived key, re-encrypts with the new derived key, and persists. All inside one DB transaction.</> },
            { title: "Old password is dead immediately", body: <>If the rotation succeeds, the old password no longer unlocks the vault. If anything errored mid-rotation, the transaction rolls back and the old password still works.</> },
          ]}
        />
      </DocSection>

      <DocSection id="recovery" title="Disaster recovery">
        <DocTable
          headers={["You lost", "What still works", "Recovery path"]}
          rows={[
            [<>Master password</>, "Nothing — vault won&rsquo;t unlock.", <>Restore from seed phrase via <DocCode>/login</DocCode> &ldquo;Restore from seed&rdquo;. Provide the seed, set a new password.</>],
            [<>Seed phrase + master password</>, "Active session, but cannot reset password.", <>Export every wallet now (encrypted blobs), back up the DB, then plan a clean migration.</>],
            [<>Local DB file</>, "Everything if you have your seed phrase.", "Spin up a fresh install, restore from seed phrase, wallets re-derive."],
            [<>Both DB and seed</>, "Funds in the wallets are gone.", "There is no path. This is what the backup paragraph is for."],
          ]}
        />
      </DocSection>

      <DocSection id="checklist" title="Operational checklist">
        <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-300">
          <li>Seed phrase stored offline, somewhere you&rsquo;d find it if your laptop disappeared.</li>
          <li>Backup of <DocCode>data/offivex.db</DocCode> taken at least weekly. Encrypted at rest if it lives in a cloud bucket.</li>
          <li>Master password is in your password manager, distinct from any other password you own.</li>
          <li>Auto-lock timeout set to something you actually want (1 h dev, 5 min for shared machines).</li>
          <li>CORS origin in <DocCode>OFFIVEX_CORS_ORIGINS</DocCode> is the exact production domain on mainnet — boot fails fast otherwise.</li>
          <li>Pre-commit hook (<DocCode>.githooks/pre-commit</DocCode>) installed so a stray <DocCode>.env</DocCode> never lands in a commit.</li>
          <li>
            <Link href="/docs/feature/privacy-mode" className="text-offivex-purple-light underline">Privacy Mode</Link>{" "}
            engaged when streaming, recording, or screen-sharing the dashboard. Blurs every balance / address / amount so a viewer can&rsquo;t reverse-engineer your fleet.
          </li>
        </ul>
      </DocSection>

      <DocCallout variant="info" title="See also">
        For the long-form security walkthrough (threat scenarios, mitigations,
        audit findings),{" "}
        <Link href="/docs/security" className="text-offivex-purple-light underline">
          read the full security guide
        </Link>
        .
      </DocCallout>
    </DocLayout>
  );
}
