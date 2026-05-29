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

export default function ProfilesDocsPage() {
  return (
    <DocLayout
      eyebrow="Feature reference"
      title="Profiles"
      intro="Generate random identities (display name, locale, user-agent string, timezone) and bind them to wallets. Used by other features to vary HTTP headers and UI fingerprint when interacting with external APIs from per-wallet contexts."
      breadcrumbs={[
        { href: "/docs", label: "Documentation" },
        { href: "/docs#feature-reference", label: "Feature reference" },
      ]}
      prev={{ href: "/docs/feature/distribution", label: "Distribution" }}
      next={{ href: "/docs/feature/monitor", label: "Monitor" }}
      toc={TOC}
    >
      <DocSection id="what" title="What it does">
        <p className="text-gray-300 leading-relaxed">
          A profile is a synthetic identity record: name, locale, user-agent,
          timezone, and a stable random seed. Bind one to a wallet, and the
          features that hit external APIs from that wallet&rsquo;s context
          (Volume Bot, Warmer) will use the profile&rsquo;s headers and
          fingerprint.
        </p>
      </DocSection>

      <DocSection id="when" title="When to use it">
        <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-300">
          <li>Building a wallet fleet where every member should appear to be a different person from a different machine.</li>
          <li>Reducing collisions in browser-fingerprint heuristics when wallets share an IP.</li>
        </ul>
      </DocSection>

      <DocSection id="prereq" title="Pre-requisites">
        <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-300">
          <li>Wallets created.</li>
          <li>(Optional) a list of locales/timezones you want to bias toward.</li>
        </ul>
      </DocSection>

      <DocSection id="walkthrough" title="Walkthrough">
        <DocSteps
          steps={[
            { title: "Open /profiles", body: <>Existing profiles in a table, with their bound wallet (if any).</> },
            { title: "Generate N profiles", body: <>Pick a count (1–500). Optionally constrain locale / OS distribution.</> },
            { title: "Bind to wallets", body: <>Either auto-bind one-to-one with a wallet set, or manually pair specific profiles with specific wallets.</> },
            { title: "(Optional) regenerate", body: <>Re-generate a profile if its parameters no longer suit you (e.g. needs a different timezone).</> },
          ]}
        />
      </DocSection>

      <DocSection id="reference" title="Field reference">
        <DocTable
          headers={["Field", "Type", "Notes"]}
          rows={[
            [<DocCode key="n">count</DocCode>, "u32", "How many to generate. 1–500."],
            [<DocCode key="l">locale_filter[]</DocCode>, "string[]?", "ISO codes (e.g. en-US, ja-JP). Defaults to a global mix."],
            [<DocCode key="o">os_filter[]</DocCode>, "string[]?", "Subset of [windows, mac, linux, ios, android]."],
            [<DocCode key="b">auto_bind_wallet_ids[]</DocCode>, "string[]?", "If provided, one profile per wallet — count is derived."],
          ]}
        />
      </DocSection>

      <DocSection id="internals" title="Under the hood">
        <ul className="list-disc list-inside space-y-2 text-sm text-gray-300 leading-relaxed">
          <li>Each profile gets a deterministic seed. Name and avatar are derived from public name corpora; user-agent strings are sampled from recent browser/OS pairs.</li>
          <li>The binding is stored in <DocCode>wallet_profiles</DocCode> (wallet_id ↔ profile_id, 1-to-1).</li>
          <li>Features that consult the binding (Warmer, Volume Bot HTTP calls) read it at request time. If no binding exists, the request falls back to default headers.</li>
        </ul>
      </DocSection>

      <DocSection id="pitfalls" title="Pitfalls & errors">
        <DocTable
          headers={["Error", "Cause", "Fix"]}
          rows={[
            [<DocCode key="e1">Profile count exceeded</DocCode>, "Per-plan cap.", "Re-use existing profiles or upgrade the plan."],
            [<DocCode key="e2">Auto-bind partial</DocCode>, "Some wallets already had bindings.", "Unbind first, or use Auto-bind (overwrite) mode."],
          ]}
        />
      </DocSection>

      <DocCallout variant="info" title="Profiles are headers, not network identity">
        Profiles affect HTTP headers and UI fingerprint hints, not your IP
        address or geolocation. Pair with a residential proxy fleet (out of
        scope for Offivex) if you need real network diversity.
      </DocCallout>

      <DocSection id="related" title="Related">
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-300">
          <li><Link href="/docs/feature/wallet-warmer" className="text-offivex-purple-light underline">Wallet Warmer</Link> — actually uses these profiles per wallet.</li>
          <li><Link href="/docs/recipes" className="text-offivex-purple-light underline">Recipes → Anti-Detect Setup</Link>.</li>
        </ul>
      </DocSection>
    </DocLayout>
  );
}
