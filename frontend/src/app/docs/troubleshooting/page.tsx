"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  DocLayout,
  DocSection,
  DocCode,
} from "../_components/DocLayout";
import { DocCallout } from "../_components/DocCallout";

const TOC = [
  { id: "auth", label: "Auth & unlock" },
  { id: "plan", label: "Plan & billing" },
  { id: "rpc", label: "Solana / RPC" },
  { id: "bundle", label: "Bundle / Jito" },
  { id: "mint", label: "Mint / metadata" },
  { id: "bots", label: "Trading bots" },
  { id: "ws", label: "Monitor / WebSocket" },
  { id: "ipfs", label: "IPFS / Pinata" },
  { id: "recovery", label: "Recovery & seed" },
  { id: "keybind", label: "Quick-sell keybinds" },
];

interface Entry {
  group: string;
  title: string;
  cause: string;
  fix: React.ReactNode;
}

const ENTRIES: Entry[] = [
  // Auth
  {
    group: "auth",
    title: 'Missing "Authorization: Bearer" header',
    cause: "API key not present in localStorage — fresh tab, cleared cache, or never logged in on this device.",
    fix: (
      <>
        Open <DocCode>/login</DocCode>, paste your API key, submit. If the key
        was lost, ask your admin to rotate it.
      </>
    ),
  },
  {
    group: "auth",
    title: "403 vault_locked",
    cause: "Auto-lock timer fired (default 1 h of inactivity) or you locked manually.",
    fix: (
      <>
        Click the lock badge in the header, enter your master password.
        Adjust <DocCode>SESSION_TIMEOUT_SECONDS</DocCode> in Settings if 1 h
        is too aggressive for your workflow.
      </>
    ),
  },
  {
    group: "auth",
    title: "Wrong password — vault still locked after submit",
    cause: "Typo, caps lock, or password rotated by admin.",
    fix: (
      <>
        Try with caps lock off. If you&rsquo;ve genuinely forgotten,{" "}
        <Link href="/docs/feature/security" className="text-offivex-purple-light underline">restore from seed phrase</Link>{" "}
        — that&rsquo;s the only path.
      </>
    ),
  },
  {
    group: "auth",
    title: 'API returns 401 even though I just logged in',
    cause: "Browser blocked the Authorization header, or the tab still holds an older fetch wrapper.",
    fix: "Hard refresh (Ctrl-Shift-R). If it persists, log out and back in.",
  },

  // Plan
  {
    group: "plan",
    title: "402 plan_inactive",
    cause: "Your plan expired or was never activated after payment.",
    fix: (
      <>
        Open <Link href="/docs/feature/billing" className="text-offivex-purple-light underline">/billing</Link>,
        check expiry. If you paid and it didn&rsquo;t auto-activate, contact
        admin with the payment signature.
      </>
    ),
  },
  {
    group: "plan",
    title: 'Quota exceeded: too many monitor subscriptions',
    cause: "Plan tier caps concurrent subs.",
    fix: <>Unsubscribe an idle mint on <DocCode>/monitor</DocCode>, or upgrade.</>,
  },

  // RPC
  {
    group: "rpc",
    title: '"BlockhashNotFound" / "Transaction was not confirmed"',
    cause: "RPC is behind, or the tx sat in the mempool until its blockhash expired (~150 slots).",
    fix: (
      <>
        Retry. If it persists, your RPC is unhealthy — switch in{" "}
        <Link href="/docs/feature/settings" className="text-offivex-purple-light underline">Settings</Link>.
      </>
    ),
  },
  {
    group: "rpc",
    title: 'Transaction simulation failed: "insufficient funds for transaction"',
    cause: "Wallet doesn&rsquo;t have enough lamports for the tx itself (separate from amounts you&rsquo;re sending).",
    fix: "Top up the wallet with a few thousand lamports of buffer (rule of thumb: keep 0.005 SOL minimum).",
  },
  {
    group: "rpc",
    title: '"Custom program error: 0x1"',
    cause: "AMM-side slippage exceeded.",
    fix: "Raise slippage_bps in the screen you launched from. Memecoin launches often need 1500–3000.",
  },
  {
    group: "rpc",
    title: "RPC returns 429 / rate-limited",
    cause: "You&rsquo;re on public RPC and exceeded its allowance.",
    fix: (
      <>
        Switch to a paid endpoint (Helius / QuickNode / Triton). Public RPC
        is for tests only.
      </>
    ),
  },
  {
    group: "rpc",
    title: "All configured RPCs marked unhealthy",
    cause: "Network outage, or every endpoint is rate-limited simultaneously.",
    fix: (
      <>
        Add a fresh endpoint in <Link href="/docs/feature/settings" className="text-offivex-purple-light underline">Settings</Link> and re-test.
      </>
    ),
  },

  // Bundle / Jito
  {
    group: "bundle",
    title: '"Bundle dropped" (Jito)',
    cause: "Tip too low — you were outbid in the auction for that slot.",
    fix: "Bump tip_lamports to 100k–250k for competitive launches and re-submit. State is unchanged.",
  },
  {
    group: "bundle",
    title: '"Bundle simulation failed"',
    cause: "Usually a snipe wallet has insufficient SOL, or slippage is too tight on a snipe.",
    fix: "Verify each snipe wallet balance ≥ spend + 0.01 SOL buffer. Raise snipe slippage.",
  },
  {
    group: "bundle",
    title: "Bundle landed but transaction N failed",
    cause: "Edge case: per-tx slippage on a snipe ordered late, because earlier snipes moved the price.",
    fix: "Increase slippage on the last snipes in the bundle order (or randomize order).",
  },
  {
    group: "bundle",
    title: '"Cluster mismatch — Jito not available"',
    cause: "Trying to bundle on devnet.",
    fix: "Jito only exists on mainnet. Switch cluster.",
  },

  // Mint
  {
    group: "mint",
    title: "Metaplex create_metadata failed",
    cause: "Mint authority mismatch (rare — usually a stale tx or wallet changed between mint and metadata).",
    fix: "Retry from /mint — the page handles mint + metadata in one batch so this shouldn&rsquo;t recur.",
  },
  {
    group: "mint",
    title: "Phantom shows no image after mint",
    cause: "IPFS gateway cold cache or Phantom&rsquo;s own gateway is rate-limited.",
    fix: "Wait 1–5 minutes. Solscan typically renders sooner — verify the metadata there first.",
  },
  {
    group: "mint",
    title: "Vanity grind taking forever",
    cause: "Suffix is 5+ chars (each extra char is roughly 58× more compute).",
    fix: "Reduce to 3–4 chars. 4 chars grinds in seconds on a workstation.",
  },

  // Bots
  {
    group: "bots",
    title: "Bot stopped after N cycles with no message",
    cause: "A leg failed (slippage / RPC). The bot stops by design rather than retry forever.",
    fix: "Open the bot row, read the error. Bump slippage, click Resume.",
  },
  {
    group: "bots",
    title: "Volume Bot drains wallets",
    cause: "Spread + fees > net buy proceeds returning after sells.",
    fix: "Lower max_buy_sol, lower density, or accept that this is the cost of activity.",
  },
  {
    group: "bots",
    title: "Bumper Bot fires constantly",
    cause: "Floor set above the natural price; the bot defends an impossible level.",
    fix: "Lower floor_price, or stop the bot — you&rsquo;ll burn ammo without effect.",
  },

  // WS / Monitor
  {
    group: "ws",
    title: "Monitor disconnected (WS code 1006)",
    cause: "Network blip, dev HMR, or the browser put the tab to sleep.",
    fix: "Auto-reconnects. No action needed.",
  },
  {
    group: "ws",
    title: "Cannot subscribe — quota exceeded",
    cause: "Plan tier caps concurrent subscriptions.",
    fix: "Unsubscribe an idle mint or upgrade the plan.",
  },
  {
    group: "ws",
    title: "No events visible after subscribing",
    cause: "Pool not yet created, RPC sub propagating, or no on-chain activity yet.",
    fix: "Check Solscan to confirm there&rsquo;s actually activity. If yes and Monitor is silent, refresh the page to re-open the WS.",
  },

  // IPFS
  {
    group: "ipfs",
    title: 'IPFS pin failed (Pinata 401)',
    cause: "PINATA_JWT missing, expired, or revoked.",
    fix: (
      <>
        Regenerate in Pinata UI, paste into{" "}
        <Link href="/docs/feature/settings" className="text-offivex-purple-light underline">Settings</Link>.
      </>
    ),
  },
  {
    group: "ipfs",
    title: 'IPFS pin failed (file too large)',
    cause: "Source file > 10 MB (or > 4 MB for Pump.fun).",
    fix: "Compress with TinyPNG or Squoosh to ~1 MB.",
  },
  {
    group: "ipfs",
    title: 'Image renders broken on third-party explorer',
    cause: "CID still propagating across the public IPFS DHT.",
    fix: "Wait 1–5 minutes. Try a different gateway (gateway.pinata.cloud vs ipfs.io) to confirm.",
  },

  // Recovery
  {
    group: "recovery",
    title: "Forgot master password",
    cause: "Self-explanatory.",
    fix: (
      <>
        Use the &ldquo;Restore from seed phrase&rdquo; flow on{" "}
        <DocCode>/login</DocCode>. Provide your seed, set a new password. All
        wallets re-derive at the same addresses.
      </>
    ),
  },
  {
    group: "recovery",
    title: "Restore says &ldquo;wipe old wallets?&rdquo; — what does it mean?",
    cause: "Restoring from seed will re-derive every wallet. If your DB also contains wallets that aren&rsquo;t derived from this seed, they would be orphaned.",
    fix: 'Tick "wipe old wallets" only if you&rsquo;re sure those orphans are not yours. If unsure, back up the DB file first, then tick.',
  },
  {
    group: "recovery",
    title: "Vault locks between every action",
    cause: "Session timeout set very low (seconds), or system clock skew.",
    fix: (
      <>
        Set <DocCode>SESSION_TIMEOUT_SECONDS</DocCode> to something sane (3600
        = 1 h is the default). Verify your system clock is accurate.
      </>
    ),
  },

  // Quick-sell keybinds
  {
    group: "keybind",
    title: "F4 (or your bound key) does nothing",
    cause:
      "Vault locked, a modal is open (we suppress firing to avoid double-actions), focus is in an INPUT/TEXTAREA, or a modifier key (Ctrl/Cmd/Alt) is held.",
    fix: (
      <>
        Unlock the vault, close any open modal, click on the page background
        to drop focus, press the key without modifiers. If the HUD says
        &ldquo;no active token&rdquo;, launch one or focus a mint on{" "}
        <Link href="/docs/feature/monitor" className="text-offivex-purple-light underline">/monitor</Link>.
      </>
    ),
  },
  {
    group: "keybind",
    title: 'Toast: "No active token — launch one or open /monitor first"',
    cause:
      "Both resolution paths failed: no LaunchContext claimed, no entry in tokens.list.",
    fix: (
      <>
        Either launch a token (Mint / Bundle / Pump.fun) — the result modal
        claims focus automatically — or open <DocCode>/monitor</DocCode> and
        click ☆ on a subscribed mint.
      </>
    ),
  },
  {
    group: "keybind",
    title: 'Toast: "Partial: 3/5 sold, 2 failed"',
    cause:
      "Per-wallet best-effort: 2 sells hit Jupiter slippage or an RPC 429.",
    fix: (
      <>
        Press the key again — the 3 successful wallets are now at 0 balance
        and skip on retry; only the 2 failed wallets attempt again. If it
        keeps happening on the same wallets, raise the slippage in Settings
        or switch to a paid RPC.
      </>
    ),
  },
  {
    group: "keybind",
    title: "Sidebar HUD shows the wrong token",
    cause:
      "Multiple subscriptions on /monitor with the wrong one focused, or you launched a newer token after this one but the HUD shows the older one.",
    fix: (
      <>
        On <DocCode>/monitor</DocCode>, click ☆ on the correct subscription —
        the purple ring + HUD update immediately. Elsewhere, the HUD shows
        the most recent <DocCode>tokens.list[0]</DocCode>; if it&rsquo;s
        stale, hard-refresh the page to revalidate.
      </>
    ),
  },
  {
    group: "keybind",
    title: 'Recording: "X is reserved — pick another key"',
    cause:
      "You tried to bind to Tab, Space, Enter, Backspace, Delete, an Arrow key, or Escape during the key-recording dialog.",
    fix: "These are reserved because preventDefault on them breaks focus traversal, scroll, form submit, and browser navigation. Pick any other single key.",
  },
  {
    group: "keybind",
    title: "Toast info 'Selling…' appears but no follow-up toast",
    cause:
      "The backend call is genuinely still running (slow RPC or Jupiter throttle), or the request died silently (network drop).",
    fix: (
      <>
        Open DevTools Network → look for the{" "}
        <DocCode>POST /trading/quick-sell</DocCode> request. If still pending
        after 15 s, the upstream is the issue (paid RPC strongly recommended
        for production). If it 5xx&rsquo;d, you&rsquo;ll see the error toast
        with a delay.
      </>
    ),
  },
];

