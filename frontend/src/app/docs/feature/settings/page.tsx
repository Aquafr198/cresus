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
  { id: "rpc", label: "RPC endpoints" },
  { id: "fees", label: "Fees & limits" },
  { id: "keybinds", label: "Quick-sell keybinds" },
  { id: "external", label: "External APIs" },
  { id: "env", label: "Env file reference" },
  { id: "pitfalls", label: "Pitfalls & errors" },
  { id: "related", label: "Related" },
];

export default function SettingsDocsPage() {
  return (
    <DocLayout
      eyebrow="Feature reference"
      title="Settings"
      intro="Where you point the backend at RPCs, set priority-fee defaults, and plug in third-party API keys (Pinata, Birdeye, Telegram). Many settings live in the .env file too — the UI is a superset that writes through."
      breadcrumbs={[
        { href: "/docs", label: "Documentation" },
        { href: "/docs#feature-reference", label: "Feature reference" },
      ]}
      prev={{ href: "/docs/feature/referral", label: "Referral" }}
      next={{ href: "/docs/feature/billing", label: "Billing" }}
      toc={TOC}
    >
      <DocSection id="what" title="What it does">
        <p className="text-gray-300 leading-relaxed">
          <DocCode>/settings</DocCode> exposes the runtime knobs that every
          other feature reads: which RPC to use, how big a priority fee to
          attach, which third-party APIs are configured. Changes apply
          immediately (no restart) for most fields.
        </p>
      </DocSection>

      <DocSection id="when" title="When to use it">
        <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-300">
          <li>First-time setup after install.</li>
          <li>Migrating from public RPC to a paid provider before a real launch.</li>
          <li>Adding Pinata JWT or Birdeye key.</li>
          <li>Tuning priority fees up during a congested block.</li>
        </ul>
      </DocSection>

      <DocSection id="rpc" title="RPC endpoints">
        <p className="text-sm text-gray-300 leading-relaxed">
          You can configure multiple endpoints. The backend picks the
          fastest-healthy one per request and falls over automatically on
          5xx / timeouts.
        </p>
        <DocSteps
          steps={[
            { title: "Add a new endpoint", body: <>Click Add. Paste the HTTPS URL. Pick mainnet or devnet.</> },
            { title: "Test it", body: <>Click Test — the backend issues a <DocCode>getSlot</DocCode> and reports the latency. &lt; 200 ms is good; &gt; 800 ms means the endpoint is in a far region or under load.</> },
            { title: "Mark default", body: <>One endpoint per cluster is the default. Others act as failover.</> },
            { title: "Remove an endpoint", body: <>Delete. Active subscriptions on it migrate to the next-best healthy endpoint.</> },
          ]}
        />
        <DocCallout variant="warn" title="Public RPC is for tests only">
          <DocCode>api.mainnet-beta.solana.com</DocCode> and{" "}
          <DocCode>api.devnet.solana.com</DocCode> are heavily rate-limited.
          They&rsquo;ll work for hello-world; they&rsquo;ll fail under launch
          load. Use Helius, QuickNode, Triton, or Alchemy for anything real.
        </DocCallout>
      </DocSection>

      <DocSection id="fees" title="Fees & limits">
        <DocTable
          headers={["Field", "Default", "Notes"]}
          rows={[
            [<DocCode key="p">priority_fee_micro_lamports</DocCode>, "50 000", "Applied to most txs via ComputeBudget."],
            [<DocCode key="s">default_slippage_bps</DocCode>, "500 (5%)", "Used by Manual Trade and bots when unspecified."],
            [<DocCode key="j">jito_tip_lamports</DocCode>, "10 000", "Default tip when bundling. Override per-bundle."],
            [<DocCode key="rt">rpc_timeout_seconds</DocCode>, "30", "Per-request timeout for the active RPC."],
            [<DocCode key="r">max_swap_retries</DocCode>, "3", "Retries when a swap simulation fails non-fatally."],
          ]}
        />
      </DocSection>

      <DocSection id="keybinds" title="Quick-sell keybinds">
        <p className="text-sm text-gray-300 leading-relaxed">
          Two single-key shortcuts to exit a token position across every
          wallet that holds it. Defaults are <DocCode>F4</DocCode> (sell 100%)
          and <DocCode>F5</DocCode> (sell 50%). Configured at the top of{" "}
          <DocCode>/settings</DocCode>, persisted per device in localStorage.
        </p>
        <DocTable
          headers={["Setting", "Default", "Notes"]}
          rows={[
            [<DocCode key="a">Sell 100% key</DocCode>, "F4", "Any single key. Reserved keys rejected (Tab/Space/Enter/Arrows/Backspace/Delete/Escape)."],
            [<DocCode key="b">Sell 50% key</DocCode>, "F5", "Same rules. Cannot collide with the 100% key."],
            [<DocCode key="c">Slippage</DocCode>, "15% (1500 bps)", "Slider goes 0.1–50%. Memecoin exits often need 25–50%."],
          ]}
        />
        <DocCallout variant="info" title="Read the dedicated page">
          The full walkthrough — how the active token is chosen, latency
          expectations, error catalogue — lives at{" "}
          <Link href="/docs/feature/quick-sell" className="text-offivex-purple-light underline">
            /docs/feature/quick-sell
          </Link>
          . The Settings page is just where you configure it.
        </DocCallout>
        <DocCallout variant="tip" title="Stream-ready">
          The sidebar also has a <strong>Privacy</strong> toggle (eye icon,
          right above &ldquo;Lock App&rdquo;) that blurs every sensitive
          value on screen for stream / screen-share / recording.{" "}
          <Link href="/docs/feature/privacy-mode" className="text-offivex-purple-light underline">
            See Privacy Mode →
          </Link>
        </DocCallout>
      </DocSection>

      <DocSection id="external" title="External APIs">
        <DocTable
          headers={["Key", "Used by", "Where to get"]}
          rows={[
            [<DocCode key="pj">PINATA_JWT</DocCode>, "Mint, Pump.fun, Meme Library", "https://app.pinata.cloud/ → API Keys → JWT"],
            [<DocCode key="bk">BIRDEYE_API_KEY</DocCode>, "Bumper Bot, Volume Bot (price feed)", "https://birdeye.so/ → Developers"],
            [<DocCode key="tb">OFFIVEX_TELEGRAM_BOT_TOKEN</DocCode>, "Telegram launch notifications", "@BotFather on Telegram"],
            [<DocCode key="tc">OFFIVEX_TELEGRAM_CHAT_ID</DocCode>, "Telegram launch notifications", "Forward a message to @JsonDumpBot"],
          ]}
        />
      </DocSection>

      <DocSection id="env" title="Env file reference">
        <p className="text-sm text-gray-300 leading-relaxed">
          The UI is the easy path. For deploys or bulk changes, edit{" "}
          <DocCode>.env</DocCode> directly. Sample:
        </p>
        <DocCodeBlock lang=".env">{`OFFIVEX_HOST=127.0.0.1
OFFIVEX_PORT=3001
OFFIVEX_SOLANA_CLUSTER=mainnet
SOLANA_RPC_MAINNET=https://your-helius-or-quicknode-url
OFFIVEX_CORS_ORIGINS=https://launch.yourdomain.com
OFFIVEX_TREASURY_SEED_PHRASE="<set via your secrets manager>"
OFFIVEX_PRIORITY_FEE_MICRO_LAMPORTS=50000
JITO_TIP_LAMPORTS=10000
PINATA_JWT=...
BIRDEYE_API_KEY=...`}</DocCodeBlock>
        <p className="text-sm text-gray-400 mt-3 leading-relaxed">
          The backend reads <DocCode>.env</DocCode> at boot. Restart the
          backend after editing.
        </p>
      </DocSection>

      <DocSection id="pitfalls" title="Pitfalls & errors">
        <DocTable
          headers={["Symptom", "Cause", "Fix"]}
          rows={[
            [<>All RPCs marked unhealthy</>, "Network down or every endpoint is rate-limited.", "Add a paid endpoint and re-test."],
            [<>Pinata 401 errors</>, "JWT expired or revoked.", "Regenerate in Pinata UI, update Settings."],
            [<>Birdeye not used by bots</>, "Key empty.", "Add the key and restart the bot (price source is read at bot start)."],
            [<>CORS error in browser</>, "Frontend URL not in <DocCode>OFFIVEX_CORS_ORIGINS</DocCode>.", "Add the exact origin (scheme + host + port), restart backend."],
          ]}
        />
      </DocSection>

      <DocSection id="related" title="Related">
        <ul className="list-disc list-inside space-y-1 text-sm text-gray-300">
          <li><Link href="/docs/feature/security" className="text-offivex-purple-light underline">Security</Link> — master password and seed phrase management.</li>
          <li><Link href="/docs/quick-start" className="text-offivex-purple-light underline">Quick start</Link> — minimum settings to get to a working launch.</li>
        </ul>
      </DocSection>
    </DocLayout>
  );
}
