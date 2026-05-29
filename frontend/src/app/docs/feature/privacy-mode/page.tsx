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
  { id: "walkthrough", label: "Walkthrough" },
  { id: "covered", label: "What's masked / not masked" },
  { id: "internals", label: "Under the hood" },
  { id: "pitfalls", label: "Pitfalls" },
  { id: "related", label: "Related" },
];

export default function PrivacyModeDocsPage() {
  return (
    <DocLayout
      eyebrow="Feature reference"
      title="Privacy Mode"
      intro="One-click toggle in the sidebar that blurs every sensitive value on the screen — balances, percentages, holder addresses, activity amounts, bonding curve fill. Designed for launchers who need to stream, record, or screen-share their dashboard without leaking what their fleet actually holds."
      breadcrumbs={[
        { href: "/docs", label: "Documentation" },
        { href: "/docs#feature-reference", label: "Feature reference" },
      ]}
      prev={{ href: "/docs/feature/security", label: "Security" }}
      next={{ href: "/docs/feature/settings", label: "Settings" }}
      toc={TOC}
    >
      <DocSection id="what" title="What it does">
        <p className="text-gray-300 leading-relaxed">
          Privacy Mode is a global UI state. When you toggle it ON via the
          sidebar button (eye icon, just above &ldquo;Lock App&rdquo;), every
          element marked as sensitive across the app is blurred with{" "}
          <DocCode>filter: blur(8px)</DocCode> and made unselectable. The
          toggle is instant — no re-fetch, no full-page re-render.
        </p>
        <p className="text-gray-300 leading-relaxed mt-3">
          To briefly verify a value yourself, hover the mouse over it. After
          a <strong className="text-gray-100">1.5 s delay</strong> the blur
          fades and the value becomes readable. Move the mouse away → it
          re-blurs. The delay is deliberate — accidental cursor drift
          during a stream won&rsquo;t reveal anything.
        </p>
      </DocSection>

      <DocSection id="when" title="When to use it">
        <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-300">
          <li>
            <strong className="text-gray-100">Live stream / Twitch / YouTube</strong>{" "}
            — broadcasting your launch live without showing wallet sizes.
          </li>
          <li>
            <strong className="text-gray-100">Screen-share calls</strong>{" "}
            (Discord, Telegram, Zoom) — quickly demoing the platform to a
            partner without exposing actual numbers.
          </li>
          <li>
            <strong className="text-gray-100">Recording tutorials</strong>{" "}
            — every value blurred = the recording is portfolio-safe even if
            shared later.
          </li>
          <li>
            <strong className="text-gray-100">Public Wi-Fi / café</strong>{" "}
            — someone glancing at your screen can&rsquo;t read the balances.
          </li>
          <li>
            <strong className="text-gray-100">Screenshots</strong> for social
            posts (&ldquo;just launched X, here&rsquo;s the dashboard&rdquo;)
            — proves you have the platform without revealing what you hold.
          </li>
        </ul>
      </DocSection>

      <DocSection id="walkthrough" title="Walkthrough">
        <DocSteps
          steps={[
            {
              title: "Toggle ON",
              body: (
                <>
                  In the sidebar, look at the row above &ldquo;Lock App&rdquo;.
                  Click the button labelled <strong>Privacy</strong> (eye
                  icon). It turns purple and renames to{" "}
                  <strong>Privacy ON</strong>. Every sensitive value on the
                  current page blurs immediately.
                </>
              ),
            },
            {
              title: "Stream or share",
              body: (
                <>
                  Open OBS / Zoom / Discord screen share. Capture your
                  browser window. Balances, holder addresses, activity
                  amounts, percent-of-supply, bonding curve fill are all
                  illegible. Token symbol ($SYMBOL), wallet labels
                  (&ldquo;dev&rdquo;), task statuses, navigation remain
                  fully visible — those are public/brand-level info.
                </>
              ),
            },
            {
              title: "Hover-to-reveal (1.5s)",
              body: (
                <>
                  Need to verify a balance yourself without ending the
                  stream? Hover the mouse over the blurred number. After
                  1.5 s it fades in. Move the mouse away → it re-blurs.
                  Tip: pause your stream / hide the window before hovering
                  if anyone is watching.
                </>
              ),
            },
            {
              title: "Toggle OFF",
              body: (
                <>
                  Click <strong>Privacy ON</strong> again. Mode disengages,
                  values become readable normally. The state is per-device,
                  persisted in localStorage — closing the tab and reopening
                  it keeps your last choice.
                </>
              ),
            },
          ]}
        />
      </DocSection>

      <DocSection id="covered" title="What's masked / not masked">
        <DocTable
          headers={["Element", "When privacy ON"]}
          rows={[
            ["Wallet SOL / token balances", "Blurred"],
            ["Public keys (full + shortened)", "Blurred"],
            ["Holder rows in launch dashboard (balance + % supply)", "Blurred"],
            ["Activity feed amounts (SOL per event)", "Blurred"],
            ["Activity feed wallet (shortened address)", "Blurred"],
            ["Bonding curve fill % + SOL in curve", "Blurred"],
            ["Token supply (raw number)", "Blurred"],
            [
              "Token symbol ($SYMBOL)",
              <span key="vis">Visible — it&rsquo;s the brand</span>,
            ],
            [
              "Mint address (the launched token's contract)",
              <span key="vis2">Visible — it&rsquo;s the public address you share</span>,
            ],
            ["Wallet local labels (dev, snipe-1, etc.)", "Visible — UI hints"],
            ["Bot status (Running / Stopped)", "Visible"],
            ["Counts (N holders, M bots, K events)", "Visible"],
            ["Navigation, headers, page titles", "Visible"],
          ]}
        />
      </DocSection>

      <DocSection id="internals" title="Under the hood">
        <ul className="list-disc list-inside space-y-2 text-sm text-gray-300 leading-relaxed">
          <li>
            <strong>CSS-driven, zero React re-render.</strong> The toggle
            sets <DocCode>data-privacy-mode=&quot;on&quot;</DocCode> on{" "}
            <DocCode>&lt;body&gt;</DocCode>. A single CSS rule in{" "}
            <DocCode>globals.css</DocCode> matches that attribute against{" "}
            <DocCode>[data-sensitive=&quot;true&quot;]</DocCode> descendants
            and applies the blur. Toggling is O(1) on a single attribute
            write — no React tree walk.
          </li>
          <li>
            <strong>Marking pattern.</strong> Components that render
            sensitive values wrap them in{" "}
            <DocCode>&lt;Sensitive&gt;...&lt;/Sensitive&gt;</DocCode>, which
            renders a span with the data attribute. Adding a new sensitive
            field anywhere in the app is one import + one wrapper.
          </li>
          <li>
            <strong>Hover-to-reveal</strong> is pure CSS too:{" "}
            <DocCode>:hover</DocCode> with a 1.5 s{" "}
            <DocCode>transition-delay</DocCode>. No JS involved.
          </li>
          <li>
            <strong>Locked variants.</strong> Some elements never reveal on
            hover (seed phrase, private keys) — they get{" "}
            <DocCode>data-locked=&quot;true&quot;</DocCode> which the CSS
            rule excludes from the hover-reveal selector.
          </li>
          <li>
            <strong>State persistence.</strong> Per-device localStorage key{" "}
            <DocCode>offivex.privacy-mode.v1</DocCode>. Streamers who
            engage privacy on their desktop don&rsquo;t automatically have
            it on when they log in from their phone.
          </li>
        </ul>
      </DocSection>

      <DocSection id="pitfalls" title="Pitfalls">
        <DocTable
          headers={["Trap", "What to do"]}
          rows={[
            [
              "Hovering accidentally reveals a value mid-stream",
              "Pause your stream / scene-switch BEFORE moving the cursor to a blurred element. The 1.5 s delay is short — assume it WILL reveal if you hover that long.",
            ],
            [
              "Forgetting to enable privacy before going live",
              <span key="t2">
                Make a habit of clicking the sidebar Privacy toggle as the{" "}
                <em>first</em> action when opening OBS. The purple{" "}
                <strong>Privacy ON</strong> state is visible at a glance.
              </span>,
            ],
            [
              "Selecting (highlighting) a value with the cursor",
              <span key="t3">
                Privacy mode also sets{" "}
                <DocCode>user-select: none</DocCode> on sensitive elements,
                so accidentally double-clicking won&rsquo;t reveal a
                copy-pasteable value. But if a viewer can record at high
                framerate, an instantaneous hover-reveal could still capture
                a frame.
              </span>,
            ],
            [
              "Browser zoom + blur looks different",
              "The blur radius is fixed in CSS px. Zooming the browser changes the visual blur effect — at 200% zoom blurring is less effective. Stream at native zoom for best results.",
            ],
            [
              "Reload doesn't help an active stream",
              "Toggle is per-device, persisted in localStorage. If you reload mid-stream, the previous setting comes back instantly — you don't have to re-enable.",
            ],
          ]}
        />
        <DocCallout variant="warn" title="Privacy ≠ security">
          Privacy mode is a UI mask, not an access-control feature. Anyone
          with physical access to your unlocked vault can still spend the
          wallets. For sensitive operations always combine privacy mode
          with the auto-lock timer (see Security →{" "}
          <Link
            href="/docs/feature/security"
            className="text-offivex-purple-light underline"
          >
            /docs/feature/security
          </Link>
          ).
        </DocCallout>
      </DocSection>

      <DocSection id="related" title="Related">
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-300">
          <li>
            <Link
              href="/docs/feature/security"
              className="text-offivex-purple-light underline"
            >
              Security
            </Link>{" "}
            — master password, auto-lock, seed phrase. Privacy mode is the
            cosmetic counterpart to these crypto controls.
          </li>
          <li>
            <Link
              href="/docs/feature/settings"
              className="text-offivex-purple-light underline"
            >
              Settings
            </Link>{" "}
            — full Settings panel walkthrough.
          </li>
          <li>
            <Link
              href="/docs/recipes#anti-detect"
              className="text-offivex-purple-light underline"
            >
              Recipes → Anti-detect setup
            </Link>{" "}
            — stream-safe operational hygiene.
          </li>
        </ul>
      </DocSection>
    </DocLayout>
  );
}
