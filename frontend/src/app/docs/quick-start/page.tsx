"use client";

import Link from "next/link";
import {
  ArrowLeftIcon,
  RocketLaunchIcon,
  FireIcon,
  WalletIcon,
  DocumentTextIcon,
  KeyIcon,
  FlagIcon,
  ExclamationCircleIcon,
  CheckCircleIcon,
  ShieldCheckIcon,
  BookOpenIcon
} from "@heroicons/react/24/solid";

export default function QuickStartPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 pt-12 pb-24">
      <div className="mb-6">
        <Link
          href="/docs"
          className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-all hover:gap-3 focus:outline-none focus:ring-2 focus:ring-offivex-purple rounded-lg px-2 py-1"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back to Documentation
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-2">
        <RocketLaunchIcon className="w-8 h-8 text-green-400 drop-shadow-lg" />
        <h1 className="text-3xl font-bold">OFFIVEX - Quick Start Guide</h1>
      </div>
      <p className="text-gray-400 mb-8">Get started in 5 minutes</p>

      {/* Cross-link to deeper docs */}
      <div className="mb-8 p-4 rounded-lg border border-offivex-purple/30 bg-offivex-purple/[0.05]">
        <p className="text-sm text-gray-300 leading-relaxed">
          <strong className="text-offivex-purple-light">Want depth?</strong>{" "}
          Once you&rsquo;ve got the basics from this page, the{" "}
          <Link href="/docs/tutorial" className="text-offivex-purple-light underline">
            Master Tutorial
          </Link>{" "}
          walks you through every step of a real launch (18 steps), and the{" "}
          <Link href="/docs#feature-reference" className="text-offivex-purple-light underline">
            Feature reference
          </Link>{" "}
          has one focused page per sidebar entry.
        </p>
      </div>

      {/* Installation */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <RocketLaunchIcon className="w-6 h-6 text-green-400" />
          <h2 className="text-2xl font-semibold text-green-400">1. Installation (2 min)</h2>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-4">
          <pre className="text-sm text-gray-300 overflow-x-auto">
            <code>{`# Clone
git clone https://github.com/your-repo/offivex.git && cd offivex

# Configure
cp .env.example .env

# Backend
cd backend && cargo build --workspace

# Frontend
cd ../frontend && npm install`}</code>
          </pre>
        </div>
      </section>

      {/* Launch */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <FireIcon className="w-6 h-6 text-blue-400" />
          <h2 className="text-2xl font-semibold text-blue-400">2. Launch (1 min)</h2>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-4">
          <pre className="text-sm text-gray-300 overflow-x-auto">
            <code>{`# Terminal 1 - Backend
cd backend && cargo run -p offivex-server

# Terminal 2 - Frontend
cd frontend && npm run dev`}</code>
          </pre>
        </div>
      </section>

      {/* First Wallet */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <WalletIcon className="w-6 h-6 text-purple-400" />
          <h2 className="text-2xl font-semibold text-purple-400">3. First Wallet (2 min)</h2>
        </div>
        <ol className="list-decimal list-inside space-y-2 text-gray-300 ml-4">
          <li>Open <code className="bg-gray-800 px-2 py-1 rounded text-sm">http://localhost:3000</code></li>
          <li>Create password</li>
          <li className="flex items-center gap-2">
            <ExclamationCircleIcon className="w-4 h-4 text-yellow-400" />
            <span className="text-yellow-400 font-semibold">SAVE the 12 words displayed</span>
          </li>
          <li>Create wallet</li>
          <li className="flex items-center gap-2">
            <CheckCircleIcon className="w-4 h-4 text-green-400" />
            <span className="text-green-400">Ready!</span>
          </li>
        </ol>
      </section>

      <hr className="border-gray-800 my-8" />

      {/* Command Reference */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <DocumentTextIcon className="w-6 h-6 text-gray-400" />
          <h2 className="text-2xl font-semibold">Command Reference</h2>
        </div>

        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <div>
            <h3 className="text-lg font-semibold mb-3 text-gray-200">Backend</h3>
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <pre className="text-sm text-gray-300 overflow-x-auto">
                <code>{`# Build
cargo build --workspace

# Run
cargo run -p offivex-server

# Tests
cargo test --workspace

# Release
cargo build --workspace --release`}</code>
              </pre>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3 text-gray-200">Frontend</h3>
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <pre className="text-sm text-gray-300 overflow-x-auto">
                <code>{`# Install
npm install

# Dev
npm run dev

# Build
npm run build

# Lint
npm run lint`}</code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* API Endpoints */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <KeyIcon className="w-6 h-6 text-offivex-purple-light" />
          <h2 className="text-2xl font-semibold">Essential API Endpoints</h2>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <pre className="text-sm text-gray-300 overflow-x-auto">
            <code>{`# Health check
curl http://127.0.0.1:3001/api/v1/health

# Setup password (first time)
curl -X POST http://127.0.0.1:3001/api/v1/auth/setup \\
  -H "Content-Type: application/json" \\
  -d '{"password":"your-password"}'

# Unlock
curl -X POST http://127.0.0.1:3001/api/v1/auth/unlock \\
  -H "Content-Type: application/json" \\
  -d '{"password":"your-password"}'

# Create wallet
curl -X POST http://127.0.0.1:3001/api/v1/wallets \\
  -H "Content-Type: application/json" \\
  -d '{"name":"My First Wallet"}'

# List wallets
curl http://127.0.0.1:3001/api/v1/wallets

# Get balance
curl http://127.0.0.1:3001/api/v1/wallets/{wallet-id}/balance

# Get seed phrase
curl http://127.0.0.1:3001/api/v1/auth/seed-phrase`}</code>
          </pre>
        </div>
      </section>

      {/* Use Cases */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <FlagIcon className="w-6 h-6 text-purple-400" />
          <h2 className="text-2xl font-semibold">Quick Use Cases</h2>
        </div>

        <div className="space-y-4">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-3 text-offivex-purple-light">Create and Launch a Token</h3>
            <ol className="list-decimal list-inside space-y-1 text-gray-300 text-sm ml-4">
              <li>Upload logo → <Link href="/meme-library" className="text-blue-400 hover:underline">/meme-library</Link></li>
              <li>Create metadata → /meme-library/metadata</li>
              <li>Mint token → <Link href="/mint" className="text-blue-400 hover:underline">/mint</Link></li>
              <li>Create bundle → <Link href="/bundle" className="text-blue-400 hover:underline">/bundle</Link> (liquidity + snipes)</li>
              <li>Monitor → <Link href="/monitor" className="text-blue-400 hover:underline">/monitor</Link></li>
            </ol>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-3 text-offivex-purple-light">Anti-Bubble Distribution</h3>
            <ol className="list-decimal list-inside space-y-1 text-gray-300 text-sm ml-4">
              <li>Create wallets (1 parent + 10 subs)</li>
              <li>Plan distribution → <Link href="/distribution" className="text-blue-400 hover:underline">/distribution</Link>
                <ul className="list-disc list-inside ml-6 mt-1 space-y-1 text-gray-400">
                  <li>Multi-hop: 3 hops</li>
                  <li>Vary amounts: ±10%</li>
                  <li>Vary timing: 5-60s</li>
                </ul>
              </li>
              <li>Execute</li>
              <li>Monitor progress</li>
            </ol>
          </div>
        </div>
      </section>

      {/* Troubleshooting */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <ExclamationCircleIcon className="w-6 h-6 text-red-400" />
          <h2 className="text-2xl font-semibold">Quick Troubleshooting</h2>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-800">
              <tr>
                <th className="text-left p-3 text-gray-300">Problem</th>
                <th className="text-left p-3 text-gray-300">Solution</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              <tr>
                <td className="p-3 text-gray-400">Backend won't start</td>
                <td className="p-3 text-gray-300">Check OPENSSL_DIR</td>
              </tr>
              <tr>
                <td className="p-3 text-gray-400">Port 3001 already in use</td>
                <td className="p-3 text-gray-300"><code className="bg-gray-800 px-2 py-1 rounded">lsof -ti :3001 | xargs kill</code></td>
              </tr>
              <tr>
                <td className="p-3 text-gray-400">Compilation fails</td>
                <td className="p-3 text-gray-300"><code className="bg-gray-800 px-2 py-1 rounded">cargo clean && cargo build</code></td>
              </tr>
              <tr>
                <td className="p-3 text-gray-400">Frontend API error</td>
                <td className="p-3 text-gray-300">Check NEXT_PUBLIC_API_URL in .env</td>
              </tr>
              <tr>
                <td className="p-3 text-gray-400">Forgot password</td>
                <td className="p-3 text-gray-300">Use seed phrase: POST /auth/restore</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Complete Documentation */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <BookOpenIcon className="w-6 h-6 text-blue-400" />
          <h2 className="text-2xl font-semibold">Complete Documentation</h2>
        </div>
        <div className="grid gap-3">
          <Link href="/docs/user-guide" className="group flex items-center gap-2 p-3 rounded-lg bg-gray-900 border border-gray-800 hover:border-blue-500 hover:shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-blue-500">
            <span className="text-blue-400 group-hover:translate-x-1 transition-transform">Complete User Guide →</span>
          </Link>
          <Link href="/docs/features" className="group flex items-center gap-2 p-3 rounded-lg bg-gray-900 border border-gray-800 hover:border-purple-500 hover:shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-purple-500">
            <span className="text-purple-400 group-hover:translate-x-1 transition-transform">Features Documentation →</span>
          </Link>
          <Link href="/docs/security" className="group flex items-center gap-2 p-3 rounded-lg bg-gray-900 border border-gray-800 hover:border-red-500 hover:shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-red-500">
            <span className="text-red-400 group-hover:translate-x-1 transition-transform">Security & Best Practices →</span>
          </Link>
        </div>
      </section>

      <div className="p-4 rounded-lg bg-green-900/20 border border-green-800 hover:border-green-700 transition-colors animate-pulse-slow">
        <p className="text-green-300 text-center font-semibold flex items-center justify-center gap-2">
          <CheckCircleIcon className="w-5 h-5" />
          You're ready! Check out the complete documentation to go further.
        </p>
      </div>
    </div>
  );
}
