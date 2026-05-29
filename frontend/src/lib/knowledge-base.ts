/**
 * Knowledge-base content — single source of truth for /knowledge-base and /knowledge-base/[slug].
 *
 * Blocks are rendered by ArticleRenderer in the slug page. Keep content factual
 * and Offivex-specific — generic SEO filler kills trust on a launch stack page.
 */

export type ArticleBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "callout"; tone: "info" | "warn" | "tip"; text: string }
  | { type: "code"; lang?: string; text: string };

export interface Article {
  slug: string;
  category: string;
  categorySlug: string;
  title: string;
  desc: string;
  readMinutes: number;
  updatedAt: string;
  blocks: ArticleBlock[];
}

export const CATEGORY_META: Record<string, { title: string; desc: string }> = {
  "getting-started": {
    title: "Getting Started",
    desc: "From application approval to your first token launch.",
  },
  "wallets-custody": {
    title: "Wallets & Custody",
    desc: "Encrypt, organize, and rotate your Solana wallets.",
  },
  "token-launches": {
    title: "Token Launches",
    desc: "Mint SPL tokens, launch on Pump.fun, and bundle snipes.",
  },
  "trading-bots": {
    title: "Trading Bots",
    desc: "Volume, bumper, warmer — automated trading patterns.",
  },
  "billing-payments": {
    title: "Billing & Payments",
    desc: "Subscriptions, crypto payments, refunds, invoices.",
  },
  "security": {
    title: "Security & Best Practices",
    desc: "Protect your wallets, password, and Telegram account.",
  },
};

