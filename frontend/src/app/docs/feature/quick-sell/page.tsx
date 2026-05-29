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
  { id: "active-token", label: "How the active token is chosen" },
  { id: "reference", label: "Field reference" },
  { id: "internals", label: "Under the hood" },
  { id: "pitfalls", label: "Pitfalls & errors" },
  { id: "related", label: "Related" },
];

export default function QuickSellDocsPage() {
  return (
    <DocLayout
      eyebrow="Feature reference"
      title="Quick-Sell Keybinds"
      intro="Two configurable single-key hotkeys to exit a token position in parallel across every wallet that holds it. Designed for pro launchers who can't afford the 8-15 second round-trip of the Manual Trade UI when the chart is moving in seconds. Default F4 = sell 100%, F5 = sell 50%."
      breadcrumbs={[
        { href: "/docs", label: "Documentation" },
        { href: "/docs#feature-reference", label: "Feature reference" },
      ]}
      prev={{ href: "/docs/feature/manual-trade", label: "Manual Trade" }}
      next={{ href: "/docs/feature/volume-bot", label: "Volume Bot" }}
      toc={TOC}
    >
      <DocSection id="what" title="What it does">
        <p className="text-gray-300 leading-relaxed">
          Press the configured key → the backend identifies every wallet that
          holds the active token, fans out parallel sells through Jupiter,
          and returns per-wallet signatures in one round-trip. No modal, no
          confirmation prompt — the key <em>is</em> the confirmation.
        </p>
        <p className="text-gray-300 leading-relaxed mt-3">
          The sidebar shows an always-visible HUD with the currently &ldquo;armed&rdquo;
          token, the active keys, and the slippage setting. You always know
          what F4 is going to do before you press it.
        </p>
        <DocCallout variant="warn" title="Fires immediately">
          There is no &ldquo;are you sure&rdquo; dialog. This is by design — the
          feature is for moments where 2 seconds of friction costs you 20%
          of the exit. If you want a confirmation step, use{" "}
          <Link href="/docs/feature/manual-trade" className="text-offivex-purple-light underline">Manual Trade</Link>{" "}
          instead.
        </DocCallout>
      </DocSection>

      <DocSection id="when" title="When to use it">
        <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-300">
          <li>
            <strong className="text-gray-100">Panic exit</strong> — the chart
            turned, you want out of every wallet now.
          </li>
          <li>
            <strong className="text-gray-100">Planned full take-profit</strong> —
            you decided pre-launch that at price X you exit completely; F4
            is faster than coordinating N Manual Trades.
          </li>
          <li>
            <strong className="text-gray-100">Half-out</strong> — F5 leaves
            you 50% of every wallet for upside while securing principal.
          </li>
          <li>
            <strong className="text-gray-100">Multi-wallet dev sell</strong> —
            single-key replacement for the manual recipe with N Manual
            Trades staggered.
          </li>
        </ul>
      </DocSection>

      <DocSection id="prereq" title="Pre-requisites">
        <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-300">
          <li>Vault unlocked, valid API key, active plan.</li>
          <li>
            At least one wallet in the vault that holds the active token (the
            endpoint refuses with <DocCode>400 No wallets hold mint X</DocCode>{" "}
            otherwise).
          </li>
          <li>
            Each holding wallet needs a few thousand lamports for tx fees on
            top of the token balance.
          </li>
          <li>
            A working RPC (paid recommended — see{" "}
            <Link href="/docs/feature/settings" className="text-offivex-purple-light underline">
              Settings
            </Link>
            ). Public RPC will rate-limit you on multi-wallet sells.
          </li>
        </ul>
      </DocSection>

      <DocSection id="walkthrough" title="Walkthrough">
        <DocSteps
          steps={[
            {
              title: "Configure the keybinds (one-time setup)",
              body: (
                <>
                  Open <DocCode>/settings</DocCode>. The first card is
                  &ldquo;Quick-sell keybinds&rdquo;. Defaults are F4 (sell 100%)
                  and F5 (sell 50%). Click <strong>Record new key</strong> on
                  either slot, press the key you want, done. Slippage slider
                  defaults to 15% — bump to 25–50% for distressed exits.
                </>
              ),
            },
            {
              title: "Land on a page with the active token",
              body: (
                <>
                  After a launch via <DocCode>/bundle</DocCode>,{" "}
                  <DocCode>/mint</DocCode>, or <DocCode>/pump-fun</DocCode>,
                  the result modal automatically claims focus. On{" "}
                  <DocCode>/monitor</DocCode>, click the ☆ next to a
                  subscription to focus it. Otherwise the HUD falls back to
                  your most recently launched token.
                </>
              ),
            },
            {
              title: "Confirm the HUD shows the right token",
              body: (
                <>
                  Sidebar bottom shows <DocCode>Armed $SYMBOL · F4 100% · F5
                  50% · 15% slip</DocCode>. If it doesn&rsquo;t match your
                  intent, focus a different mint before pressing.
                </>
              ),
            },
            {
              title: "Press F4 (or F5)",
              body: (
                <>
                  Toast appears: <em>&ldquo;Selling 100% of $SYMBOL across
                  your wallets…&rdquo;</em>. Backend fans out balance lookups
                  + Jupiter swaps in parallel.
                </>
              ),
            },
            {
              title: "Read the result toast",
              body: (
                <>
                  Within typically 500–1500 ms (paid RPC):{" "}
                  <em>&ldquo;Sold 100% of $SYMBOL on 5/5 wallets in 820ms
                  (round-trip 950ms)&rdquo;</em>. Open the Network tab if you
                  want the per-wallet signatures — each is clickable on
                  Solscan.
                </>
              ),
            },
          ]}
        />
      </DocSection>

      <DocSection id="active-token" title="How the active token is chosen">
        <p className="text-gray-300 leading-relaxed">
          The HUD and the keybind dispatcher resolve the target mint with the
          following priority:
        </p>
        <DocTable
          headers={["Priority", "Source", "When it kicks in"]}
          rows={[
            [
              "1",
              <span key="ctx">
                Explicit <DocCode>LaunchContext.activeMint</DocCode>
              </span>,
              <span key="ctx-when">
                A page actively claims a focus: <DocCode>/monitor</DocCode>{" "}
                focused subscription (★), result modal on{" "}
                <DocCode>/mint</DocCode>, <DocCode>/bundle</DocCode>,{" "}
                <DocCode>/pump-fun</DocCode>.
              </span>,
            ],
            [
              "2",
              <span key="fallback">
                Most recent launched token (<DocCode>tokens.list[0]</DocCode>)
              </span>,
              "No explicit focus — you're on /referral, /wallets, /docs, etc. and just want to dump your most recent launch.",
            ],
            [
              "3",
              "None",
              <span key="empty">
                You&rsquo;ve never launched a token. HUD shows &ldquo;no active
                token&rdquo;, pressing F4 toasts a warning and does nothing.
              </span>,
            ],
          ]}
        />
        <DocCallout variant="tip" title="Always-visible HUD">
          Before you press the key, glance at the bottom of the sidebar. The
          purple-bordered pill is the source of truth. If it says &ldquo;Armed
          $BLOB&rdquo;, F4 sells $BLOB. If it says &ldquo;(latest)&rdquo;, no
          page has explicitly claimed focus — you&rsquo;re falling back to
          your most recent token.
        </DocCallout>
      </DocSection>

      <DocSection id="reference" title="Field reference">
        <DocTable
          headers={["Setting", "Default", "Range", "Notes"]}
          rows={[
            [<DocCode key="a">Sell 100% key</DocCode>, "F4", "Any single key", "Stored as event.code (layout-agnostic). Reserved keys (Tab/Space/Enter/Arrows/Backspace/Delete/Escape) cannot be bound."],
            [<DocCode key="b">Sell 50% key</DocCode>, "F5", "Any single key", "Same rules. Cannot collide with the 100% key."],
            [<DocCode key="c">Slippage</DocCode>, "1500 bps (15%)", "10–5000 bps (0.1–50%)", "Applied to every per-wallet swap. Bump to 25–50% for memecoin exits in thin pools."],
          ]}
        />
        <DocCallout variant="info" title="Why F4/F5 by default">
          Function keys collide with nothing in Phantom, Solflare, Backpack,
          Birdeye, Solscan, or any browser. Single letters (T, S, A) and
          symbol keys ($, /, ;) are available too — pick whatever fits your
          muscle memory. <DocCode>$</DocCode> works (it&rsquo;s Shift+4 →
          binds to <DocCode>Digit4</DocCode>, and the listener doesn&rsquo;t
          require Shift to be held when firing).
        </DocCallout>
      </DocSection>

      <DocSection id="internals" title="Under the hood">
        <p className="text-sm text-gray-300 leading-relaxed">
          One <DocCode>POST /api/v1/trading/quick-sell</DocCode> call
          orchestrates the full exit:
        </p>
        <ol className="list-decimal list-inside mt-3 space-y-1.5 text-sm text-gray-300">
          <li>Validate mint, percent (1–100), slippage (1–5000 bps).</li>
          <li>Verify vault is unlocked (MEK present in RAM).</li>
          <li>
            <strong>Phase 1 (parallel):</strong>{" "}
            <DocCode>WalletRepo::list_all</DocCode>, then{" "}
            <DocCode>futures_util::future::join_all</DocCode> over per-wallet{" "}
            <DocCode>getBalance + getTokenAccountsByOwner</DocCode>. Filter to
            wallets where this mint&rsquo;s amount &gt; 0.
          </li>
          <li>
            <strong>Phase 2 (parallel):</strong> for each holder, decrypt
            keypair (AES-GCM with the in-RAM MEK), fetch Jupiter quote,
            submit swap tx via the shared RPC client. Each leg runs as an
            independent <DocCode>async</DocCode> block — a failed leg never
            blocks the others.
          </li>
          <li>
            Single audit row written with the full per-wallet detail. Single
            atomic <DocCode>add_swap(N) / add_swap_error(N)</DocCode> for
            metrics.
          </li>
          <li>
            Return <DocCode>QuickSellResponse {`{ successful, failed, elapsed_ms, results[] }`}</DocCode>.
            Returned at <em>submit</em> time, not at on-chain confirmation —
            check Solscan if you want the latter.
          </li>
        </ol>

        <DocCodeBlock lang="response example">{`{
  "success": true,
  "data": {
    "mint": "DezX…",
    "percent": 100,
    "total_wallets": 5,
    "successful": 5,
    "failed": 0,
    "elapsed_ms": 820,
    "results": [
      { "wallet_id": "w1", "public_key": "7m4t…", "token_amount": 1500000,
        "signature": "5JZ…", "error": null },
      ...
    ]
  }
}`}</DocCodeBlock>

        <h3 className="text-base font-semibold text-gray-100 mt-6 mb-2">
          Latency expectations
        </h3>
        <DocTable
          headers={["Setup", "1 user, 5 wallets", "15 users simultaneous"]}
          rows={[
            ["Helius paid + Jupiter paid", "~500–800 ms", "p50 ~800 ms, p95 ~1500 ms"],
            ["Helius free + Jupiter free", "~900–1500 ms", "p50 ~1200 ms, p95 ~3500 ms (5–15% legs retry)"],
            ["Public RPC + Jupiter free", "3000–8000 ms (frequent 429)", "Avoid — 30–50% leg failures"],
          ]}
        />
        <p className="text-xs text-gray-500 mt-2">
          The reported <DocCode>elapsed_ms</DocCode> is backend-side work
          only; the toast adds round-trip latency for the full wall-clock the
          user feels (typically +50–150 ms over a domain, &lt; 10 ms on
          localhost).
        </p>
      </DocSection>

      <DocSection id="pitfalls" title="Pitfalls & errors">
        <DocTable
          headers={["Symptom / error", "Cause", "Fix"]}
          rows={[
            [
              <DocCode key="e1">No active token — launch one or open /monitor first</DocCode>,
              "HUD couldn't resolve any mint: no LaunchContext, no tokens.list[0].",
              "Launch a token, or visit /monitor and focus a subscription with the ☆ button.",
            ],
            [
              <DocCode key="e2">400 No wallets hold mint X</DocCode>,
              "None of your wallets have a balance &gt; 0 for the target mint.",
              "Verify on Solscan that you actually hold the token; some launches keep the dev supply on a wallet you forgot was external.",
            ],
            [
              <DocCode key="e3">Partial: 3/5 sold, 2 failed</DocCode>,
              "Per-wallet best-effort: 2 legs hit Jupiter slippage or RPC 429.",
              "Press F4 again — the 2 failed wallets still hold their position, the 3 that succeeded are already at 0 balance and skip on retry.",
            ],
            [
              <>F4 fires while typing in a field</>,
              "Browser focus drifted to a non-input focusable element — listener can't always detect.",
              "We block firing inside INPUT/TEXTAREA/SELECT/contenteditable. If you keep hitting it, remap to a function key (F4/F5) which never collides with typing.",
            ],
            [
              <>F4 doesn&rsquo;t fire at all</>,
              "Vault locked, or a modal/dialog is open (we suppress to avoid double-actions), or the key is held with Ctrl/Cmd/Alt (filtered).",
              "Unlock the vault, close any open modal, press the key without modifiers.",
            ],
            [
              <DocCode key="e4">Tab is reserved — pick another key</DocCode>,
              "You tried to bind to a reserved key during recording.",
              "Reserved: Tab, Space, Enter, Backspace, Delete, Arrow keys, Escape. Pick any other single key.",
            ],
            [
              <>HUD shows &ldquo;(latest)&rdquo; but I&rsquo;m on /monitor</>,
              "Monitor has no focused subscription yet, or your focused mint was unsubscribed.",
              "Click ☆ on the subscription you want to target. The HUD will switch from &ldquo;(latest)&rdquo; to &ldquo;Armed $SYMBOL&rdquo; with no qualifier.",
            ],
          ]}
        />
      </DocSection>

      <DocSection id="related" title="Related">
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-300">
          <li>
            <Link href="/docs/feature/manual-trade" className="text-offivex-purple-light underline">Manual Trade</Link>{" "}
            — the modal-driven alternative when you want explicit control over wallet, amount, and slippage per swap.
          </li>
          <li>
            <Link href="/docs/feature/settings" className="text-offivex-purple-light underline">Settings</Link>{" "}
            — change the keybinds and slippage default.
          </li>
          <li>
            <Link href="/docs/feature/monitor" className="text-offivex-purple-light underline">Monitor</Link>{" "}
            — the page where you focus a mint with ☆ to arm the keybind on it.
          </li>
          <li>
            <Link href="/docs/recipes#multi-wallet-sell" className="text-offivex-purple-light underline">Recipes → Multi-Wallet Dev Sell</Link>{" "}
            — quick-sell is the single-key version of this recipe.
          </li>
        </ul>
      </DocSection>
    </DocLayout>
  );
}
