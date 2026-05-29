"use client";

import { useState } from "react";
import type { JSX } from "react";
import Link from "next/link";
import {
  ArrowLeftIcon,
  InformationCircleIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/solid";

interface Section {
  id: string;
  title: string;
  content: JSX.Element;
}

export default function FeaturesPage() {
  const [openSection, setOpenSection] = useState<string | null>(
    "token-minting"
  );

  const toggleSection = (id: string) => {
    setOpenSection(openSection === id ? null : id);
  };

  const sections: Section[] = [
    {
      id: "token-minting",
      title: "Token Minting",
      content: (
        <div className="space-y-4">
          <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-3 flex items-center gap-2">
            <InformationCircleIcon className="w-4 h-4 text-blue-400" />
            <p className="text-blue-400 text-sm">
              <strong>Page:</strong>{" "}
              <Link href="/mint" className="underline hover:text-blue-300">
                /mint
              </Link>
            </p>
          </div>

          <h3 className="text-xl font-semibold text-offivex-purple-light">
            Token Creation Process
          </h3>

          <div className="space-y-4">
            <div className="bg-gray-800 rounded-lg p-4">
              <h4 className="text-purple-400 font-semibold mb-3">
                STEP 1: Prepare Metadata
              </h4>
              <ol className="list-decimal list-inside space-y-2 text-gray-300 text-sm">
                <li>
                  <strong>Upload Logo</strong> (PNG/JPG, max 10MB)
                  <ul className="list-disc list-inside ml-6 mt-1 text-xs text-gray-400">
                    <li>Stored locally: data/meme_assets/</li>
                    <li>SHA-256 hash for integrity</li>
                  </ul>
                </li>
                <li>
                  <strong>Create JSON Metadata</strong>
                  <div className="bg-gray-900 rounded p-2 mt-2 font-mono text-xs overflow-x-auto">
                    <pre className="text-gray-300">
                      {`{
  "name": "My Token",
  "symbol": "MTK",
  "description": "...",
  "image": "ipfs://...",    // After pinning
  "attributes": [...]
}`}
                    </pre>
                  </div>
                </li>
                <li>
                  <strong>Pin to IPFS</strong> (optional but recommended)
                  <ul className="list-disc list-inside ml-6 mt-1 text-xs text-gray-400">
                    <li>Pinata/NFT.storage</li>
                    <li>Permanent URI</li>
                  </ul>
                </li>
              </ol>
            </div>

            <div className="bg-gray-800 rounded-lg p-4">
              <h4 className="text-purple-400 font-semibold mb-3">
                STEP 2: Mint the Token
              </h4>
              <div className="space-y-2 text-sm text-gray-300">
                <div className="grid grid-cols-2 gap-2">
                  <div className="font-semibold">Name:</div>
                  <div className="text-gray-400">My Token</div>
                  <div className="font-semibold">Symbol:</div>
                  <div className="text-gray-400">MTK</div>
                  <div className="font-semibold">Decimals:</div>
                  <div className="text-gray-400">9 (0-9)</div>
                  <div className="font-semibold">Supply:</div>
                  <div className="text-gray-400">1,000,000</div>
                  <div className="font-semibold">Metadata URI:</div>
                  <div className="text-gray-400 font-mono text-xs">
                    ipfs://Qm...
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gray-900 rounded-lg p-4">
              <h4 className="text-green-400 font-semibold mb-3">
                What Happens on Mint
              </h4>
              <ol className="list-decimal list-inside space-y-2 text-sm text-gray-300">
                <li>A new mint keypair is generated on Solana</li>
                <li>The mint account is created with your specified decimals</li>
                <li>An Associated Token Account (ATA) is created for the creator wallet</li>
                <li>The full supply is minted to the creator&apos;s ATA</li>
                <li>Metaplex metadata is attached (name, symbol, URI)</li>
                <li>Everything is bundled in a single transaction</li>
              </ol>
              <div className="bg-blue-900/20 border border-blue-800 rounded p-3 mt-3">
                <p className="text-blue-400 text-sm">
                  <strong>Cost:</strong> ~0.015 SOL (rent + fees)
                </p>
              </div>
            </div>
          </div>

          <h3 className="text-xl font-semibold text-offivex-purple-light mt-6">
            Vanity Address
          </h3>
          <div className="bg-yellow-900/20 border border-yellow-800 rounded-lg p-3 mb-3">
            <p className="text-yellow-400 text-sm">
              <strong>Use Case:</strong> Get a &quot;vanity&quot; mint address
              (starts/ends with specific characters)
            </p>
            <p className="text-yellow-300 text-xs mt-1">
              Example: PUMPFun...pump or MEME...meme
            </p>
          </div>

          <div className="bg-gray-800 rounded-lg p-4">
            <h4 className="text-purple-400 font-semibold mb-3">
              Configuration
            </h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Prefix:</span>
                <span className="text-gray-300">PUMP (max 5 chars)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Suffix:</span>
                <span className="text-gray-300">pump (max 5 chars)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Case insensitive:</span>
                <span className="text-green-400">Yes</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Threads:</span>
                <span className="text-gray-300">8 (CPU cores)</span>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "bundle-launch",
      title: "Bundle & Launch",
      content: (
        <div className="space-y-4">
          <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-3 flex items-center gap-2">
            <InformationCircleIcon className="w-4 h-4 text-blue-400" />
            <p className="text-blue-400 text-sm">
              <strong>Page:</strong>{" "}
              <Link href="/bundle" className="underline hover:text-blue-300">
                /bundle
              </Link>
            </p>
          </div>

          <h3 className="text-xl font-semibold text-offivex-purple-light">
            What is a Jito Bundle?
          </h3>
          <p className="text-gray-300">
            A Jito Bundle allows you to submit multiple transactions as a single
            atomic unit. Either all transactions succeed, or none do. This
            protects you from front-running (MEV) and ensures your launch
            happens exactly as planned.
          </p>

          <div className="bg-gray-900 rounded-lg p-4 font-mono text-xs overflow-x-auto">
            <pre className="text-gray-300">
              {`┌─────────────────────────────────────────────────────┐
│          ATOMIC BUNDLE (All or Nothing)             │
├─────────────────────────────────────────────────────┤
│                                                      │
│  Transaction 1: Create Liquidity Pool               │
│  Transaction 2: Add Liquidity SOL + Tokens          │
│  Transaction 3: Snipe Buy Wallet #1 (0.1 SOL)       │
│  Transaction 4: Snipe Buy Wallet #2 (0.2 SOL)       │
│  Transaction 5: Snipe Buy Wallet #3 (0.15 SOL)      │
│  Transaction 6: Tip Jito (0.001 SOL)                │
│                                                      │
│  ✅ All transactions succeed OR                      │
│  ❌ None succeed (rollback)                          │
│                                                      │
└─────────────────────────────────────────────────────┘`}
            </pre>
          </div>

          <div className="grid md:grid-cols-3 gap-3 mt-4">
            <div className="bg-green-900/20 border border-green-800 rounded-lg p-3">
              <h5 className="text-green-400 font-semibold text-sm mb-1">
                No MEV
              </h5>
              <p className="text-gray-300 text-xs">
                Protection against front-running
              </p>
            </div>
            <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-3">
              <h5 className="text-blue-400 font-semibold text-sm mb-1">
                Guaranteed execution
              </h5>
              <p className="text-gray-300 text-xs">
                Transaction atomicity
              </p>
            </div>
            <div className="bg-purple-900/20 border border-purple-800 rounded-lg p-3">
              <h5 className="text-purple-400 font-semibold text-sm mb-1">
                Instant snipes
              </h5>
              <p className="text-gray-300 text-xs">
                Simultaneous buys at launch
              </p>
            </div>
          </div>

          <h3 className="text-xl font-semibold text-offivex-purple-light mt-6">
            How to Launch a Token
          </h3>
          <div className="bg-gray-800 rounded-lg p-4">
            <ol className="list-decimal list-inside space-y-3 text-sm text-gray-300">
              <li>
                <strong>Prepare Your Token</strong>
                <ul className="list-disc list-inside ml-6 mt-1 text-xs text-gray-400 space-y-1">
                  <li>Upload logo in Meme Library</li>
                  <li>Create and pin metadata to IPFS</li>
                  <li>Mint the token with desired supply and decimals</li>
                </ul>
              </li>
              <li>
                <strong>Create Sub-Wallets</strong>
                <ul className="list-disc list-inside ml-6 mt-1 text-xs text-gray-400 space-y-1">
                  <li>Go to Wallets page</li>
                  <li>Create 3-10 sub-wallets for snipe buys</li>
                  <li>Fund each sub-wallet with SOL for the snipe amount</li>
                </ul>
              </li>
              <li>
                <strong>Configure the Bundle</strong>
                <ul className="list-disc list-inside ml-6 mt-1 text-xs text-gray-400 space-y-1">
                  <li>Select the token to launch</li>
                  <li>Set SOL liquidity (e.g., 10 SOL)</li>
                  <li>Set token liquidity (e.g., 50% of supply)</li>
                  <li>Add snipe buys: select wallet + amount for each</li>
                  <li>Set Jito tip (100,000 lamports recommended)</li>
                </ul>
              </li>
              <li>
                <strong>Launch</strong>
                <ul className="list-disc list-inside ml-6 mt-1 text-xs text-gray-400 space-y-1">
                  <li>Click &quot;Launch Bundle&quot;</li>
                  <li>Wait for Jito confirmation (~2-5 seconds)</li>
                  <li>Check status: pending → processing → confirmed</li>
                </ul>
              </li>
            </ol>
          </div>

          <h3 className="text-xl font-semibold text-amber-400 mt-6">
            Bundle Statuses
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-gray-300 border border-gray-700">
              <thead className="bg-gray-800">
                <tr>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Description</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-gray-700">
                  <td className="px-4 py-2 text-yellow-400">pending</td>
                  <td className="px-4 py-2">Bundle submitted, waiting</td>
                </tr>
                <tr className="border-t border-gray-700">
                  <td className="px-4 py-2 text-blue-400">processing</td>
                  <td className="px-4 py-2">Bundle being processed</td>
                </tr>
                <tr className="border-t border-gray-700">
                  <td className="px-4 py-2 text-green-400">confirmed</td>
                  <td className="px-4 py-2">All transactions confirmed</td>
                </tr>
                <tr className="border-t border-gray-700">
                  <td className="px-4 py-2 text-red-400">failed</td>
                  <td className="px-4 py-2">At least one transaction failed</td>
                </tr>
                <tr className="border-t border-gray-700">
                  <td className="px-4 py-2 text-orange-400">timeout</td>
                  <td className="px-4 py-2">Timeout ({`>`} 60s)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ),
    },
    {
      id: "anti-bubble",
      title: "Anti-Bubble Distribution",
      content: (
        <div className="space-y-4">
          <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-3 flex items-center gap-2">
            <InformationCircleIcon className="w-4 h-4 text-blue-400" />
            <p className="text-blue-400 text-sm">
              <strong>Page:</strong>{" "}
              <Link
                href="/distribution"
                className="underline hover:text-blue-300"
              >
                /distribution
              </Link>
            </p>
          </div>

          <h3 className="text-xl font-semibold text-offivex-purple-light">
            Why Anti-Bubble?
          </h3>
          <p className="text-gray-300">
            After launching a token, you need to distribute SOL to sub-wallets
            so they can trade. Naive distributions (same amount, same timing,
            same source) are easily detectable on-chain. Anti-bubble
            distribution uses multi-hop paths, varied amounts, and random timing
            to make the distribution undetectable.
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-red-900/20 border border-red-800 rounded-lg p-4">
              <h4 className="text-red-400 font-semibold mb-3 flex items-center gap-2">
                <ExclamationTriangleIcon className="w-4 h-4" />
                Naive Distribution (Detectable)
              </h4>
              <div className="space-y-2 text-xs text-gray-300">
                <div className="bg-gray-900 p-2 rounded">
                  Creator → Wallet #1 (1 SOL, T+0s)
                </div>
                <div className="bg-gray-900 p-2 rounded">
                  Creator → Wallet #2 (1 SOL, T+1s)
                </div>
                <div className="bg-gray-900 p-2 rounded">
                  Creator → Wallet #3 (1 SOL, T+2s)
                </div>
              </div>
            </div>

            <div className="bg-green-900/20 border border-green-800 rounded-lg p-4">
              <h4 className="text-green-400 font-semibold mb-3 flex items-center gap-2">
                <CheckCircleIcon className="w-4 h-4" />
                Anti-Bubble Distribution
              </h4>
              <div className="space-y-2 text-xs text-gray-300">
                <div className="bg-gray-900 p-2 rounded">
                  Creator → Hop #1 → Hop #2 → Wallet #1
                  <br />
                  <span className="text-gray-500">
                    (0.97 SOL, T+0s → 1.03 SOL, T+15s → 0.89 SOL, T+38s)
                  </span>
                </div>
                <div className="bg-gray-900 p-2 rounded">
                  Creator → Hop #3 → Wallet #2
                  <br />
                  <span className="text-gray-500">
                    (1.12 SOL, T+7s → 0.94 SOL, T+29s)
                  </span>
                </div>
              </div>
            </div>
          </div>

          <h3 className="text-xl font-semibold text-offivex-purple-light mt-6">
            How to Use Distribution
          </h3>
          <div className="bg-gray-800 rounded-lg p-4">
            <ol className="list-decimal list-inside space-y-3 text-sm text-gray-300">
              <li>
                <strong>Create a Distribution Plan</strong>
                <ul className="list-disc list-inside ml-6 mt-1 text-xs text-gray-400 space-y-1">
                  <li>Select source wallet (must have SOL)</li>
                  <li>Select destination wallets (sub-wallets)</li>
                  <li>Set total amount to distribute</li>
                  <li>Choose strategy: &quot;direct&quot; or &quot;multi-hop&quot;</li>
                </ul>
              </li>
              <li>
                <strong>Configure Anti-Bubble Settings</strong>
                <ul className="list-disc list-inside ml-6 mt-1 text-xs text-gray-400 space-y-1">
                  <li>Hops per path: 2-5 (more hops = harder to trace)</li>
                  <li>Amount variation: ±10% (randomizes each transfer)</li>
                  <li>Timing variation: 5-60s delay between transfers</li>
                  <li>Batch size: how many transfers per batch</li>
                </ul>
              </li>
              <li>
                <strong>Execute</strong>
                <ul className="list-disc list-inside ml-6 mt-1 text-xs text-gray-400 space-y-1">
                  <li>Click &quot;Execute&quot; to start the distribution</li>
                  <li>Track progress in real-time</li>
                  <li>If interrupted, use &quot;Resume&quot; to continue</li>
                </ul>
              </li>
            </ol>
          </div>

          <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4">
            <p className="text-blue-300 text-sm mb-2">
              <strong>Resume:</strong> If execution fails mid-way, use the
              Resume button. Already completed transfers are automatically
              skipped.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "volume-bot",
      title: "Volume Bot",
      content: (
        <div className="space-y-4">
          <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-3 flex items-center gap-2">
            <InformationCircleIcon className="w-4 h-4 text-blue-400" />
            <p className="text-blue-400 text-sm">
              <strong>Page:</strong>{" "}
              <Link href="/volume" className="underline hover:text-blue-300">
                /volume
              </Link>
            </p>
          </div>

          <h3 className="text-xl font-semibold text-offivex-purple-light">
            What is the Volume Bot?
          </h3>
          <p className="text-gray-300">
            The Volume Bot automatically generates trading volume on your token
            by performing buy and sell cycles across multiple wallets. This
            creates organic-looking trading activity that attracts other traders
            and improves your token&apos;s visibility on DEX aggregators and trackers.
          </p>

          <h3 className="text-xl font-semibold text-offivex-purple-light mt-6">
            How to Use
          </h3>
          <div className="bg-gray-800 rounded-lg p-4">
            <ol className="list-decimal list-inside space-y-3 text-sm text-gray-300">
              <li>
                <strong>Create a Volume Task</strong>
                <ul className="list-disc list-inside ml-6 mt-1 text-xs text-gray-400 space-y-1">
                  <li>Enter the token mint address</li>
                  <li>Select wallets to use for trading (3-10 recommended)</li>
                  <li>Set min/max SOL per trade (e.g., 0.01 - 0.1 SOL)</li>
                  <li>Set sell percentage (how much of each buy to sell back)</li>
                  <li>Set delay range between trades (e.g., 30-120 seconds)</li>
                </ul>
              </li>
              <li>
                <strong>Fund Your Wallets</strong>
                <ul className="list-disc list-inside ml-6 mt-1 text-xs text-gray-400 space-y-1">
                  <li>Each wallet needs enough SOL for trades + fees</li>
                  <li>Use Distribution to fund wallets with anti-bubble</li>
                </ul>
              </li>
              <li>
                <strong>Start the Bot</strong>
                <ul className="list-disc list-inside ml-6 mt-1 text-xs text-gray-400 space-y-1">
                  <li>Click &quot;Start&quot; on the task</li>
                  <li>The bot cycles through wallets automatically</li>
                  <li>Monitor stats: total trades, volume generated, PnL</li>
                </ul>
              </li>
              <li>
                <strong>Stop When Done</strong>
                <ul className="list-disc list-inside ml-6 mt-1 text-xs text-gray-400 space-y-1">
                  <li>Click &quot;Stop&quot; to gracefully halt the bot</li>
                  <li>Remaining tokens can be sold manually via Trade page</li>
                </ul>
              </li>
            </ol>
          </div>

          <div className="grid md:grid-cols-2 gap-4 mt-4">
            <div className="bg-gray-800 rounded-lg p-4">
              <h4 className="text-purple-400 font-semibold mb-2 text-sm">
                Configuration Parameters
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Min SOL per trade:</span>
                  <span className="text-gray-300">0.01 SOL</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Max SOL per trade:</span>
                  <span className="text-gray-300">0.1 SOL</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Sell percentage:</span>
                  <span className="text-gray-300">80-100%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Delay range:</span>
                  <span className="text-gray-300">30-120 seconds</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Slippage:</span>
                  <span className="text-gray-300">1-5%</span>
                </div>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-4">
              <h4 className="text-green-400 font-semibold mb-2 text-sm">
                Stats Tracked
              </h4>
              <ul className="space-y-1 text-sm text-gray-300">
                <li className="flex items-center gap-2">
                  <CheckCircleIcon className="w-3 h-3 text-green-400" />
                  Total number of trades
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircleIcon className="w-3 h-3 text-green-400" />
                  Total volume in SOL
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircleIcon className="w-3 h-3 text-green-400" />
                  Buy/sell ratio
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircleIcon className="w-3 h-3 text-green-400" />
                  Profit/loss per wallet
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircleIcon className="w-3 h-3 text-green-400" />
                  Recent trade history
                </li>
              </ul>
            </div>
          </div>

          <div className="bg-yellow-900/20 border border-yellow-800 rounded-lg p-3">
            <p className="text-yellow-400 text-sm">
              <strong>Tip:</strong> Start with small amounts on a test token
              before running on your main token. Monitor slippage carefully
              on low-liquidity tokens.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "bumper-bot",
      title: "Bumper Bot",
      content: (
        <div className="space-y-4">
          <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-3 flex items-center gap-2">
            <InformationCircleIcon className="w-4 h-4 text-blue-400" />
            <p className="text-blue-400 text-sm">
              <strong>Page:</strong>{" "}
              <Link href="/bumper" className="underline hover:text-blue-300">
                /bumper
              </Link>
            </p>
          </div>

          <h3 className="text-xl font-semibold text-offivex-purple-light">
            What is the Bumper Bot?
          </h3>
          <p className="text-gray-300">
            The Bumper Bot monitors your token&apos;s price and automatically
            performs buy orders when the price drops below a threshold you set.
            This creates a &quot;price floor&quot; that prevents the token from
            dumping too far and maintains holder confidence.
          </p>

          <h3 className="text-xl font-semibold text-offivex-purple-light mt-6">
            How to Use
          </h3>
          <div className="bg-gray-800 rounded-lg p-4">
            <ol className="list-decimal list-inside space-y-3 text-sm text-gray-300">
              <li>
                <strong>Create a Bumper Task</strong>
                <ul className="list-disc list-inside ml-6 mt-1 text-xs text-gray-400 space-y-1">
                  <li>Enter the token mint address</li>
                  <li>Select wallets for buying (3-5 recommended)</li>
                  <li>Set price threshold (in SOL) — the &quot;floor price&quot;</li>
                  <li>Set buy amount per trigger (e.g., 0.05 SOL)</li>
                  <li>Set max buys per hour (to control spending)</li>
                </ul>
              </li>
              <li>
                <strong>Start the Bot</strong>
                <ul className="list-disc list-inside ml-6 mt-1 text-xs text-gray-400 space-y-1">
                  <li>Click &quot;Start&quot; to begin monitoring</li>
                  <li>The bot checks the price periodically</li>
                  <li>When price drops below threshold, it buys automatically</li>
                  <li>Buys are rotated across your selected wallets</li>
                </ul>
              </li>
              <li>
                <strong>Monitor and Adjust</strong>
                <ul className="list-disc list-inside ml-6 mt-1 text-xs text-gray-400 space-y-1">
                  <li>Watch the buy history and remaining budget</li>
                  <li>Stop and recreate if you need to change the threshold</li>
                </ul>
              </li>
            </ol>
          </div>

          <div className="bg-gray-800 rounded-lg p-4 mt-4">
            <h4 className="text-purple-400 font-semibold mb-2 text-sm">
              Configuration Parameters
            </h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Price threshold:</span>
                <span className="text-gray-300">e.g., 0.000001 SOL</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Buy amount per trigger:</span>
                <span className="text-gray-300">0.01 - 1 SOL</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Max buys per hour:</span>
                <span className="text-gray-300">1-20</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Price check interval:</span>
                <span className="text-gray-300">~30 seconds</span>
              </div>
            </div>
          </div>

          <div className="bg-yellow-900/20 border border-yellow-800 rounded-lg p-3">
            <p className="text-yellow-400 text-sm">
              <strong>Important:</strong> The bumper bot uses Jupiter price feeds
              to monitor token prices. Ensure your wallets have enough SOL to
              cover all potential buys within the max buys/hour limit.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "warmer-bot",
      title: "Wallet Warmer",
      content: (
        <div className="space-y-4">
          <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-3 flex items-center gap-2">
            <InformationCircleIcon className="w-4 h-4 text-blue-400" />
            <p className="text-blue-400 text-sm">
              <strong>Page:</strong>{" "}
              <Link href="/warmer" className="underline hover:text-blue-300">
                /warmer
              </Link>
            </p>
          </div>

          <h3 className="text-xl font-semibold text-offivex-purple-light">
            What is Wallet Warming?
          </h3>
          <p className="text-gray-300">
            Fresh wallets with no transaction history look suspicious on-chain.
            The Wallet Warmer generates realistic activity (small SOL transfers
            between wallets) to make them appear like real, active wallets before
            using them for trading or sniping.
          </p>

          <h3 className="text-xl font-semibold text-offivex-purple-light mt-6">
            How to Use
          </h3>
          <div className="bg-gray-800 rounded-lg p-4">
            <ol className="list-decimal list-inside space-y-3 text-sm text-gray-300">
              <li>
                <strong>Create a Warmer Task</strong>
                <ul className="list-disc list-inside ml-6 mt-1 text-xs text-gray-400 space-y-1">
                  <li>Select wallets to warm (your sub-wallets)</li>
                  <li>Set number of actions per wallet (5-20 recommended)</li>
                  <li>Set delay range between actions (60-300 seconds)</li>
                </ul>
              </li>
              <li>
                <strong>Start the Warmer</strong>
                <ul className="list-disc list-inside ml-6 mt-1 text-xs text-gray-400 space-y-1">
                  <li>Click &quot;Start&quot; to begin warming</li>
                  <li>The warmer sends small SOL transfers between selected wallets</li>
                  <li>Each wallet accumulates on-chain transaction history</li>
                  <li>Progress bar shows completion for each wallet</li>
                </ul>
              </li>
              <li>
                <strong>Wait for Completion</strong>
                <ul className="list-disc list-inside ml-6 mt-1 text-xs text-gray-400 space-y-1">
                  <li>The warmer stops automatically when all actions complete</li>
                  <li>Wallets are now &quot;warmed&quot; and ready for trading</li>
                </ul>
              </li>
            </ol>
          </div>

          <div className="bg-green-900/20 border border-green-800 rounded-lg p-4 mt-4">
            <h4 className="text-green-400 font-semibold mb-2 text-sm">
              Best Practices
            </h4>
            <ul className="space-y-1 text-sm text-gray-300">
              <li className="flex items-center gap-2">
                <CheckCircleIcon className="w-3 h-3 text-green-400" />
                Warm wallets 1-2 days before using them for launch
              </li>
              <li className="flex items-center gap-2">
                <CheckCircleIcon className="w-3 h-3 text-green-400" />
                Use varied delay ranges for more natural-looking activity
              </li>
              <li className="flex items-center gap-2">
                <CheckCircleIcon className="w-3 h-3 text-green-400" />
                10-15 actions per wallet is usually sufficient
              </li>
              <li className="flex items-center gap-2">
                <CheckCircleIcon className="w-3 h-3 text-green-400" />
                Each warming action costs ~0.000005 SOL in fees
              </li>
            </ul>
          </div>
        </div>
      ),
    },
    {
      id: "manual-trade",
      title: "Manual Trade",
      content: (
        <div className="space-y-4">
          <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-3 flex items-center gap-2">
            <InformationCircleIcon className="w-4 h-4 text-blue-400" />
            <p className="text-blue-400 text-sm">
              <strong>Page:</strong>{" "}
              <Link href="/trade" className="underline hover:text-blue-300">
                /trade
              </Link>
            </p>
          </div>

          <h3 className="text-xl font-semibold text-offivex-purple-light">
            What is Manual Trade?
          </h3>
          <p className="text-gray-300">
            The Manual Trade page allows you to execute individual token swaps
            (buy or sell) through Jupiter Aggregator. Use this for one-off trades,
            testing, or manually managing positions.
          </p>

          <h3 className="text-xl font-semibold text-offivex-purple-light mt-6">
            How to Use
          </h3>
          <div className="bg-gray-800 rounded-lg p-4">
            <ol className="list-decimal list-inside space-y-3 text-sm text-gray-300">
              <li>
                <strong>Select Trade Direction</strong>
                <ul className="list-disc list-inside ml-6 mt-1 text-xs text-gray-400 space-y-1">
                  <li><strong>Buy:</strong> SOL → Token</li>
                  <li><strong>Sell:</strong> Token → SOL</li>
                </ul>
              </li>
              <li>
                <strong>Configure the Trade</strong>
                <ul className="list-disc list-inside ml-6 mt-1 text-xs text-gray-400 space-y-1">
                  <li>Select wallet to trade from</li>
                  <li>Enter the token mint address</li>
                  <li>Enter amount (in SOL for buys, tokens for sells)</li>
                  <li>Set slippage tolerance (1%, 3%, 5%, 10%, or custom)</li>
                </ul>
              </li>
              <li>
                <strong>Execute</strong>
                <ul className="list-disc list-inside ml-6 mt-1 text-xs text-gray-400 space-y-1">
                  <li>Click &quot;Execute Trade&quot;</li>
                  <li>Trade is routed through Jupiter for best price</li>
                  <li>Transaction signature is displayed on success</li>
                </ul>
              </li>
            </ol>
          </div>

          <div className="bg-yellow-900/20 border border-yellow-800 rounded-lg p-3 mt-4">
            <p className="text-yellow-400 text-sm">
              <strong>Slippage:</strong> Low slippage (1%) may cause trades to fail on
              volatile tokens. High slippage (10%) protects against failure but may
              result in worse prices. 3-5% is recommended for most tokens.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "meme-library",
      title: "Meme Library",
      content: (
        <div className="space-y-4">
          <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-3 flex items-center gap-2">
            <InformationCircleIcon className="w-4 h-4 text-blue-400" />
            <p className="text-blue-400 text-sm">
              <strong>Page:</strong>{" "}
              <Link href="/meme-library" className="underline hover:text-blue-300">
                /meme-library
              </Link>
            </p>
          </div>

          <h3 className="text-xl font-semibold text-offivex-purple-light">
            What is the Meme Library?
          </h3>
          <p className="text-gray-300">
            The Meme Library is your asset management system for token branding.
            Upload logos, banners, and other images, then create and pin metadata
            JSON to IPFS — all from within Offivex.
          </p>

          <h3 className="text-xl font-semibold text-offivex-purple-light mt-6">
            How to Use
          </h3>
          <div className="bg-gray-800 rounded-lg p-4">
            <ol className="list-decimal list-inside space-y-3 text-sm text-gray-300">
              <li>
                <strong>Upload Assets</strong>
                <ul className="list-disc list-inside ml-6 mt-1 text-xs text-gray-400 space-y-1">
                  <li>Click &quot;Upload&quot; to add image files (PNG, JPG, GIF)</li>
                  <li>Max file size: 10MB</li>
                  <li>Files are stored locally in data/meme_assets/</li>
                  <li>SHA-256 hash is computed for integrity verification</li>
                </ul>
              </li>
              <li>
                <strong>Pin Assets to IPFS</strong>
                <ul className="list-disc list-inside ml-6 mt-1 text-xs text-gray-400 space-y-1">
                  <li>Click &quot;Pin&quot; on an asset to upload it to IPFS via Pinata</li>
                  <li>You get a permanent IPFS URI (ipfs://Qm...)</li>
                  <li>This URI is used in your token metadata</li>
                </ul>
              </li>
              <li>
                <strong>Create Metadata</strong>
                <ul className="list-disc list-inside ml-6 mt-1 text-xs text-gray-400 space-y-1">
                  <li>Create JSON metadata following Metaplex standard</li>
                  <li>Set name, symbol, description, and link to pinned image</li>
                  <li>Add optional attributes</li>
                </ul>
              </li>
              <li>
                <strong>Pin Metadata JSON</strong>
                <ul className="list-disc list-inside ml-6 mt-1 text-xs text-gray-400 space-y-1">
                  <li>Pin the metadata JSON to IPFS</li>
                  <li>Use the resulting URI when minting your token</li>
                </ul>
              </li>
            </ol>
          </div>

          <div className="bg-green-900/20 border border-green-800 rounded-lg p-3 mt-4">
            <p className="text-green-400 text-sm">
              <strong>Tip:</strong> Prepare your logo and metadata before minting.
              A professional logo (square, 512x512 or 1024x1024) makes your token
              look more legitimate on DEX trackers like DexScreener.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "random-profiles",
      title: "Random Profiles",
      content: (
        <div className="space-y-4">
          <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-3 flex items-center gap-2">
            <InformationCircleIcon className="w-4 h-4 text-blue-400" />
            <p className="text-blue-400 text-sm">
              <strong>Page:</strong>{" "}
              <Link href="/profiles" className="underline hover:text-blue-300">
                /profiles
              </Link>
            </p>
          </div>

          <h3 className="text-xl font-semibold text-offivex-purple-light">
            What are Random Profiles?
          </h3>
          <p className="text-gray-300">
            Random Profiles generate realistic-looking identities for your
            wallets. While Solana wallets don&apos;t have usernames on-chain, some
            DEX platforms and tools display wallet names. Assigning random profiles
            makes your wallet network appear more natural and diverse.
          </p>

          <h3 className="text-xl font-semibold text-offivex-purple-light mt-6">
            How to Use
          </h3>
          <div className="bg-gray-800 rounded-lg p-4">
            <ol className="list-decimal list-inside space-y-3 text-sm text-gray-300">
              <li>
                <strong>Preview</strong> — See a randomly generated profile before applying
              </li>
              <li>
                <strong>Randomize Single</strong> — Generate a random profile for one wallet
              </li>
              <li>
                <strong>Randomize Batch</strong> — Generate profiles for multiple wallets at once
              </li>
              <li>
                <strong>Edit</strong> — Manually adjust any profile if needed
              </li>
              <li>
                <strong>Delete</strong> — Remove a profile from a wallet
              </li>
            </ol>
          </div>
        </div>
      ),
    },
    {
      id: "monitoring",
      title: "Real-Time Monitoring",
      content: (
        <div className="space-y-4">
          <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-3 flex items-center gap-2">
            <InformationCircleIcon className="w-4 h-4 text-blue-400" />
            <p className="text-blue-400 text-sm">
              <strong>Page:</strong>{" "}
              <Link href="/monitor" className="underline hover:text-blue-300">
                /monitor
              </Link>
            </p>
          </div>

          <h3 className="text-xl font-semibold text-offivex-purple-light">
            What is the Monitor?
          </h3>
          <p className="text-gray-300">
            The Monitor provides real-time transaction tracking via WebSocket.
            Subscribe to wallet addresses and receive instant notifications when
            transactions occur on-chain.
          </p>

          <h3 className="text-xl font-semibold text-offivex-purple-light mt-6">
            How to Use
          </h3>
          <div className="bg-gray-800 rounded-lg p-4">
            <ol className="list-decimal list-inside space-y-3 text-sm text-gray-300">
              <li>
                <strong>Subscribe to Addresses</strong>
                <ul className="list-disc list-inside ml-6 mt-1 text-xs text-gray-400 space-y-1">
                  <li>Enter a Solana address to monitor</li>
                  <li>Or subscribe to your own wallet addresses</li>
                  <li>Multiple subscriptions supported simultaneously</li>
                </ul>
              </li>
              <li>
                <strong>Watch Transactions</strong>
                <ul className="list-disc list-inside ml-6 mt-1 text-xs text-gray-400 space-y-1">
                  <li>WebSocket connection streams events in real-time</li>
                  <li>See incoming/outgoing transfers as they happen</li>
                  <li>Transaction details include signature, amount, and status</li>
                </ul>
              </li>
              <li>
                <strong>Manage Subscriptions</strong>
                <ul className="list-disc list-inside ml-6 mt-1 text-xs text-gray-400 space-y-1">
                  <li>View all active subscriptions</li>
                  <li>Unsubscribe from addresses you no longer need to monitor</li>
                </ul>
              </li>
            </ol>
          </div>

          <div className="bg-gray-800 rounded-lg p-4 mt-4">
            <h4 className="text-purple-400 font-semibold mb-2 text-sm">
              WebSocket Connection
            </h4>
            <div className="bg-gray-900 rounded p-3 font-mono text-xs overflow-x-auto">
              <pre className="text-gray-300">
                {`// WebSocket endpoint
ws://localhost:3001/ws/monitor

// Requires authentication (unlock first)
// Events are streamed as JSON messages`}
              </pre>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "rpc-config",
      title: "RPC Configuration",
      content: (
        <div className="space-y-4">
          <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-3 flex items-center gap-2">
            <InformationCircleIcon className="w-4 h-4 text-blue-400" />
            <p className="text-blue-400 text-sm">
              <strong>Page:</strong>{" "}
              <Link href="/settings" className="underline hover:text-blue-300">
                /settings
              </Link>
            </p>
          </div>

          <h3 className="text-xl font-semibold text-offivex-purple-light">
            What is RPC Configuration?
          </h3>
          <p className="text-gray-300">
            RPC (Remote Procedure Call) endpoints are how Offivex communicates
            with the Solana blockchain. You can configure multiple endpoints for
            redundancy and load balancing. If one endpoint goes down, Offivex
            automatically fails over to the next healthy one.
          </p>

          <h3 className="text-xl font-semibold text-offivex-purple-light mt-6">
            How to Manage RPC Endpoints
          </h3>
          <div className="bg-gray-800 rounded-lg p-4">
            <ol className="list-decimal list-inside space-y-3 text-sm text-gray-300">
              <li>
                <strong>Add an Endpoint</strong>
                <ul className="list-disc list-inside ml-6 mt-1 text-xs text-gray-400 space-y-1">
                  <li>Enter a name (e.g., &quot;QuickNode Mainnet&quot;)</li>
                  <li>Enter the HTTP URL</li>
                  <li>Optionally enter the WebSocket URL</li>
                  <li>Set weight (higher = more traffic)</li>
                </ul>
              </li>
              <li>
                <strong>Health Check</strong>
                <ul className="list-disc list-inside ml-6 mt-1 text-xs text-gray-400 space-y-1">
                  <li>Click &quot;Health Check&quot; to test all endpoints</li>
                  <li>Shows latency in milliseconds for each</li>
                  <li>Unhealthy endpoints are automatically skipped</li>
                </ul>
              </li>
              <li>
                <strong>Toggle Active/Inactive</strong>
                <ul className="list-disc list-inside ml-6 mt-1 text-xs text-gray-400 space-y-1">
                  <li>Disable endpoints without deleting them</li>
                  <li>Useful for maintenance or testing</li>
                </ul>
              </li>
            </ol>
          </div>

          <div className="bg-gray-800 rounded-lg p-4 mt-4">
            <h4 className="text-purple-400 font-semibold mb-2 text-sm">
              Recommended RPC Providers
            </h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between p-2 bg-gray-900 rounded">
                <span className="text-gray-300">QuickNode</span>
                <span className="text-gray-400 text-xs">Low latency, reliable</span>
              </div>
              <div className="flex justify-between p-2 bg-gray-900 rounded">
                <span className="text-gray-300">Helius</span>
                <span className="text-gray-400 text-xs">Solana-focused, good free tier</span>
              </div>
              <div className="flex justify-between p-2 bg-gray-900 rounded">
                <span className="text-gray-300">Alchemy</span>
                <span className="text-gray-400 text-xs">Multi-chain, good dashboard</span>
              </div>
              <div className="flex justify-between p-2 bg-gray-900 rounded">
                <span className="text-gray-300">Solana Public RPC</span>
                <span className="text-gray-400 text-xs">Free but rate-limited</span>
              </div>
            </div>
          </div>

          <div className="bg-green-900/20 border border-green-800 rounded-lg p-4 mt-4">
            <h4 className="text-green-400 font-semibold mb-2 text-sm">
              Connection Pooling
            </h4>
            <p className="text-gray-300 text-sm">
              Offivex automatically pools and caches RPC connections with a 10-minute
              TTL. When using trading bots, the fast round-robin selection skips
              health checks for lower latency. Unhealthy endpoints are automatically
              evicted and recreated on the next request.
            </p>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="max-w-5xl mx-auto px-6 pt-12 pb-24">
      <div className="mb-8">
        <Link
          href="/docs"
          className="inline-flex items-center text-offivex-purple-light hover:text-offivex-purple-light mb-4 transition-all hover:gap-3 gap-2 focus:outline-none focus:ring-2 focus:ring-offivex-purple rounded-lg px-2 py-1"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back to Documentation
        </Link>
        <h1 className="text-4xl font-bold mb-2">
          Complete Features Documentation
        </h1>
        <p className="text-gray-400 text-lg">
          Token minting, Jito bundles, trading bots, distribution and more
        </p>
      </div>

      <div className="mb-8 p-4 rounded-lg border border-offivex-purple/30 bg-offivex-purple/[0.05]">
        <p className="text-sm text-gray-300 leading-relaxed">
          <strong className="text-offivex-purple-light">
            Looking for one feature at a time?
          </strong>{" "}
          This page is the long-form deep dive. For a focused walkthrough of
          a single feature with its config knobs and failure modes, see the{" "}
          <Link
            href="/docs#feature-reference"
            className="text-offivex-purple-light underline"
          >
            per-feature reference pages
          </Link>
          .
        </p>
      </div>

      <div className="space-y-3">
        {sections.map((section) => (
          <div
            key={section.id}
            className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden"
          >
            <button
              onClick={() => toggleSection(section.id)}
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-800 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-offivex-purple"
            >
              <h2 className="text-xl font-semibold text-left">
                {section.title}
              </h2>
              <svg
                className={`w-6 h-6 text-gray-400 transition-transform duration-300 ${
                  openSection === section.id ? "rotate-180" : ""
                }`}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path d="M19 9l-7 7-7-7"></path>
              </svg>
            </button>
            {openSection === section.id && (
              <div className="px-6 py-4 border-t border-gray-800 bg-gray-900/50">
                {section.content}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Navigation */}
      <div className="mt-12 pt-8 border-t border-gray-800">
        <h3 className="text-lg font-semibold mb-4">Related Documentation</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <Link
            href="/docs/user-guide"
            className="group block p-4 rounded-lg bg-gray-900 border border-gray-800 hover:border-blue-500 hover:shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <h4 className="font-semibold text-blue-400 mb-1 group-hover:translate-x-1 transition-transform">
              User Guide
            </h4>
            <p className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors">
              Installation, first steps, wallet management
            </p>
          </Link>
          <Link
            href="/docs/security"
            className="group block p-4 rounded-lg bg-gray-900 border border-gray-800 hover:border-red-500 hover:shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            <h4 className="font-semibold text-red-400 mb-1 group-hover:translate-x-1 transition-transform">
              Security & Best Practices
            </h4>
            <p className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors">
              Key protection, backups, recovery
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
