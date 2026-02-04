"use client";

import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/24/solid";

export default function TutorialPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <Link
          href="/docs"
          className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-all hover:gap-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-lg px-2 py-1"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back to Documentation
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">
          Complete Tutorial: From Zero to Token Launch
        </h1>
        <p className="text-gray-400">
          Follow this guide step by step to launch your first token on Solana
          using Cresus.
        </p>
      </div>

      {/* Progress Overview */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-8">
        <h2 className="text-lg font-semibold mb-4 text-indigo-400">
          What you will learn
        </h2>
        <div className="grid md:grid-cols-2 gap-3">
          {[
            { step: "1", label: "Set up Cresus", color: "text-green-400" },
            { step: "2", label: "Create & manage wallets", color: "text-blue-400" },
            { step: "3", label: "Configure RPC endpoints", color: "text-purple-400" },
            { step: "4", label: "Prepare token assets", color: "text-pink-400" },
            { step: "5", label: "Mint your token", color: "text-amber-400" },
            { step: "6", label: "Launch with Jito Bundle", color: "text-orange-400" },
            { step: "7", label: "Distribute SOL (anti-bubble)", color: "text-cyan-400" },
            { step: "8", label: "Run trading bots", color: "text-red-400" },
          ].map((item) => (
            <div
              key={item.step}
              className="flex items-center gap-3 p-2 rounded-lg bg-gray-800/50"
            >
              <span
                className={`w-7 h-7 flex items-center justify-center rounded-full bg-gray-800 text-sm font-bold ${item.color}`}
              >
                {item.step}
              </span>
              <span className="text-gray-300 text-sm">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Step 1: Setup */}
      <section className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <span className="w-10 h-10 flex items-center justify-center rounded-full bg-green-900/30 border border-green-800 text-green-400 font-bold text-lg">
            1
          </span>
          <h2 className="text-2xl font-bold text-green-400">Set Up Cresus</h2>
        </div>

        <div className="space-y-4 ml-13">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <h3 className="font-semibold text-gray-200 mb-3">
              Install Prerequisites
            </h3>
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-400">
              <li>
                <strong className="text-gray-300">Rust</strong> 1.85+ —
                <code className="bg-gray-800 px-1.5 py-0.5 rounded text-xs ml-1">
                  curl --proto &apos;=https&apos; --tlsv1.2 -sSf https://sh.rustup.rs | sh
                </code>
              </li>
              <li>
                <strong className="text-gray-300">Node.js</strong> v20+ —
                <code className="bg-gray-800 px-1.5 py-0.5 rounded text-xs ml-1">
                  brew install node
                </code>
              </li>
              <li>
                <strong className="text-gray-300">OpenSSL</strong> —
                <code className="bg-gray-800 px-1.5 py-0.5 rounded text-xs ml-1">
                  brew install openssl pkg-config
                </code>
              </li>
            </ul>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <h3 className="font-semibold text-gray-200 mb-3">
              Clone & Configure
            </h3>
            <pre className="bg-gray-950 rounded p-3 text-sm text-gray-300 overflow-x-auto">
              <code>{`git clone <your-repo-url> cresus && cd cresus
cp backend/.env.example backend/.env

# Edit .env with your RPC URL, Pinata keys, etc.`}</code>
            </pre>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <h3 className="font-semibold text-gray-200 mb-3">
              Start the Servers
            </h3>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <div className="bg-gray-800 px-3 py-1 rounded-t text-xs font-semibold text-gray-400">
                  Terminal 1 — Backend
                </div>
                <pre className="bg-gray-950 rounded-b p-3 text-sm text-gray-300">
                  <code>{`cd backend
cargo build --workspace
cargo run -p cresus-server`}</code>
                </pre>
              </div>
              <div>
                <div className="bg-gray-800 px-3 py-1 rounded-t text-xs font-semibold text-gray-400">
                  Terminal 2 — Frontend
                </div>
                <pre className="bg-gray-950 rounded-b p-3 text-sm text-gray-300">
                  <code>{`cd frontend
npm install
npm run dev`}</code>
                </pre>
              </div>
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <h3 className="font-semibold text-gray-200 mb-3">
              First Login
            </h3>
            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-300">
              <li>
                Open{" "}
                <code className="bg-gray-800 px-1.5 py-0.5 rounded text-xs">
                  http://localhost:3000
                </code>
              </li>
              <li>Create a strong master password (16+ characters recommended)</li>
              <li>
                <strong className="text-red-400">
                  SAVE YOUR 12-WORD SEED PHRASE
                </strong>{" "}
                — write it down on paper, store in a password manager. This is
                your only backup if you forget your password.
              </li>
              <li>You&apos;re now logged in and ready to go</li>
            </ol>
          </div>
        </div>
      </section>

      {/* Step 2: Wallets */}
      <section className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <span className="w-10 h-10 flex items-center justify-center rounded-full bg-blue-900/30 border border-blue-800 text-blue-400 font-bold text-lg">
            2
          </span>
          <h2 className="text-2xl font-bold text-blue-400">
            Create & Manage Wallets
          </h2>
        </div>

        <div className="space-y-4 ml-13">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <h3 className="font-semibold text-gray-200 mb-3">
              Create Your Main Wallet
            </h3>
            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-300">
              <li>
                Go to{" "}
                <Link href="/wallets" className="text-blue-400 hover:underline">
                  Wallets
                </Link>{" "}
                page
              </li>
              <li>Click &quot;Create Wallet&quot;</li>
              <li>Give it a name (e.g., &quot;Launch Wallet&quot;)</li>
              <li>Your wallet is created with a unique Solana address</li>
            </ol>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <h3 className="font-semibold text-gray-200 mb-3">
              Create Sub-Wallets (for sniping & distribution)
            </h3>
            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-300">
              <li>Click &quot;+ Sub-wallets&quot; on your main wallet</li>
              <li>Choose how many (5-10 recommended for launch)</li>
              <li>Sub-wallets are derived from the parent deterministically</li>
            </ol>
            <div className="bg-blue-900/20 border border-blue-800 rounded p-3 mt-3">
              <p className="text-blue-400 text-xs">
                <strong>Why sub-wallets?</strong> They&apos;re used for snipe buys
                during launch and anti-bubble distribution. Each one is a
                separate Solana wallet.
              </p>
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <h3 className="font-semibold text-gray-200 mb-3">
              Fund Your Wallets
            </h3>
            <p className="text-sm text-gray-300 mb-2">
              Send SOL from an external wallet (Phantom, Solflare, etc.) to your
              main wallet&apos;s public address. You can see the address and check
              balances on the Wallets page.
            </p>
            <div className="bg-yellow-900/20 border border-yellow-800 rounded p-3">
              <p className="text-yellow-400 text-xs">
                <strong>Budget guide:</strong> For a basic launch, you&apos;ll need
                ~15-20 SOL total: 10 SOL liquidity + 1-2 SOL for snipes + 1-2
                SOL for fees + 2-5 SOL for bot trading.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Step 3: RPC */}
      <section className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <span className="w-10 h-10 flex items-center justify-center rounded-full bg-purple-900/30 border border-purple-800 text-purple-400 font-bold text-lg">
            3
          </span>
          <h2 className="text-2xl font-bold text-purple-400">
            Configure RPC Endpoints
          </h2>
        </div>

        <div className="space-y-4 ml-13">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <p className="text-sm text-gray-300 mb-3">
              RPC endpoints are how Cresus talks to Solana. You need at least
              one, but adding multiple gives you redundancy.
            </p>
            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-300">
              <li>
                Go to{" "}
                <Link
                  href="/settings"
                  className="text-blue-400 hover:underline"
                >
                  Settings
                </Link>
              </li>
              <li>Click &quot;Add RPC Endpoint&quot;</li>
              <li>
                Enter name and URL (e.g., QuickNode, Helius, or Alchemy)
              </li>
              <li>Click &quot;Health Check&quot; to verify connectivity</li>
            </ol>
            <div className="bg-green-900/20 border border-green-800 rounded p-3 mt-3">
              <p className="text-green-400 text-xs">
                <strong>Free option:</strong>{" "}
                <code className="bg-gray-800 px-1 rounded">
                  https://api.mainnet-beta.solana.com
                </code>{" "}
                works but is rate-limited. For production, use a paid provider.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Step 4: Meme Library */}
      <section className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <span className="w-10 h-10 flex items-center justify-center rounded-full bg-pink-900/30 border border-pink-800 text-pink-400 font-bold text-lg">
            4
          </span>
          <h2 className="text-2xl font-bold text-pink-400">
            Prepare Token Assets
          </h2>
        </div>

        <div className="space-y-4 ml-13">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <h3 className="font-semibold text-gray-200 mb-3">
              Upload Your Token Logo
            </h3>
            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-300">
              <li>
                Go to{" "}
                <Link
                  href="/meme-library"
                  className="text-blue-400 hover:underline"
                >
                  Meme Library
                </Link>
              </li>
              <li>Click &quot;Upload&quot; and select your token logo (PNG/JPG, 512x512 or 1024x1024 recommended)</li>
              <li>Click &quot;Pin&quot; to upload it to IPFS — you get a permanent URI</li>
            </ol>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <h3 className="font-semibold text-gray-200 mb-3">
              Create Token Metadata
            </h3>
            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-300">
              <li>Go to the Metadata tab in Meme Library</li>
              <li>Click &quot;Create Metadata&quot;</li>
              <li>Fill in: name, symbol, description</li>
              <li>Link it to the pinned logo image</li>
              <li>Pin the metadata JSON to IPFS</li>
              <li>
                Copy the metadata URI — you&apos;ll need it for minting:
                <code className="bg-gray-800 px-1.5 py-0.5 rounded text-xs ml-1">
                  ipfs://Qm...
                </code>
              </li>
            </ol>
          </div>
        </div>
      </section>

      {/* Step 5: Mint */}
      <section className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <span className="w-10 h-10 flex items-center justify-center rounded-full bg-amber-900/30 border border-amber-800 text-amber-400 font-bold text-lg">
            5
          </span>
          <h2 className="text-2xl font-bold text-amber-400">
            Mint Your Token
          </h2>
        </div>

        <div className="space-y-4 ml-13">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-300">
              <li>
                Go to{" "}
                <Link href="/mint" className="text-blue-400 hover:underline">
                  Mint Token
                </Link>
              </li>
              <li>Select the wallet that will be the creator/owner</li>
              <li>
                Fill in token details:
                <ul className="list-disc list-inside ml-6 mt-1 text-xs text-gray-400 space-y-1">
                  <li><strong>Name:</strong> Your token name (e.g., &quot;My Token&quot;)</li>
                  <li><strong>Symbol:</strong> Ticker (e.g., &quot;MTK&quot;)</li>
                  <li><strong>Decimals:</strong> 9 is standard for Solana</li>
                  <li><strong>Supply:</strong> Total token supply (e.g., 1,000,000,000)</li>
                  <li><strong>Metadata URI:</strong> The IPFS URI from step 4</li>
                </ul>
              </li>
              <li>Click &quot;Mint&quot; — costs ~0.015 SOL</li>
              <li>Copy the mint address — you&apos;ll need it for the bundle</li>
            </ol>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <h3 className="font-semibold text-gray-200 mb-3">
              Optional: Vanity Address
            </h3>
            <p className="text-sm text-gray-300">
              Want a custom mint address like{" "}
              <code className="bg-gray-800 px-1.5 py-0.5 rounded text-xs">
                PUMP...xyz
              </code>
              ? Use the Vanity Address tool on the Mint page. Set a prefix/suffix
              and let the CPU mine a matching keypair. This can take seconds to
              minutes depending on length.
            </p>
          </div>
        </div>
      </section>

      {/* Step 6: Bundle Launch */}
      <section className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <span className="w-10 h-10 flex items-center justify-center rounded-full bg-orange-900/30 border border-orange-800 text-orange-400 font-bold text-lg">
            6
          </span>
          <h2 className="text-2xl font-bold text-orange-400">
            Launch with Jito Bundle
          </h2>
        </div>

        <div className="space-y-4 ml-13">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <p className="text-sm text-gray-300 mb-3">
              A Jito Bundle groups all your launch transactions into a single
              atomic operation. Either everything succeeds (pool creation +
              liquidity + snipe buys) or nothing does. This prevents
              front-running.
            </p>
            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-300">
              <li>
                Go to{" "}
                <Link href="/bundle" className="text-blue-400 hover:underline">
                  Bundle / Launch
                </Link>
              </li>
              <li>Select your minted token</li>
              <li>
                Configure liquidity:
                <ul className="list-disc list-inside ml-6 mt-1 text-xs text-gray-400 space-y-1">
                  <li><strong>SOL liquidity:</strong> How much SOL for the pool (e.g., 10 SOL)</li>
                  <li><strong>Token liquidity:</strong> How many tokens to pair (e.g., 50% of supply)</li>
                </ul>
              </li>
              <li>
                Add snipe buys:
                <ul className="list-disc list-inside ml-6 mt-1 text-xs text-gray-400 space-y-1">
                  <li>Select a sub-wallet + amount for each snipe</li>
                  <li>Add 3-5 snipes at different amounts for natural look</li>
                  <li>Example: 0.1 SOL, 0.2 SOL, 0.15 SOL</li>
                </ul>
              </li>
              <li>Set Jito tip (100,000 lamports = ~0.0001 SOL is standard)</li>
              <li>Click &quot;Launch Bundle&quot;</li>
              <li>Wait for confirmation (2-5 seconds typically)</li>
            </ol>
          </div>

          <div className="bg-green-900/20 border border-green-800 rounded-lg p-3">
            <p className="text-green-400 text-sm">
              <strong>After launch:</strong> Your token now has a liquidity pool
              and is tradeable on Raydium/Jupiter. Your snipe wallets hold tokens
              from the initial buys.
            </p>
          </div>
        </div>
      </section>

      {/* Step 7: Distribution */}
      <section className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <span className="w-10 h-10 flex items-center justify-center rounded-full bg-cyan-900/30 border border-cyan-800 text-cyan-400 font-bold text-lg">
            7
          </span>
          <h2 className="text-2xl font-bold text-cyan-400">
            Distribute SOL (Anti-Bubble)
          </h2>
        </div>

        <div className="space-y-4 ml-13">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <p className="text-sm text-gray-300 mb-3">
              To fund wallets for bot trading without creating detectable
              on-chain patterns, use the anti-bubble distribution.
            </p>
            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-300">
              <li>
                Go to{" "}
                <Link
                  href="/distribution"
                  className="text-blue-400 hover:underline"
                >
                  Distribution
                </Link>
              </li>
              <li>Click &quot;Create Plan&quot;</li>
              <li>Select source wallet (the one with SOL)</li>
              <li>Select destination wallets (your sub-wallets)</li>
              <li>Set total amount to distribute</li>
              <li>
                Configure anti-bubble settings:
                <ul className="list-disc list-inside ml-6 mt-1 text-xs text-gray-400 space-y-1">
                  <li><strong>Strategy:</strong> Multi-hop (2-5 hops)</li>
                  <li><strong>Amount variation:</strong> ±10%</li>
                  <li><strong>Timing variation:</strong> 5-60 seconds between transfers</li>
                </ul>
              </li>
              <li>Click &quot;Execute&quot; and watch progress in real-time</li>
            </ol>
          </div>

          <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-3">
            <p className="text-blue-400 text-xs">
              <strong>Resume:</strong> If the distribution is interrupted (server
              crash, network issue), use the &quot;Resume&quot; button. Already
              completed transfers are skipped automatically.
            </p>
          </div>
        </div>
      </section>

      {/* Step 8: Trading Bots */}
      <section className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <span className="w-10 h-10 flex items-center justify-center rounded-full bg-red-900/30 border border-red-800 text-red-400 font-bold text-lg">
            8
          </span>
          <h2 className="text-2xl font-bold text-red-400">
            Run Trading Bots
          </h2>
        </div>

        <div className="space-y-4 ml-13">
          {/* Volume Bot */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <h3 className="font-semibold text-gray-200 mb-3">
              A. Volume Bot — Generate Trading Activity
            </h3>
            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-300">
              <li>
                Go to{" "}
                <Link href="/volume" className="text-blue-400 hover:underline">
                  Volume Bot
                </Link>
              </li>
              <li>Click &quot;Create Task&quot;</li>
              <li>Enter your token mint address</li>
              <li>Select wallets (the ones funded in step 7)</li>
              <li>Set trade size range (e.g., 0.01 - 0.1 SOL)</li>
              <li>Set sell percentage (80-100%)</li>
              <li>Set delay between trades (30-120 seconds)</li>
              <li>Click &quot;Start&quot; — the bot buys and sells automatically</li>
            </ol>
          </div>

          {/* Bumper Bot */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <h3 className="font-semibold text-gray-200 mb-3">
              B. Bumper Bot — Maintain Price Floor
            </h3>
            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-300">
              <li>
                Go to{" "}
                <Link href="/bumper" className="text-blue-400 hover:underline">
                  Bumper Bot
                </Link>
              </li>
              <li>Click &quot;Create Task&quot;</li>
              <li>Enter your token mint address</li>
              <li>Set price threshold (the floor price in SOL)</li>
              <li>Set buy amount per trigger</li>
              <li>Set max buys per hour (controls spending)</li>
              <li>Click &quot;Start&quot; — buys automatically when price drops</li>
            </ol>
          </div>

          {/* Wallet Warmer */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <h3 className="font-semibold text-gray-200 mb-3">
              C. Wallet Warmer — Make Wallets Look Real
            </h3>
            <p className="text-sm text-gray-300 mb-2">
              Run this <strong>before</strong> your launch (1-2 days ahead) to
              give sub-wallets realistic transaction history.
            </p>
            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-300">
              <li>
                Go to{" "}
                <Link href="/warmer" className="text-blue-400 hover:underline">
                  Wallet Warmer
                </Link>
              </li>
              <li>Select wallets to warm</li>
              <li>Set 10-15 actions per wallet</li>
              <li>Set delay range (60-300 seconds)</li>
              <li>Click &quot;Start&quot; — sends small transfers between wallets</li>
            </ol>
          </div>

          {/* Manual Trade */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <h3 className="font-semibold text-gray-200 mb-3">
              D. Manual Trade — One-Off Swaps
            </h3>
            <p className="text-sm text-gray-300">
              Use{" "}
              <Link href="/trade" className="text-blue-400 hover:underline">
                Manual Trade
              </Link>{" "}
              for individual buy/sell swaps through Jupiter. Select wallet, enter
              token mint, amount, and slippage (3-5% recommended). Useful for
              testing or manually managing positions.
            </p>
          </div>
        </div>
      </section>

      {/* Summary */}
      <section className="mb-8">
        <div className="bg-indigo-900/20 border border-indigo-800 rounded-xl p-6">
          <h2 className="text-xl font-bold text-indigo-400 mb-4">
            Complete Launch Checklist
          </h2>
          <div className="space-y-2">
            {[
              "Password set, seed phrase saved in 3 locations",
              "Main wallet created and funded with SOL",
              "5-10 sub-wallets created",
              "RPC endpoint(s) configured and health-checked",
              "Token logo uploaded and pinned to IPFS",
              "Token metadata created and pinned to IPFS",
              "Token minted with correct supply/decimals",
              "Sub-wallets warmed (1-2 days of activity)",
              "SOL distributed to sub-wallets (anti-bubble)",
              "Bundle configured: liquidity + snipe buys + Jito tip",
              "Bundle launched and confirmed",
              "Volume bot running to generate activity",
              "Bumper bot set to maintain price floor",
            ].map((item, idx) => (
              <label
                key={idx}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-900 cursor-pointer text-sm text-gray-300"
              >
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-indigo-500 focus:ring-indigo-500"
                />
                <span>{item}</span>
              </label>
            ))}
          </div>
        </div>
      </section>

      {/* Next Steps */}
      <div className="grid md:grid-cols-2 gap-4">
        <Link
          href="/docs/features"
          className="group block p-4 rounded-lg bg-gray-900 border border-gray-800 hover:border-purple-500 hover:shadow-lg transition-all"
        >
          <h4 className="font-semibold text-purple-400 mb-1 group-hover:translate-x-1 transition-transform">
            Technical Features Docs
          </h4>
          <p className="text-sm text-gray-400">
            Deep dive into each feature&apos;s configuration and parameters
          </p>
        </Link>
        <Link
          href="/docs/security"
          className="group block p-4 rounded-lg bg-gray-900 border border-gray-800 hover:border-red-500 hover:shadow-lg transition-all"
        >
          <h4 className="font-semibold text-red-400 mb-1 group-hover:translate-x-1 transition-transform">
            Security Best Practices
          </h4>
          <p className="text-sm text-gray-400">
            Protect your funds, backups, incident response
          </p>
        </Link>
      </div>
    </div>
  );
}