const GROUP_LABELS: Record<string, string> = {
  auth: "Auth & unlock",
  plan: "Plan & billing",
  rpc: "Solana / RPC",
  bundle: "Bundle / Jito",
  mint: "Mint / metadata",
  bots: "Trading bots",
  ws: "Monitor / WebSocket",
  ipfs: "IPFS / Pinata",
  recovery: "Recovery & seed",
  keybind: "Quick-sell keybinds",
};

export default function TroubleshootingPage() {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ENTRIES;
    return ENTRIES.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.cause.toLowerCase().includes(q),
    );
  }, [query]);

  const grouped = useMemo(() => {
    const out: Record<string, Entry[]> = {};
    for (const e of filtered) {
      if (!out[e.group]) out[e.group] = [];
      out[e.group].push(e);
    }
    return out;
  }, [filtered]);

  return (
    <DocLayout
      eyebrow="Troubleshooting"
      title="Errors you'll see, and how to fix them"
      intro="Every error message I've watched a user hit, with the cause in one sentence and the concrete next action. Searchable — type any keyword from the error to filter."
      breadcrumbs={[{ href: "/docs", label: "Documentation" }]}
      prev={{ href: "/docs/recipes", label: "Recipes" }}
      next={null}
      toc={TOC}
    >
      <div className="mb-8">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search errors — e.g. &quot;blockhash&quot;, &quot;tip too low&quot;, &quot;401&quot;…"
          className="w-full px-4 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-gray-200 placeholder:text-gray-500 focus:outline-none focus:border-offivex-purple/50"
        />
        <div className="mt-2 text-xs text-gray-500">
          {filtered.length} result{filtered.length === 1 ? "" : "s"}
        </div>
      </div>

      <DocCallout variant="info" title="Always check Solscan">
        For on-chain errors, your single most useful diagnostic is the
        transaction&rsquo;s Solscan page. The error in our UI is a summary;
        Solscan shows the full instruction trace and the exact program
        error code.
      </DocCallout>

      {Object.keys(GROUP_LABELS).map((group) => {
        const entries = grouped[group];
        if (!entries || entries.length === 0) return null;
        return (
          <DocSection
            key={group}
            id={group}
            title={GROUP_LABELS[group]}
          >
            <div className="space-y-3">
              {entries.map((e, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4"
                >
                  <div className="text-sm font-semibold text-gray-100 mb-1.5">
                    {e.title}
                  </div>
                  <div className="text-xs text-gray-500 mb-2">
                    <strong className="text-gray-400">Cause:</strong> {e.cause}
                  </div>
                  <div className="text-sm text-gray-300 leading-relaxed">
                    <strong className="text-offivex-purple-light">Fix:</strong>{" "}
                    {e.fix}
                  </div>
                </div>
              ))}
            </div>
          </DocSection>
        );
      })}

      {filtered.length === 0 && (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-8 text-center">
          <div className="text-sm text-gray-400">
            No matching error. If you&rsquo;re hitting something new, copy the
            exact text and ask your admin — it&rsquo;ll be added here.
          </div>
        </div>
      )}
    </DocLayout>
  );
}