export const ARTICLES: Article[] = [
  // ─── Getting Started ────────────────────────────────────────────────
  {
    slug: "application-process",
    category: "Getting Started",
    categorySlug: "getting-started",
    title: "How the application process works",
    desc: "What we look for, response timeline, next steps after submission.",
    readMinutes: 3,
    updatedAt: "2026-05-20",
    blocks: [
      {
        type: "p",
        text: "Offivex is invite-only. The application form on /apply is reviewed manually by our onboarding team and is designed to filter for serious projects — not to gatekeep talent. If you are building a real product and you can articulate why the launch infrastructure matters to you, you will be approved.",
      },
      { type: "h2", text: "What you submit" },
      {
        type: "ul",
        items: [
          "Telegram handle (this becomes your support contact)",
          "Project type — token launch, market making, infra reseller, agency",
          "Plan preference — Monthly or Yearly",
          "Short context — what you're building and why you need premium RPC + bundling",
        ],
      },
      { type: "h2", text: "Review timeline" },
      {
        type: "p",
        text: "Most applications resolve in under 24 hours during weekdays (Dubai UAE office hours, GMT+4). Weekend submissions are reviewed Monday morning. You'll receive a Telegram DM from @offivex_onboarding with either an approval link + payment invoice, or a follow-up question.",
      },
      {
        type: "callout",
        tone: "warn",
        text: "We only DM from @offivex_onboarding. Any other handle claiming to onboard you is impersonation — report it to security@offivex.io.",
      },
      { type: "h2", text: "What happens after approval" },
      {
        type: "ol",
        items: [
          "You receive a unique payment invoice (SOL, USDC-Solana, or USDT-TRC20)",
          "Payment confirms within 2 chain confirmations (~30 seconds on Solana)",
          "Your account is provisioned with RPC keys + tenant database",
          "A consultant walks you through the first 24 hours on a Telegram call",
        ],
      },
      { type: "h2", text: "Why some applications are declined" },
      {
        type: "p",
        text: "We decline applications that look like wash-trading mills, copy-paste rug operations, or anything resembling sanctioned-jurisdiction operations. We do not require doxxing — pseudonymous teams are welcome — but the project itself has to make sense.",
      },
    ],
  },
  {
    slug: "first-24-hours",
    category: "Getting Started",
    categorySlug: "getting-started",
    title: "Your first 24 hours on Offivex",
    desc: "Onboarding consultant call, wallet setup, RPC configuration.",
    readMinutes: 5,
    updatedAt: "2026-05-20",
    blocks: [
      {
        type: "p",
        text: "After approval and payment confirmation, you'll do a one-on-one onboarding call with an Offivex consultant. The call is 30–45 minutes on Telegram voice, and its goal is to get you from cold start to first launch-ready setup.",
      },
      { type: "h2", text: "Hour 0–1 — Account provisioning" },
      {
        type: "ul",
        items: [
          "Login at offivex.io with the credentials emailed to you",
          "Change your password immediately (Settings → Security)",
          "Enable 2FA via Telegram bot (Settings → 2FA)",
        ],
      },
      { type: "h2", text: "Hour 1–4 — Wallet setup" },
      {
        type: "p",
        text: "Wallets are generated client-side. Your seed phrases are encrypted with AES-256-GCM using a key derived from your password via Argon2id — Offivex never sees them in plaintext. Create your initial wallet group based on use case:",
      },
      {
        type: "ul",
        items: [
          "Dev wallet — for mint authority and Pump.fun creator profile",
          "Snipe group (5–20 wallets) — for bundle execution at launch",
          "Distribution group (50–200 wallets) — for anti-bubble holder spread",
          "Treasury wallet — cold-storage-style, only receives proceeds",
        ],
      },
      {
        type: "callout",
        tone: "tip",
        text: "Export and back up each seed phrase to offline storage before funding anything. Once you fund a wallet, losing the seed means losing the SOL — Offivex cannot recover it.",
      },
      { type: "h2", text: "Hour 4–8 — RPC config" },
      {
        type: "p",
        text: "Your subscription includes a private Helius RPC endpoint with prioritized lanes for transaction submission. The endpoint URL is pre-filled in your Offivex dashboard. If you also run external tools (Solana CLI, custom scripts), copy the URL from Settings → RPC.",
      },
      { type: "h2", text: "Hour 8–24 — Dry run a launch" },
      {
        type: "p",
        text: "Before your real launch, do a devnet dry run. The platform exposes a Devnet toggle (top right). Mint a test token, build a Jito bundle, execute. This rehearses your exact mainnet flow without burning SOL.",
      },
      {
        type: "callout",
        tone: "info",
        text: "Your consultant stays in DM for the first 7 days. Any blocker — ping them directly. After day 7, support continues via the in-app ticket system with 24h SLA.",
      },
    ],
  },
  {
    slug: "monthly-vs-yearly",
    category: "Getting Started",
    categorySlug: "getting-started",
    title: "Choosing between Monthly and Yearly",
    desc: "Feature differences and when each plan makes sense.",
    readMinutes: 2,
    updatedAt: "2026-05-20",
    blocks: [
      {
        type: "p",
        text: "Both plans include the full Offivex stack — RPC, bundling, Volume Bot, Wallet Warmer, anti-flag profiles. The difference is commitment and the small extras that come with locking in a year.",
      },
      { type: "h2", text: "Monthly — $1,000 / mo" },
      {
        type: "ul",
        items: [
          "Full feature access",
          "Cancel anytime (7-day refund window)",
          "Best for: testing the workflow, single-launch teams, agencies on retainer",
        ],
      },
      { type: "h2", text: "Yearly — $7,000 / yr" },
      {
        type: "ul",
        items: [
          "Full feature access + early access to new modules",
          "30-day refund window",
          "Dedicated launch consultant on retainer (1 call / month)",
          "Best for: serial launchers, market-making desks, infra resellers",
        ],
      },
      { type: "h2", text: "When to upgrade Monthly → Yearly" },
      {
        type: "p",
        text: "If you've completed two successful launches on Monthly and plan to keep operating, switch to Yearly mid-cycle. Unused Monthly days are credited pro-rata against the Yearly invoice. See the dedicated article on switching plans for the exact calculation.",
      },
    ],
  },

  // ─── Wallets & Custody ──────────────────────────────────────────────
  {
    slug: "encryption",
    category: "Wallets & Custody",
    categorySlug: "wallets-custody",
    title: "How encryption works on Offivex",
    desc: "AES-256-GCM with Argon2id, client-side derivation.",
    readMinutes: 4,
    updatedAt: "2026-05-20",
    blocks: [
      {
        type: "p",
        text: "Self-custody on Offivex means seed phrases never exist server-side in plaintext. The encryption happens in your browser before anything touches our database.",
      },
      { type: "h2", text: "Key derivation" },
      {
        type: "p",
        text: "When you log in, your password is run through Argon2id (memory-hard, ~64 MB cost) with a per-tenant salt. The resulting 256-bit key is held in browser memory for the session and discarded on tab close.",
      },
      { type: "h2", text: "Wallet encryption" },
      {
        type: "p",
        text: "Each generated wallet seed is encrypted with AES-256-GCM using the derived key. The ciphertext + 96-bit nonce + 128-bit auth tag are stored server-side. The server cannot decrypt them — only your browser can, only while you're logged in.",
      },
      {
        type: "callout",
        tone: "warn",
        text: "Lose your password and we cannot recover your wallets. The derived key dies with the password. This is the price of true self-custody — make sure you store a backup of your seed phrases outside Offivex.",
      },
      { type: "h2", text: "Signing transactions" },
      {
        type: "p",
        text: "When you submit a bundle or trigger a bot, the encrypted seeds are sent to your browser, decrypted in a Web Worker, used to sign the relevant transactions, and zeroed from memory immediately. Signed transactions are then submitted to RPC through our backend (which only sees the signed bytes, never the keys).",
      },
      { type: "h2", text: "What we can see" },
      {
        type: "ul",
        items: [
          "Public addresses (needed for routing and bot config)",
          "Encrypted ciphertext blobs (useless without your password)",
          "Transaction signatures after submission (these are public on-chain anyway)",
        ],
      },
    ],
  },
  {
    slug: "wallet-groups",
    category: "Wallets & Custody",
    categorySlug: "wallets-custody",
    title: "Creating wallet groups",
    desc: "Logical grouping for snipe, distribution, and dev wallets.",
    readMinutes: 3,
    updatedAt: "2026-05-20",
    blocks: [
      {
        type: "p",
        text: "Wallet groups are how Offivex organizes the dozens-to-hundreds of wallets a typical launch requires. A group has a name, a use-case tag, and a set of policies that apply to all wallets inside.",
      },
      { type: "h2", text: "Creating a group" },
      {
        type: "ol",
        items: [
          "Go to Wallets → New group",
          "Pick a use case tag: dev, snipe, distribution, treasury, or custom",
          "Choose how many wallets to generate (1–500)",
          "Click Generate — seeds are derived client-side, encrypted, and saved",
        ],
      },
      { type: "h2", text: "Use-case tags" },
      {
        type: "ul",
        items: [
          "dev — exposes mint authority controls, Pump.fun creator profile",
          "snipe — available as bundle participants, sortable by SOL balance",
          "distribution — used by the anti-bubble distribution panel",
          "treasury — read-only by default; explicit unlock required to spend",
          "custom — no automatic policies, you control everything",
        ],
      },
      {
        type: "callout",
        tone: "tip",
        text: "Keep your treasury group small (1–2 wallets) and never reuse them for sniping. Treating treasury as cold storage is the single best operational hygiene practice on a launch stack.",
      },
    ],
  },
  {
    slug: "export-seed",
    category: "Wallets & Custody",
    categorySlug: "wallets-custody",
    title: "Exporting your seed phrase",
    desc: "When you need it, how it's displayed safely.",
    readMinutes: 2,
    updatedAt: "2026-05-20",
    blocks: [
      {
        type: "p",
        text: "You can export any wallet's seed phrase at any time. The export happens in your browser — the decrypted phrase never travels over the network.",
      },
      { type: "h2", text: "How to export" },
      {
        type: "ol",
        items: [
          "Open Wallets and click the wallet row",
          "Click Reveal seed phrase",
          "Re-enter your password (this confirms intent, not a second key)",
          "The 12-word phrase appears for 30 seconds, then auto-hides",
        ],
      },
      { type: "h2", text: "When you need to export" },
      {
        type: "ul",
        items: [
          "Off-platform backup to paper / steel plate (recommended at creation)",
          "Importing the wallet into Phantom, Solflare, or hardware wallet",
          "Recovering a wallet if you decide to leave Offivex",
        ],
      },
      {
        type: "callout",
        tone: "warn",
        text: "Never paste your seed phrase into any website that isn't your own self-hosted wallet UI. Offivex will never ask for it — not in DMs, not in tickets, not anywhere.",
      },
    ],
  },
  {
    slug: "consolidate-sol",
    category: "Wallets & Custody",
    categorySlug: "wallets-custody",
    title: "Consolidating SOL across wallets",
    desc: "Step-by-step using the distribution panel.",
    readMinutes: 3,
    updatedAt: "2026-05-20",
    blocks: [
      {
        type: "p",
        text: "After a launch, SOL is typically scattered across many wallets — snipe wallets that took profit, distribution wallets that received tips, etc. The Consolidate flow sweeps them back to a target wallet in one bundled operation.",
      },
      { type: "h2", text: "Running a consolidation" },
      {
        type: "ol",
        items: [
          "Go to Wallets → group → Consolidate",
          "Pick the destination wallet (typically a treasury wallet)",
          "Set the minimum balance to keep per source (e.g. 0.001 SOL to avoid closing accounts)",
          "Review the preview — total SOL, expected fees, number of transactions",
          "Click Execute — the bundle submits via Jito with a low tip",
        ],
      },
      { type: "h2", text: "Fee math" },
      {
        type: "p",
        text: "Each consolidation transfer costs ~0.000005 SOL in base fee plus the Jito tip. For 100 wallets that's roughly 0.0005 SOL in fees plus one small tip. The platform batches 25 transfers per transaction to keep this tight.",
      },
      {
        type: "callout",
        tone: "tip",
        text: "Leave at least 0.002 SOL per wallet if you might use it again — closing and reopening token accounts costs more than keeping rent.",
      },
    ],
  },

  // ─── Token Launches ─────────────────────────────────────────────────
  {
    slug: "mint-spl-token",
    category: "Token Launches",
    categorySlug: "token-launches",
    title: "Minting your first SPL token",
    desc: "Metadata, supply, vanity address grinding.",
    readMinutes: 5,
    updatedAt: "2026-05-20",
    blocks: [
      {
        type: "p",
        text: "The Mint module guides you through creating an SPL-Token-2022 mint with metadata, supply, and optional authorities. Defaults are sane for a launch — you can deviate, but only with reason.",
      },
      { type: "h2", text: "Required inputs" },
      {
        type: "ul",
        items: [
          "Name (32 chars max) and symbol (10 chars max)",
          "Decimals — almost always 6 (Pump.fun standard) or 9 (legacy SPL)",
          "Total supply — typically 1,000,000,000 for a meme launch",
          "Metadata URI — Offivex pins JSON + image to its IPFS gateway",
        ],
      },
      { type: "h2", text: "Authorities" },
      {
        type: "p",
        text: "By default, mint authority and freeze authority are set to your dev wallet. You can revoke both at mint time — irreversible — or after. Revoking mint authority before launch is standard practice for fair launches; revoking freeze authority signals you can't blacklist holders.",
      },
      {
        type: "callout",
        tone: "warn",
        text: "Revoking authorities is permanent. Do not revoke until you've verified your metadata renders correctly on Birdeye, DexScreener, and your DEX of choice.",
      },
      { type: "h2", text: "Vanity address grinding" },
      {
        type: "p",
        text: "If your symbol is PEPE, a mint address ending in pepe is a small but real branding lift. Offivex grinds up to 4 suffix characters on the server (GPU-accelerated, ~10–60 seconds). For longer suffixes, use solana-keygen grind locally — the platform accepts an imported keypair.",
      },
      { type: "h2", text: "Metadata best practices" },
      {
        type: "ul",
        items: [
          "Image: 512×512 PNG, under 200 KB",
          "Banner (optional): 1500×500 for Birdeye / Twitter card",
          "Description: 1–2 sentences, no exit-scam-energy buzzwords",
          "Social links: only what's live and you'll maintain",
        ],
      },
    ],
  },
  {
    slug: "jito-bundles",
    category: "Token Launches",
    categorySlug: "token-launches",
    title: "Jito bundle anatomy",
    desc: "Multi-tx atomic execution and tip strategy.",
    readMinutes: 4,
    updatedAt: "2026-05-20",
    blocks: [
      {
        type: "p",
        text: "A Jito bundle is up to 5 transactions submitted together and either all included in the same block or all rejected. For launches, this lets you mint + add liquidity + execute your first snipe atomically — no MEV bot can frontrun between the steps.",
      },
      { type: "h2", text: "Anatomy of a launch bundle" },
      {
        type: "ol",
        items: [
          "Tx 1: Mint token + metadata (dev wallet)",
          "Tx 2: Add liquidity to Raydium / Pump.fun pool",
          "Tx 3–4: Snipe buys from your snipe group (up to 4 wallets per tx via instruction packing)",
          "Tx 5: Tip transaction to a Jito tip account",
        ],
      },
      { type: "h2", text: "Tip strategy" },
      {
        type: "p",
        text: "The tip determines the probability your bundle lands. Offivex shows a live tip percentile chart in the Bundle Builder. For a competitive launch slot, target the 75–90th percentile; for an off-peak rebalance, the 25th is fine.",
      },
      {
        type: "callout",
        tone: "info",
        text: "Tips are paid only if the bundle lands. A failed bundle costs nothing beyond the base fees on any partially-attempted transactions.",
      },
      { type: "h2", text: "Why bundles fail" },
      {
        type: "ul",
        items: [
          "Tip too low — another bundle won the slot",
          "Transaction exceeds 1232-byte limit — pack fewer instructions per tx",
          "Account locks conflict — two txs writing to the same account in the same block",
          "Compute budget exceeded — increase CU limit per tx",
        ],
      },
    ],
  },
  {
    slug: "pump-fun-profiles",
    category: "Token Launches",
    categorySlug: "token-launches",
    title: "Pump.fun launches with custom profiles",
    desc: "Profile randomizer and dev wallet setup.",
    readMinutes: 4,
    updatedAt: "2026-05-20",
    blocks: [
      {
        type: "p",
        text: "Pump.fun launches are gated by a Pump.fun creator profile. Offivex generates randomized profiles with plausible username, bio, and PFP — no two of your launches share a profile, which avoids cluster detection on tracker bots.",
      },
      { type: "h2", text: "Profile elements" },
      {
        type: "ul",
        items: [
          "Username — generated from a curated wordlist (crypto-native but not clichéd)",
          "Bio — short, on-theme line tied to the project name",
          "PFP — randomly selected from a 2,000-image library you can extend",
          "Twitter link — optional, you supply",
        ],
      },
      { type: "h2", text: "Creating the launch" },
      {
        type: "ol",
        items: [
          "Pump.fun module → New launch",
          "Pick the dev wallet (must have ≥ 0.05 SOL for creator fee)",
          "Generate a profile or import one you've prepared",
          "Fill token metadata (reuses the Mint module's flow)",
          "Set initial dev buy amount — 0 to 1 SOL is typical",
          "Submit — Offivex bundles profile creation + token creation + dev buy",
        ],
      },
      { type: "h2", text: "When to use custom profiles" },
      {
        type: "p",
        text: "Tracker bots flag wallets that repeatedly use the same creator profile or that share metadata patterns. The randomizer breaks both signals. For a one-off project this is overkill — for serial launchers, it's essential.",
      },
    ],
  },
  {
    slug: "anti-bubble-distribution",
    category: "Token Launches",
    categorySlug: "token-launches",
    title: "Anti-bubble distribution patterns",
    desc: "Avoiding cluster detection on chain.",
    readMinutes: 4,
    updatedAt: "2026-05-20",
    blocks: [
      {
        type: "p",
        text: "Bubble maps (Bubblemaps, Solscan holder analysis) flag launches where a small cluster of wallets holds a large share, especially when those wallets were funded from one source. The Distribution module is designed to produce a holder graph that doesn't trip these heuristics.",
      },
      { type: "h2", text: "Distribution patterns" },
      {
        type: "ul",
        items: [
          "Power-law sizing — top wallet 0.8%, declining by factor 1.3 across 50 wallets",
          "Time-shifted entries — stagger buys across 5–20 minutes, not all in one block",
          "Multi-hop funding — fund via 2 intermediate wallets before the buying wallet",
          "Mixed amounts — vary buy size by ±30% per wallet, not uniform chunks",
        ],
      },
      { type: "h2", text: "Configuring the panel" },
      {
        type: "ol",
        items: [
          "Distribution → New plan",
          "Select source group (where SOL comes from) and buyer group (who buys)",
          "Set total budget and target holder count",
          "Pick a profile: aggressive, balanced, or stealth (stealth = longest window)",
          "Preview the simulated holder distribution graph",
          "Execute — the platform handles funding, delays, and buys",
        ],
      },
      {
        type: "callout",
        tone: "tip",
        text: "Always preview the simulated bubble map before executing. If your top-10 holders sum to more than 20%, tighten the power-law factor or add more wallets.",
      },
    ],
  },

  // ─── Trading Bots ───────────────────────────────────────────────────
  {
    slug: "volume-bot",
    category: "Trading Bots",
    categorySlug: "trading-bots",
    title: "Configuring the Volume Bot",
    desc: "Cycle parameters, slippage tolerance, wallet rotation.",
    readMinutes: 4,
    updatedAt: "2026-05-20",
    blocks: [
      {
        type: "p",
        text: "The Volume Bot generates trading volume on your token by cycling buys and sells across a rotating set of wallets. Volume drives discovery on DexScreener and trending lists — but only if the pattern looks organic.",
      },
      { type: "h2", text: "Core parameters" },
      {
        type: "ul",
        items: [
          "Cycle SOL — average SOL per buy (typical: 0.05–0.5)",
          "Cycles per hour — target frequency (typical: 20–200)",
          "Slippage tolerance — 1–5% depending on pool depth",
          "Wallet rotation — how many wallets in the pool (more = more organic, more fees)",
          "Buy/sell ratio — 1.0 is neutral; >1 increases price, <1 decreases",
        ],
      },
      { type: "h2", text: "Cost model" },
      {
        type: "p",
        text: "Every trade pays 0.25% Raydium fee (or Pump.fun fee on bonding curve), plus ~0.000005 SOL network fee. The bot is not a money printer — at 100 cycles/hour at 0.1 SOL/cycle, you're spending ~0.5 SOL/hour on swap fees alone.",
      },
      { type: "h2", text: "Anti-detection patterns" },
      {
        type: "ul",
        items: [
          "Randomized buy size within a band (±20% around the mean)",
          "Randomized inter-trade delays (not perfect periodicity)",
          "Wallet rotation — never reuse the same wallet more than 2x in a row",
          "Occasional bot pauses (built-in: 5–15 min idle every 1–2 hours)",
        ],
      },
      {
        type: "callout",
        tone: "warn",
        text: "Volume bots are a tool, not a substitute for product. If there's no real reason for buyers to show up after the trending placement, the bot just burns SOL.",
      },
    ],
  },
  {
    slug: "bumper-bot",
    category: "Trading Bots",
    categorySlug: "trading-bots",
    title: "Bumper bot strategy",
    desc: "Same-block buy/sell for price action.",
    readMinutes: 3,
    updatedAt: "2026-05-20",
    blocks: [
      {
        type: "p",
        text: "The Bumper bot executes a buy and a sell in the same block from two different wallets, producing a price candle without net token accumulation. It's used to keep charts moving during quiet hours.",
      },
      { type: "h2", text: "How it works" },
      {
        type: "ol",
        items: [
          "Wallet A buys a configured SOL amount",
          "Wallet B sells the same token quantity acquired earlier",
          "Both txs are submitted as a Jito bundle for same-block execution",
          "Net effect: candle prints, but inventory is unchanged",
        ],
      },
      { type: "h2", text: "Common configs" },
      {
        type: "ul",
        items: [
          "Heartbeat — one bump every 5–15 minutes during low-activity windows",
          "Volume-aware — bump only when external volume drops below threshold",
          "Pre-trend push — bump every 30 seconds before a planned campaign",
        ],
      },
      {
        type: "callout",
        tone: "info",
        text: "Bumper trades still cost swap fees (0.25% per side = 0.5% round trip). Budget accordingly: 100 bumps × 0.1 SOL × 0.5% = 0.05 SOL.",
      },
    ],
  },
  {
    slug: "wallet-warmer",
    category: "Trading Bots",
    categorySlug: "trading-bots",
    title: "Wallet Warmer best practices",
    desc: "Building organic-looking transaction history.",
    readMinutes: 4,
    updatedAt: "2026-05-20",
    blocks: [
      {
        type: "p",
        text: "Fresh wallets with no history are flagged by some MEV bots and tracker tools — a wallet buying $50k of a brand-new token on its first transaction looks like a coordinated entry. The Wallet Warmer fills in plausible history before you use a wallet for anything serious.",
      },
      { type: "h2", text: "What warming includes" },
      {
        type: "ul",
        items: [
          "Random buys/sells of established tokens (SOL, USDC, JUP, BONK)",
          "Random NFT mints from free-mint collections",
          "Random SOL transfers to other warmed wallets in the network",
          "Spread across days/weeks per the schedule you choose",
        ],
      },
      { type: "h2", text: "Schedule profiles" },
      {
        type: "ul",
        items: [
          "Fast — 24 hours, ~10 transactions per wallet (low cost, basic cover)",
          "Standard — 7 days, ~30 transactions per wallet (good for most launches)",
          "Deep — 30 days, ~80 transactions per wallet (resistant to manual review)",
        ],
      },
      { type: "h2", text: "Cost estimate" },
      {
        type: "p",
        text: "Standard warming for 50 wallets across 7 days costs roughly 0.15–0.3 SOL in fees total. Deep warming for the same 50 wallets is 0.4–0.8 SOL.",
      },
      {
        type: "callout",
        tone: "tip",
        text: "Start warming the day you fund the wallets, not the day before launch. A 24-hour rush job is detectable; a 7-day natural-looking history is not.",
      },
    ],
  },
  {
    slug: "stop-resume-bots",
    category: "Trading Bots",
    categorySlug: "trading-bots",
    title: "Stopping & resuming bots safely",
    desc: "Graceful shutdown without leaving open positions.",
    readMinutes: 3,
    updatedAt: "2026-05-20",
    blocks: [
      {
        type: "p",
        text: "Every Offivex bot has a Stop button — but the right way to stop depends on the bot's state. A hard kill mid-cycle can leave a wallet holding tokens it was about to sell.",
      },
      { type: "h2", text: "Stop modes" },
      {
        type: "ul",
        items: [
          "Soft stop (default) — finishes the current cycle then halts. Recommended.",
          "Hard stop — halts immediately, regardless of in-flight transactions",
          "Drain — switches to sell-only until inventory is back to zero",
        ],
      },
      { type: "h2", text: "Resuming" },
      {
        type: "p",
        text: "Resuming a soft-stopped bot picks up exactly where it left off. Resuming a hard-stopped bot inspects inventory first and asks how you want to reconcile any orphan positions.",
      },
      {
        type: "callout",
        tone: "warn",
        text: "Never hard-stop the Volume Bot mid-trade unless an emergency. If you suspect a problem, use Soft stop and reconcile inventory before deciding next steps.",
      },
    ],
  },

  // ─── Billing & Payments ─────────────────────────────────────────────
  {
    slug: "paying-crypto",
    category: "Billing & Payments",
    categorySlug: "billing-payments",
    title: "Paying with crypto",
    desc: "SOL / USDC / USDT-TRC20 — how invoices work.",
    readMinutes: 3,
    updatedAt: "2026-05-20",
    blocks: [
      {
        type: "p",
        text: "Offivex is crypto-only. We accept SOL, USDC on Solana, and USDT on TRON (TRC20). Card payments are not supported — this is intentional, not a roadmap gap.",
      },
      { type: "h2", text: "Invoice flow" },
      {
        type: "ol",
        items: [
          "After approval (new accounts) or at renewal, you get a unique invoice URL",
          "The invoice shows the exact amount + payment address + memo (if required)",
          "Pay from any wallet — the invoice tracks the chain for your address",
          "After 2 confirmations (Solana) or 19 confirmations (TRC20), the invoice clears",
          "Your subscription period extends from the clear time",
        ],
      },
      { type: "h2", text: "Asset preference" },
      {
        type: "ul",
        items: [
          "USDC (Solana) — most stable, ~$0.0001 fee, recommended",
          "USDT (TRC20) — common for desks moving large balances, ~$1 fee",
          "SOL — accepted but priced at invoice generation (locked for 30 minutes)",
        ],
      },
      {
        type: "callout",
        tone: "warn",
        text: "Always send the exact amount. Underpayments are not automatically credited — they require a manual reconciliation ticket (24h SLA). Overpayments are credited to your next invoice.",
      },
    ],
  },
  {
    slug: "monthly-to-yearly",
    category: "Billing & Payments",
    categorySlug: "billing-payments",
    title: "Switching from Monthly to Yearly",
    desc: "Pro-rata credit and timing.",
    readMinutes: 2,
    updatedAt: "2026-05-20",
    blocks: [
      {
        type: "p",
        text: "Switching mid-cycle credits your unused Monthly days against the Yearly invoice. You don't lose anything by switching early.",
      },
      { type: "h2", text: "The math" },
      {
        type: "p",
        text: "If you switch on day 10 of a 30-day Monthly cycle, 20 days remain. Credit = 20/30 × $1,000 = $666.67. Yearly invoice = $7,000 − $666.67 = $6,333.33. Your new Yearly period starts on the day you pay.",
      },
      { type: "h2", text: "How to switch" },
      {
        type: "ol",
        items: [
          "Settings → Subscription → Change plan",
          "Select Yearly — the prorated invoice is generated immediately",
          "Pay using any of the supported crypto rails",
          "After confirmation, your plan flips and the next renewal is 365 days out",
        ],
      },
      {
        type: "callout",
        tone: "tip",
        text: "If you're approaching the end of a Monthly cycle, just let it expire naturally and start fresh on Yearly — the math at the tail end of a Monthly cycle isn't worth the few-dollar credit.",
      },
    ],
  },
  {
    slug: "refund-policy",
    category: "Billing & Payments",
    categorySlug: "billing-payments",
    title: "Refund policy",
    desc: "7-day Monthly · 30-day Yearly · how to request.",
    readMinutes: 2,
    updatedAt: "2026-05-20",
    blocks: [
      {
        type: "p",
        text: "We don't try to keep your money if Offivex isn't the right fit. The refund windows are generous and processed in the same crypto asset you paid with.",
      },
      { type: "h2", text: "Windows" },
      {
        type: "ul",
        items: [
          "Monthly — 7 days from payment confirmation",
          "Yearly — 30 days from payment confirmation",
          "After the window — no refund, but you keep access until the period ends",
        ],
      },
      { type: "h2", text: "How to request" },
      {
        type: "ol",
        items: [
          "Email billing@offivex.io with your tenant ID and reason",
          "Include the wallet address to receive the refund (must be a wallet you control)",
          "Refund is processed within 2 business days, sent in the same asset",
        ],
      },
      {
        type: "callout",
        tone: "info",
        text: "Network fees for the refund transfer (≈$0.50 SOL / ≈$1 TRC20) are deducted from the refund amount.",
      },
    ],
  },
  {
    slug: "payout-wallet",
    category: "Billing & Payments",
    categorySlug: "billing-payments",
    title: "Updating your payout wallet",
    desc: "Rotate the Solana wallet used for auto-renewal.",
    readMinutes: 2,
    updatedAt: "2026-05-20",
    blocks: [
      {
        type: "p",
        text: "Auto-renewal pulls from the wallet you registered at signup. You can rotate this wallet at any time — for example, if you move treasury operations to a new hardware wallet.",
      },
      { type: "h2", text: "How to rotate" },
      {
        type: "ol",
        items: [
          "Settings → Billing → Payment wallet",
          "Click Rotate wallet",
          "Sign a short message from the new wallet (proves ownership)",
          "Confirm via the email link sent to your registered address",
          "The next renewal will draft from the new wallet",
        ],
      },
      {
        type: "callout",
        tone: "tip",
        text: "If auto-renewal is enabled, make sure the new wallet has at least 1.5× the next invoice amount when renewal day arrives — a failed draft pauses your subscription until you pay manually.",
      },
    ],
  },

  // ─── Security & Best Practices ──────────────────────────────────────
  {
    slug: "password-rotation",
    category: "Security & Best Practices",
    categorySlug: "security",
    title: "Password requirements & rotation",
    desc: "Why 12+ chars and how often to rotate.",
    readMinutes: 3,
    updatedAt: "2026-05-20",
    blocks: [
      {
        type: "p",
        text: "Your password is the only key that decrypts your seed phrases on Offivex. We enforce a strong minimum because a weak password = effective custody loss.",
      },
      { type: "h2", text: "Requirements" },
      {
        type: "ul",
        items: [
          "Minimum 12 characters",
          "Mix of uppercase, lowercase, digit, and symbol",
          "Not in the common-password blocklist (Have I Been Pwned top 100k)",
          "Different from your Telegram / email password",
        ],
      },
      { type: "h2", text: "Rotation cadence" },
      {
        type: "p",
        text: "We recommend rotating every 90 days, or immediately if you suspect any device of being compromised. Rotation re-encrypts all your wallet seeds with the new key — the operation takes 10–30 seconds depending on wallet count.",
      },
      {
        type: "callout",
        tone: "warn",
        text: "If you rotate, write the new password down in your physical backup before logging out. A rotation followed by forgetting the new password is the most common way users lose access.",
      },
    ],
  },
  {
    slug: "backup-seed",
    category: "Security & Best Practices",
    categorySlug: "security",
    title: "Backing up your seed phrase",
    desc: "Cold storage recommendations, never digital.",
    readMinutes: 3,
    updatedAt: "2026-05-20",
    blocks: [
      {
        type: "p",
        text: "Self-custody means Offivex cannot recover your wallets. Backup is your responsibility — but it's easier than it sounds.",
      },
      { type: "h2", text: "Recommended backup tiers" },
      {
        type: "ul",
        items: [
          "Tier 1 — Paper: write the 12 words on acid-free paper, store in a safe or safety deposit box",
          "Tier 2 — Steel: stamp the 12 words on a stainless steel plate (Cryptosteel, Keystone Tablet, etc.)",
          "Tier 3 — Geographic split: half the seed in two locations using Shamir's Secret Sharing (advanced)",
        ],
      },
      { type: "h2", text: "What not to do" },
      {
        type: "ul",
        items: [
          "Never store seeds in a cloud notes app (iCloud Notes, Google Keep, Notion)",
          "Never email yourself the seed phrase",
          "Never store seeds in a password manager that syncs to cloud",
          "Never photograph the seed phrase",
        ],
      },
      {
        type: "callout",
        tone: "tip",
        text: "For treasury wallets, prefer a hardware wallet (Ledger, Trezor) and only import them into Offivex for active operations. Send proceeds back to the hardware wallet periodically.",
      },
    ],
  },
  {
    slug: "phishing",
    category: "Security & Best Practices",
    categorySlug: "security",
    title: "Recognizing phishing attempts",
    desc: "We never DM you first asking for credentials.",
    readMinutes: 3,
    updatedAt: "2026-05-20",
    blocks: [
      {
        type: "p",
        text: "Crypto operators are high-value phishing targets. The good news: most attacks are easy to recognize once you know the patterns. Here's what to watch for, and what Offivex never does.",
      },
      { type: "h2", text: "Offivex will never" },
      {
        type: "ul",
        items: [
          "DM you first on Telegram for any reason (we only respond to your tickets)",
          "Ask for your password, seed phrase, or 2FA code over any channel",
          "Ask you to visit a non-offivex.io URL to fix a problem",
          "Pressure you with urgency or threats of account closure",
        ],
      },
      { type: "h2", text: "Common patterns to recognize" },
      {
        type: "ul",
        items: [
          "Lookalike domains (offìvex.io with an accented i, or offivex-help.com)",
          "Fake support staff on Telegram with similar handles (@offivex_help, @offivex_support_official)",
          "Browser popups asking you to re-enter your password after \"session expired\"",
          "Discord / X DMs offering early access, airdrops, or beta programs",
        ],
      },
      {
        type: "callout",
        tone: "warn",
        text: "When in doubt, bookmark offivex.io and only navigate via the bookmark. Verify all support DMs by replying through your in-app ticket system, not the DM thread.",
      },
    ],
  },
  {
    slug: "security-disclosure",
    category: "Security & Best Practices",
    categorySlug: "security",
    title: "Reporting a security issue",
    desc: "Responsible disclosure to security@offivex.io.",
    readMinutes: 2,
    updatedAt: "2026-05-20",
    blocks: [
      {
        type: "p",
        text: "If you find a vulnerability in Offivex — frontend, backend, or anything in between — we want to hear from you. We follow a coordinated disclosure model and pay bounties for valid reports.",
      },
      { type: "h2", text: "How to report" },
      {
        type: "ol",
        items: [
          "Email security@offivex.io with details — reproduction steps, impact, suggested fix if any",
          "Optional: PGP-encrypt the email (public key at offivex.io/.well-known/pgp)",
          "We acknowledge within 24 hours and triage within 72 hours",
          "We coordinate a disclosure window with you (typically 30–90 days)",
        ],
      },
      { type: "h2", text: "Scope" },
      {
        type: "ul",
        items: [
          "In scope: offivex.io and api.offivex.io, the Offivex desktop client",
          "Out of scope: 3rd-party services (Helius, NOWPayments, Telegram) — report to them directly",
          "Out of scope: social engineering, physical attacks, denial-of-service",
        ],
      },
      { type: "h2", text: "Bounties" },
      {
        type: "p",
        text: "Bounty bands are based on impact: critical $5,000–$25,000 (seed exfiltration, wallet drain, auth bypass), high $1,000–$5,000 (privilege escalation, RCE without persistence), medium $250–$1,000 (XSS, CSRF), low $50–$250 (info disclosure, hardening). Paid in USDC-Solana within 7 days of report closure.",
      },
      {
        type: "callout",
        tone: "info",
        text: "Do not exfiltrate data beyond what's needed to prove the issue. We won't bounty reports that violate user privacy in the process of demonstrating a vulnerability.",
      },
    ],
  },
];

export function getArticleBySlug(slug: string): Article | undefined {
  return ARTICLES.find((a) => a.slug === slug);
}

export function getArticlesByCategory(categorySlug: string): Article[] {
  return ARTICLES.filter((a) => a.categorySlug === categorySlug);
}

export function getRelatedArticles(slug: string, limit = 3): Article[] {
  const current = getArticleBySlug(slug);
  if (!current) return [];
  return ARTICLES.filter(
    (a) => a.slug !== slug && a.categorySlug === current.categorySlug
  ).slice(0, limit);
}
