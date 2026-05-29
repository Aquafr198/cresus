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

export default function ReferralDocsPage() {
  return (
    <DocLayout
      eyebrow="Feature reference"
      title="Referral"
      intro="Share a referral code with other launchers. When they apply, your code is recorded against their account. Once they activate a paid plan you earn a commission, paid out in SOL after a cooldown window."
      breadcrumbs={[
        { href: "/docs", label: "Documentation" },
        { href: "/docs#feature-reference", label: "Feature reference" },
      ]}
      prev={{ href: "/docs/feature/monitor", label: "Monitor" }}
      next={{ href: "/docs/feature/settings", label: "Settings" }}
      toc={TOC}
    >
      <DocSection id="what" title="What it does">
        <p className="text-gray-300 leading-relaxed">
          <DocCode>/referral</DocCode> shows your unique code, the link to
          share, total referrals attached so far, qualifying referrals (paid),
          accrued commission, and pending payout. You can change your payout
          address at any time.
        </p>
      </DocSection>

      <DocSection id="when" title="When to use it">
        <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-300">
          <li>You&rsquo;re running a community or content channel and want to monetize sign-ups.</li>
          <li>You introduce another launcher to the platform and want credit for it.</li>
        </ul>
      </DocSection>

      <DocSection id="prereq" title="Pre-requisites">
        <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-300">
          <li>An active plan (referrals from inactive accounts are not counted).</li>
          <li>A Solana address for payouts.</li>
        </ul>
      </DocSection>

      <DocSection id="walkthrough" title="Walkthrough">
        <DocSteps
          steps={[
            { title: "Open /referral", body: <>Your code appears at the top.</> },
            { title: "Copy the link", body: <>The full URL embeds your code in the apply-form query string.</> },
            { title: "Set payout address", body: <>Any Solana address. You can change it later, but a pending payout will only be sent to the address recorded at payout time.</> },
            { title: "Watch the dashboard", body: <>Referrals (signed up), qualifying (have an active plan), commission accrued, next payout date.</> },
          ]}
        />
      </DocSection>

      <DocSection id="reference" title="Reference">
        <DocTable
          headers={["Field", "Notes"]}
          rows={[
            [<DocCode key="c">code</DocCode>, "Your immutable referral code. 6 chars."],
            [<DocCode key="r">referrals</DocCode>, "Accounts that applied with your code."],
            [<DocCode key="q">qualifying</DocCode>, "Subset whose plan is currently active."],
            [<DocCode key="a">accrued_sol</DocCode>, "Commission earned but not yet paid out."],
            [<DocCode key="p">payout_address</DocCode>, "Solana base58 destination."],
            [<DocCode key="n">next_payout_at</DocCode>, "Timestamp of the next batch payout."],
          ]}
        />
      </DocSection>

      <DocSection id="internals" title="Under the hood">
        <ul className="list-disc list-inside space-y-2 text-sm text-gray-300 leading-relaxed">
          <li>The apply-form persists <DocCode>referred_by_code</DocCode> on the applicant record at submission time. Once an admin approves and the applicant activates a plan, the code resolves to a referrer.</li>
          <li>Commission accrues at a configurable percentage of the plan price. Payouts batch nightly: any account with <DocCode>accrued_sol</DocCode> ≥ payout threshold is sent.</li>
          <li>Payout transactions are recorded with their signatures so you can audit them on Solscan from the referral page.</li>
        </ul>
      </DocSection>

      <DocSection id="pitfalls" title="Pitfalls & errors">
        <DocTable
          headers={["Issue", "Cause", "Fix"]}
          rows={[
            [<>No referrals show up</>, "Applicants didn&rsquo;t use the link with the code in the query string.", "Re-share the exact link from /referral, not just the code."],
            [<>Accrued but no payout</>, "Below payout threshold, or payout address invalid.", "Verify the address; the next nightly batch will catch up."],
            [<>Referral disappeared</>, "Their plan lapsed.", "Counts as non-qualifying until they re-activate."],
          ]}
        />
      </DocSection>

      <DocCallout variant="info" title="Self-referrals don't count">
        Accounts created from your own IP / email domain are flagged and
        excluded from qualifying counts. Don&rsquo;t try to refer yourself.
      </DocCallout>

      <DocSection id="related" title="Related">
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-300">
          <li><Link href="/docs/feature/billing" className="text-offivex-purple-light underline">Billing</Link> — plan state controls whether your referrals count.</li>
        </ul>
      </DocSection>
    </DocLayout>
  );
}
