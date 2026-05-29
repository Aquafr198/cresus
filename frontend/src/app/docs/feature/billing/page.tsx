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
  { id: "reference", label: "Reference" },
  { id: "internals", label: "Under the hood" },
  { id: "pitfalls", label: "Pitfalls & errors" },
  { id: "related", label: "Related" },
];

export default function BillingDocsPage() {
  return (
    <DocLayout
      eyebrow="Feature reference"
      title="Billing"
      intro="View your current plan, renew, change tier, and audit past payments. Plans are charged in SOL — each renewal generates an invoice with a unique deposit address derived from the platform treasury seed."
      breadcrumbs={[
        { href: "/docs", label: "Documentation" },
        { href: "/docs#feature-reference", label: "Feature reference" },
      ]}
      prev={{ href: "/docs/feature/settings", label: "Settings" }}
      next={{ href: "/docs/feature/security", label: "Security" }}
      toc={TOC}
    >
      <DocSection id="what" title="What it does">
        <p className="text-gray-300 leading-relaxed">
          <DocCode>/billing</DocCode> shows your current plan, next renewal
          date, payment history (with Solscan links per invoice), and the
          renew flow. Renewal generates a one-shot invoice address; payments
          sent to it auto-credit your account once confirmed.
        </p>
      </DocSection>

      <DocSection id="when" title="When to use it">
        <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-300">
          <li>Your plan is about to expire.</li>
          <li>You want to upgrade or downgrade tier.</li>
          <li>You&rsquo;re auditing past payments for accounting.</li>
        </ul>
      </DocSection>

      <DocSection id="prereq" title="Pre-requisites">
        <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-300">
          <li>An applied + approved account (the apply form gates this).</li>
          <li>A wallet you can send SOL from — Phantom, Solflare, or one of your Offivex wallets.</li>
        </ul>
      </DocSection>

      <DocSection id="walkthrough" title="Walkthrough">
        <DocSteps
          steps={[
            { title: "Open /billing", body: <>You see plan, expiry, history.</> },
            { title: "Pick a plan", body: <>Tiers vary by sub-feature caps (concurrent monitor subs, profile count, bot count).</> },
            { title: "Click Renew / Upgrade", body: <>An invoice modal appears with the address, the SOL amount, and a QR code.</> },
            { title: "Send SOL", body: <>From any wallet. Don&rsquo;t overpay — overpayment is not refunded automatically.</> },
            { title: "Wait for confirmation", body: <>Once the deposit confirms on-chain, your plan is extended/changed within ~60s.</> },
            { title: "Verify", body: <>Plan row updates. The payment appears in history with its signature.</> },
          ]}
        />
      </DocSection>

      <DocSection id="reference" title="Reference">
        <DocTable
          headers={["Field", "Notes"]}
          rows={[
            [<DocCode key="p">plan</DocCode>, "Active tier."],
            [<DocCode key="e">expires_at</DocCode>, "Plan expiry in UTC."],
            [<DocCode key="b">billing_address</DocCode>, "One-shot deposit address (HD-derived). Reused only if you cancel and renew the same invoice."],
            [<DocCode key="s">amount_sol</DocCode>, "USD-equivalent priced at invoice creation, locked for the invoice TTL (typically 30 min)."],
            [<DocCode key="i">history[]</DocCode>, "Past payments with signature, amount, plan changed-to, timestamp."],
          ]}
        />
      </DocSection>

      <DocSection id="internals" title="Under the hood">
        <ul className="list-disc list-inside space-y-2 text-sm text-gray-300 leading-relaxed">
          <li>The backend derives invoice addresses from <DocCode>OFFIVEX_TREASURY_SEED_PHRASE</DocCode> at path <DocCode>m/44&apos;/501&apos;/N&apos;/0&apos;</DocCode>. N increments per invoice — each address is single-use by convention.</li>
          <li>SOL/USD pricing uses CoinGecko with a stale-fallback cache, and falls back to <DocCode>OFFIVEX_FALLBACK_SOL_USD</DocCode> if CoinGecko is unreachable and the cache is empty.</li>
          <li>A background watcher polls each open invoice address. On confirmed deposit ≥ <DocCode>amount_sol</DocCode>, the plan record is updated atomically.</li>
        </ul>
      </DocSection>

      <DocSection id="pitfalls" title="Pitfalls & errors">
        <DocTable
          headers={["Issue", "Cause", "Fix"]}
          rows={[
            [<>Plan didn&rsquo;t activate after payment</>, "Sent the wrong amount, or invoice TTL expired before confirmation landed.", "Open a support ticket with the signature; the admin can manually credit."],
            [<>Wrong amount accepted but plan unchanged</>, "Race: the watcher saw it but exchange-rate changed mid-invoice.", "Same as above — manual reconciliation."],
            [<>402 plan_inactive even after renewal</>, "Plan cache stale (5 min TTL).", "Refresh the page or wait 5 min."],
          ]}
        />
      </DocSection>

      <DocCallout variant="danger" title="Send from a wallet you control">
        Sending from an exchange may show the exchange&rsquo;s pooled wallet
        as the sender. That breaks any future support reconciliation. Always
        pay from a wallet you control directly.
      </DocCallout>

      <DocSection id="related" title="Related">
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-300">
          <li><Link href="/docs/feature/referral" className="text-offivex-purple-light underline">Referral</Link> — commissions accrue from these payments.</li>
        </ul>
      </DocSection>
    </DocLayout>
  );
}
