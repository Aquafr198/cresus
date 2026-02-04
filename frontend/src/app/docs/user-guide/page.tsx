"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeftIcon,
  InformationCircleIcon,
  Cog6ToothIcon,
  WalletIcon,
  LockClosedIcon,
  LockOpenIcon,
  PaperAirplaneIcon,
  ArrowDownTrayIcon
} from "@heroicons/react/24/solid";

interface Section {
  id: string;
  title: string;
  content: JSX.Element;
}

export default function UserGuidePage() {
  const [openSection, setOpenSection] = useState<string | null>("introduction");

  const toggleSection = (id: string) => {
    setOpenSection(openSection === id ? null : id);
  };

  const sections: Section[] = [
    {
      id: "introduction",
      title: "Introduction",
      content: (
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-indigo-400">
            What is Cresus?
          </h3>
          <p className="text-gray-300">
            Cresus is a complete platform for managing the entire lifecycle
            of a Solana token, from creation to distribution.
          </p>
          <div className="bg-gray-900 rounded-lg p-4 font-mono text-xs overflow-x-auto">
            <pre className="text-gray-300">
              {`┌──────────────────────────────────────────────────────────┐
│                   TOKEN LIFECYCLE                        │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  1. PREPARATION                                          │
│     ├── Create wallets (main + sub-wallets)             │
│     ├── Upload assets (logo, banner)                    │
│     └── Create metadata                                 │
│                                                          │
│  2. CREATION                                             │
│     ├── Mint token (name, supply, decimals)             │
│     ├── Vanity address (optional)                       │
│     └── Pin metadata to IPFS                            │
│                                                          │
│  3. LAUNCH                                               │
│     ├── Create Jito bundle (atomic)                     │
│     ├── Liquidity pool                                  │
│     ├── Snipe buys                                      │
│     └── On-chain confirmation                           │
│                                                          │
│  4. DISTRIBUTION                                         │
│     ├── Anti-bubble multi-hop                           │
│     ├── Amount variation                                │
│     ├── Timing variation                                │
│     └── Complete tracking                               │
│                                                          │
│  5. MONITORING                                           │
│     ├── Real-time transaction watch                     │
│     ├── WebSocket events                                │
│     └── Alerts                                          │
│                                                          │
└──────────────────────────────────────────────────────────┘`}
            </pre>
          </div>
          <h3 className="text-xl font-semibold text-indigo-400 mt-6">
            Architecture
          </h3>
          <div className="bg-gray-900 rounded-lg p-4 font-mono text-xs overflow-x-auto">
            <pre className="text-gray-300">
              {`┌──────────────────────────────────────────────────────────┐
│                        FRONTEND                          │
│             Next.js 14 + TypeScript + Tailwind          │
│                   http://localhost:3000                  │
└────────────────────────┬─────────────────────────────────┘
                         │ REST API + WebSocket
                         ↓
┌──────────────────────────────────────────────────────────┐
│                        BACKEND                           │
│                Rust + Axum + SQLite                     │
│               http://127.0.0.1:3001/api/v1              │
├─────────────────────┬────────────────────────────────────┤
│                     │                                    │
│  ┌──────────────┐  │   ┌──────────────┐                │
│  │ Wallet Mgr   │◄─┼──►│ RPC Manager  │                │
│  └──────────────┘  │   └──────────────┘                │
│                     │          ↓                         │
│  ┌──────────────┐  │   ┌──────────────┐                │
│  │ Token Mint   │  │   │  Solana RPC  │                │
│  └──────────────┘  │   └──────────────┘                │
│                     │                                    │
│  ┌──────────────┐  │   ┌──────────────┐                │
│  │ Bundle Exec  │  │   │ Jito Bundle  │                │
│  └──────────────┘  │   └──────────────┘                │
│                     │                                    │
│  ┌──────────────┐  │   ┌──────────────┐                │
│  │ Distribution │  │   │   Database   │                │
│  └──────────────┘  │   │  (SQLite)    │                │
│                     │   └──────────────┘                │
└─────────────────────┴────────────────────────────────────┘`}
            </pre>
          </div>
        </div>
      ),
    },
    {
      id: "getting-started",
      title: "Getting Started",
      content: (
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-indigo-400">
            Installation
          </h3>
          <div className="bg-red-900/20 border border-red-800 rounded-lg p-4">
            <h4 className="text-red-400 font-semibold mb-2">Prerequisites</h4>
            <ul className="list-disc list-inside text-gray-300 space-y-1">
              <li>
                <strong>Rust:</strong> 1.85+ (rustup recommended)
              </li>
              <li>
                <strong>Node.js:</strong> v20+
              </li>
              <li>
                <strong>OpenSSL:</strong> Required for Solana SDK
              </li>
            </ul>
          </div>

          <h4 className="text-lg font-semibold text-purple-400 mt-6">
            macOS Installation
          </h4>
          <div className="bg-gray-900 rounded-lg p-4">
            <pre className="text-sm text-gray-300 overflow-x-auto">
              <code>
                {`# 1. Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 2. Install Node.js (via Homebrew)
brew install node

# 3. Configure OpenSSL
brew install openssl pkg-config
export OPENSSL_DIR=$(brew --prefix openssl)
export PKG_CONFIG_PATH="$OPENSSL_DIR/lib/pkgconfig"

# Add to ~/.zshrc for persistence
echo 'export OPENSSL_DIR=$(brew --prefix openssl)' >> ~/.zshrc
echo 'export PKG_CONFIG_PATH="$OPENSSL_DIR/lib/pkgconfig"' >> ~/.zshrc`}
              </code>
            </pre>
          </div>

          <h4 className="text-lg font-semibold text-purple-400 mt-6">
            Linux Installation
          </h4>
          <div className="bg-gray-900 rounded-lg p-4">
            <pre className="text-sm text-gray-300 overflow-x-auto">
              <code>
                {`# 1. Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 2. Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 3. Install OpenSSL
sudo apt-get install libssl-dev pkg-config`}
              </code>
            </pre>
          </div>

          <h4 className="text-lg font-semibold text-purple-400 mt-6">
            Project Setup
          </h4>
          <div className="bg-gray-900 rounded-lg p-4">
            <pre className="text-sm text-gray-300 overflow-x-auto">
              <code>
                {`# 1. Clone the repository
git clone https://github.com/your-repo/cresus.git
cd cresus

# 2. Create .env file
cp .env.example .env

# 3. Configure environment variables
nano .env`}
              </code>
            </pre>
          </div>

          <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4 mt-4">
            <h4 className="text-blue-400 font-semibold mb-2">
              .env File Content
            </h4>
            <pre className="text-sm text-gray-300 overflow-x-auto">
              <code>
                {`# Backend
CRESUS_HOST=127.0.0.1
CRESUS_PORT=3001
CRESUS_DB_PATH=data/cresus.db
CRESUS_LOG_LEVEL=info

# Frontend
NEXT_PUBLIC_API_URL=http://127.0.0.1:3001/api/v1`}
              </code>
            </pre>
          </div>

          <h4 className="text-lg font-semibold text-green-400 mt-6">
            Starting Up
          </h4>
          <p className="text-gray-300">
            Open two terminals to run the backend and frontend
            simultaneously:
          </p>

          <div className="space-y-4">
            <div>
              <div className="bg-gray-800 text-gray-300 px-3 py-1 rounded-t-lg text-sm font-semibold">
                Terminal 1 - Backend
              </div>
              <div className="bg-gray-900 rounded-b-lg p-4">
                <pre className="text-sm text-gray-300 overflow-x-auto">
                  <code>
                    {`cd backend
cargo build --workspace --release
cargo run -p cresus-server --release

# You should see:
INFO Starting Cresus server version="0.1.0" host=127.0.0.1 port=3001
INFO Database initialized path="data/cresus.db"
Server running on http://127.0.0.1:3001`}
                  </code>
                </pre>
              </div>
            </div>

            <div>
              <div className="bg-gray-800 text-gray-300 px-3 py-1 rounded-t-lg text-sm font-semibold">
                Terminal 2 - Frontend
              </div>
              <div className="bg-gray-900 rounded-b-lg p-4">
                <pre className="text-sm text-gray-300 overflow-x-auto">
                  <code>
                    {`cd frontend
npm install
npm run dev

# You should see:
▲ Next.js 14.2.0
- Local:        http://localhost:3000
- Network:      http://192.168.1.X:3000

✓ Ready in 2.3s`}
                  </code>
                </pre>
              </div>
            </div>
          </div>

          <div className="bg-green-900/20 border border-green-800 rounded-lg p-4 mt-4">
            <p className="text-green-400 font-semibold flex items-center gap-2">
              <LockClosedIcon className="w-4 h-4" />
              Verification
            </p>
            <p className="text-gray-300 mt-2">
              Open{" "}
              <a
                href="http://localhost:3000"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline"
              >
                http://localhost:3000
              </a>{" "}
              in your browser.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "initial-setup",
      title: "Initial Configuration",
      content: (
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-indigo-400">
            First-Time Setup
          </h3>
          <p className="text-gray-300">
            On first launch, you'll see the setup screen where
            you must create a master password to protect all your
            private keys.
          </p>

          <div className="bg-gray-900 rounded-lg p-4 font-mono text-xs overflow-x-auto">
            <pre className="text-gray-300">
              {`┌──────────────────────────────────────────────────────┐
│               INITIAL CONFIGURATION                  │
├──────────────────────────────────────────────────────┤
│                                                       │
│  Create a master password                            │
│  This password protects all your private keys        │
│                                                       │
│  ┌───────────────────────────────────────────────┐  │
│  │ Password: ••••••••••••                        │  │
│  └───────────────────────────────────────────────┘  │
│                                                       │
│  Minimum 8 characters recommended                    │
│                                                       │
│  [ Create Account ]                                  │
│                                                       │
└──────────────────────────────────────────────────────┘`}
            </pre>
          </div>

          <h4 className="text-lg font-semibold text-purple-400 mt-6">
            What Happens Behind the Scenes
          </h4>

          <div className="space-y-3">
            <div className="bg-gray-800 rounded-lg p-4">
              <h5 className="text-indigo-400 font-semibold mb-2">
                1. Seed Phrase Generation
              </h5>
              <p className="text-gray-300 text-sm mb-2">
                12 words generated via BIP39 standard
              </p>
              <div className="bg-gray-900 rounded p-2 font-mono text-xs text-gray-400">
                <code>
                  let mnemonic = generate_mnemonic();
                  <br />
                  // Example: "abandon ability able about above
                  absent..."
                </code>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-4">
              <h5 className="text-indigo-400 font-semibold mb-2">
                2. Master Encryption Key (MEK) Derivation
              </h5>
              <p className="text-gray-300 text-sm mb-2">
                Argon2id: slow by design (anti-brute-force)
              </p>
              <div className="bg-gray-900 rounded p-2 font-mono text-xs text-gray-400">
                <code>
                  let salt = generate_salt(); // 16 random bytes
                  <br />
                  let mek = derive_master_key(password, &amp;salt); // ~200ms
                </code>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-4">
              <h5 className="text-indigo-400 font-semibold mb-2">
                3. Seed Phrase Encryption
              </h5>
              <p className="text-gray-300 text-sm mb-2">
                AES-256-GCM encryption
              </p>
              <div className="bg-gray-900 rounded p-2 font-mono text-xs text-gray-400">
                <code>
                  let encrypted = encrypt_mnemonic(&amp;mnemonic, &amp;mek);
                  <br />
                  // Stored in: app_config.seed_phrase_encrypted
                </code>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-4">
              <h5 className="text-indigo-400 font-semibold mb-2">
                4. Seed Phrase Display
              </h5>
              <div className="bg-red-900/20 border border-red-800 rounded p-3 mt-2">
                <p className="text-red-400 font-semibold text-center mb-2 flex items-center justify-center gap-2">
                  <LockClosedIcon className="w-4 h-4" />
                  SAVE THESE 12 WORDS
                </p>
                <div className="bg-gray-900 rounded p-3 font-mono text-sm text-center text-gray-300">
                  abandon ability able about above absent
                  <br />
                  absorb abstract absurd abuse access accident
                </div>
                <div className="mt-3 text-sm text-gray-300 space-y-1">
                  <p>These 12 words allow you to RECOVER your account in case of:</p>
                  <ul className="list-disc list-inside ml-2 text-xs">
                    <li>Forgotten password</li>
                    <li>Lost/stolen computer</li>
                    <li>Corrupted database</li>
                  </ul>
                  <p className="text-red-400 font-semibold mt-2 flex items-center gap-2">
                    <LockClosedIcon className="w-4 h-4" />
                    NEVER SHARE WITH ANYONE!
                  </p>
                </div>
              </div>
            </div>
          </div>

          <h3 className="text-xl font-semibold text-indigo-400 mt-8">
            Unlock / Lock
          </h3>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-gray-800 rounded-lg p-4">
              <h5 className="text-green-400 font-semibold mb-3 flex items-center gap-2">
                <LockOpenIcon className="w-4 h-4" />
                Unlock
              </h5>
              <p className="text-gray-300 text-sm mb-3">
                Unlocking process:
              </p>
              <ol className="list-decimal list-inside text-sm text-gray-300 space-y-1">
                <li>Retrieve salt from DB</li>
                <li>Derive MEK with Argon2id (~200ms)</li>
                <li>Verify password via encrypted token</li>
                <li>Store MEK in memory (RAM)</li>
              </ol>
              <div className="bg-green-900/20 border border-green-800 rounded p-2 mt-3">
                <p className="text-green-400 text-xs">
                  After unlock: Access to all features
                </p>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-4">
              <h5 className="text-red-400 font-semibold mb-3 flex items-center gap-2">
                <LockClosedIcon className="w-4 h-4" />
                Lock
              </h5>
              <p className="text-gray-300 text-sm mb-3">
                Click "Lock" in the menu.
              </p>
              <div className="bg-red-900/20 border border-red-800 rounded p-3">
                <p className="text-red-400 text-sm font-semibold mb-2">
                  Effect:
                </p>
                <p className="text-gray-300 text-xs">
                  The MEK is removed from memory. Private keys can
                  no longer be decrypted until next unlock.
                </p>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "wallet-management",
      title: "Wallet Management",
      content: (
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-indigo-400">
            Wallet Architecture
          </h3>
          <div className="bg-gray-900 rounded-lg p-4 font-mono text-xs overflow-x-auto">
            <pre className="text-gray-300">
              {`┌──────────────────────────────────────────────────────┐
│                   HIERARCHY                          │
├──────────────────────────────────────────────────────┤
│                                                       │
│  MAIN WALLET #1 (Parent)                             │
│  └── Address: 7xK8...Qw3D                            │
│      ├── Sub-wallet #1                               │
│      │   └── Address: 2mN9...Pv5F                   │
│      ├── Sub-wallet #2                               │
│      │   └── Address: 4hL2...Tx8K                   │
│      └── Sub-wallet #3                               │
│          └── Address: 9kP1...Ry6M                   │
│                                                       │
│  MAIN WALLET #2 (Parent)                             │
│  └── Address: 5fT3...Wm2N                            │
│      ├── Sub-wallet #1                               │
│      └── Sub-wallet #2                               │
│                                                       │
└──────────────────────────────────────────────────────┘`}
            </pre>
          </div>

          <h4 className="text-lg font-semibold text-purple-400 mt-6">
            Create a Wallet
          </h4>
          <ol className="list-decimal list-inside space-y-2 text-gray-300">
            <li>
              <strong>Navigate:</strong> Go to{" "}
              <Link
                href="/wallets"
                className="text-blue-400 hover:text-blue-300 underline"
              >
                /wallets
              </Link>
            </li>
            <li>
              <strong>Click "Create Wallet"</strong>
            </li>
            <li>
              <strong>Optional:</strong> Give it a descriptive name
            </li>
            <li>
              <strong>Result:</strong> Wallet created with unique Solana address
            </li>
          </ol>

          <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4 mt-4">
            <h5 className="text-blue-400 font-semibold mb-2">
              What's Stored in the DB
            </h5>
            <div className="bg-gray-900 rounded p-3 font-mono text-xs text-gray-300 overflow-x-auto">
              <pre>
                {`INSERT INTO wallets (
    id,                  -- Generated UUID
    name,                -- "Launch Wallet #1"
    public_key,          -- "7xK8...Qw3D" (visible)
    encrypted_secret,    -- Private key encrypted AES-256-GCM
    nonce,               -- Unique nonce for AES-GCM
    group_id,            -- NULL or group ID
    parent_id,           -- NULL (it's a parent)
    created_at           -- Timestamp
);`}
              </pre>
            </div>
          </div>

          <h4 className="text-lg font-semibold text-purple-400 mt-6">
            Create Sub-Wallets
          </h4>
          <div className="bg-yellow-900/20 border border-yellow-800 rounded-lg p-3 mb-3">
            <p className="text-yellow-400 text-sm">
              <strong>Use Case:</strong> Anti-bubble distribution, multiple snipe buys
            </p>
          </div>
          <ol className="list-decimal list-inside space-y-2 text-gray-300">
            <li>Click "+ Sub-wallets" on a parent wallet</li>
            <li>Choose the number (1-50)</li>
            <li>
              Automatic generation via deterministic derivation from parent
            </li>
            <li>
              Result: N wallets created with parent_id pointing to parent
            </li>
          </ol>

          <h4 className="text-lg font-semibold text-green-400 mt-6 flex items-center gap-2">
            <WalletIcon className="w-5 h-5" />
            View Balance
          </h4>
          <p className="text-gray-300">
            Click "Balance" next to a wallet to see:
          </p>
          <ul className="list-disc list-inside text-gray-300 space-y-1 ml-4">
            <li>SOL balance (in SOL and lamports)</li>
            <li>SPL token balances (if present)</li>
          </ul>
          <div className="bg-yellow-900/20 border border-yellow-800 rounded-lg p-3 mt-2">
            <p className="text-yellow-400 text-sm">
              <strong>Note:</strong> Balance is NOT stored in DB. It's
              fetched in real-time from the Solana blockchain.
            </p>
          </div>

          <h4 className="text-lg font-semibold text-blue-400 mt-6 flex items-center gap-2">
            <PaperAirplaneIcon className="w-5 h-5" />
            Send SOL
          </h4>
          <ol className="list-decimal list-inside space-y-2 text-gray-300">
            <li>Click "Send" next to a wallet</li>
            <li>Enter recipient address (auto-validated)</li>
            <li>Enter amount in SOL (max 9 decimals)</li>
            <li>Auto-confirmation if amount {`>`} 1 SOL</li>
            <li>Transaction signed and sent to Solana RPC</li>
          </ol>

          <div className="bg-green-900/20 border border-green-800 rounded-lg p-4 mt-4">
            <h5 className="text-green-400 font-semibold mb-2">
              Automatic Validations
            </h5>
            <ul className="list-disc list-inside text-gray-300 space-y-1 text-sm">
              <li>Valid Solana address (Base58, length 32-44)</li>
              <li>Amount {`>`} 0</li>
              <li>Max 9 decimals</li>
              <li>Sufficient balance (amount + fees ~5000 lamports)</li>
              <li>Confirmation if {`>`} 1 SOL</li>
            </ul>
          </div>

          <h4 className="text-lg font-semibold text-amber-400 mt-6 flex items-center gap-2">
            <ArrowDownTrayIcon className="w-5 h-5" />
            Export a Wallet
          </h4>
          <div className="bg-amber-900/20 border border-amber-800 rounded-lg p-3 mb-3">
            <p className="text-amber-400 text-sm">
              <strong>Use Case:</strong> External backup, import to
              Phantom/Solflare
            </p>
          </div>
          <ol className="list-decimal list-inside space-y-2 text-gray-300">
            <li>Click "Export"</li>
            <li>
              Enter an export password (DO NOT use your master password!)
            </li>
            <li>Retrieve the encrypted key in JSON format</li>
            <li>Save it in a secure location</li>
          </ol>

          <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 mt-3">
            <p className="text-red-400 text-sm font-semibold flex items-center gap-2">
              <LockClosedIcon className="w-4 h-4" />
              IMPORTANT: NEVER share your private key or seed phrase with anyone!
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "sol-operations",
      title: "SOL & Token Operations",
      content: (
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-indigo-400">
            Rate Limiting
          </h3>
          <p className="text-gray-300">
            For security, endpoints are rate-limited:
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-gray-300 border border-gray-700">
              <thead className="bg-gray-800">
                <tr>
                  <th className="px-4 py-2 text-left">Endpoint</th>
                  <th className="px-4 py-2 text-left">Limit</th>
                  <th className="px-4 py-2 text-left">Window</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-gray-700">
                  <td className="px-4 py-2 font-mono text-xs">
                    /wallets/{`{id}`}/balance
                  </td>
                  <td className="px-4 py-2">30 requests</td>
                  <td className="px-4 py-2">60 seconds</td>
                </tr>
                <tr className="border-t border-gray-700">
                  <td className="px-4 py-2 font-mono text-xs">
                    /wallets/{`{id}`}/send
                  </td>
                  <td className="px-4 py-2">10 requests</td>
                  <td className="px-4 py-2">60 seconds</td>
                </tr>
                <tr className="border-t border-gray-700">
                  <td className="px-4 py-2 font-mono text-xs">/auth/unlock</td>
                  <td className="px-4 py-2">5 requests</td>
                  <td className="px-4 py-2">60 seconds</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="bg-red-900/20 border border-red-800 rounded-lg p-3">
            <p className="text-red-400 text-sm">
              <strong>Exceeded:</strong> HTTP 429 "Too many requests"
            </p>
          </div>

          <h3 className="text-xl font-semibold text-indigo-400 mt-6">
            Security Checks
          </h3>
          <div className="space-y-3">
            <div className="bg-gray-800 rounded-lg p-4">
              <h5 className="text-purple-400 font-semibold mb-2">
                Before Sending
              </h5>
              <div className="bg-gray-900 rounded p-3 font-mono text-xs text-gray-300 overflow-x-auto">
                <pre>
                  {`// 1. Address validation
validate_solana_address(&to_address)?;

// 2. Amount > 0
if amount == 0 { return Err("Amount must be > 0"); }

// 3. Sufficient balance (with fees)
const FEE: u64 = 5000; // ~0.000005 SOL
if balance < amount + FEE {
    return Err("Insufficient balance");
}

// 4. Overflow check
amount.checked_add(FEE).ok_or("Overflow")?;`}
                </pre>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-4">
              <h5 className="text-purple-400 font-semibold mb-2">
                During Sending
              </h5>
              <ul className="list-disc list-inside text-gray-300 space-y-1 text-sm">
                <li>Fetch recent blockhash</li>
                <li>Sign transaction</li>
                <li>Confirmation via RPC with spinner</li>
              </ul>
            </div>
          </div>

          <h3 className="text-xl font-semibold text-blue-400 mt-6">
            Send SPL Tokens
          </h3>
          <div className="bg-yellow-900/20 border border-yellow-800 rounded-lg p-3">
            <p className="text-yellow-400 text-sm">
              <strong>TODO:</strong> Implementation similar to send_sol but with
              Associated Token Account (ATA) management
            </p>
          </div>
          <div className="bg-gray-900 rounded-lg p-4 mt-3">
            <pre className="text-xs text-gray-300 overflow-x-auto">
              <code>
                {`// 1. Check/create Associated Token Account (ATA)
let from_ata = get_associated_token_address(&from, &mint);
let to_ata = get_associated_token_address(&to, &mint);

// 2. Create destination ATA if doesn't exist
if !to_ata_exists {
    instructions.push(create_associated_token_account(...));
}

// 3. Transfer instruction
instructions.push(spl_token::instruction::transfer(...));`}
              </code>
            </pre>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <Link
          href="/docs"
          className="inline-flex items-center text-indigo-400 hover:text-indigo-300 mb-4 transition-all hover:gap-3 gap-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-lg px-2 py-1"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Back to Documentation
        </Link>
        <h1 className="text-4xl font-bold mb-2">Complete User Guide</h1>
        <p className="text-gray-400 text-lg">
          Solana platform for token launch, bundling and wallet management
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
              className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-800 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
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
              <div className="px-6 py-4 border-t border-gray-800 bg-gray-900/50 animate-in slide-in-from-top-2 duration-300">
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
            href="/docs/features"
            className="group block p-4 rounded-lg bg-gray-900 border border-gray-800 hover:border-indigo-500 hover:shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <h4 className="font-semibold text-indigo-400 mb-1 group-hover:translate-x-1 transition-transform">
              Complete Features
            </h4>
            <p className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors">
              Token minting, bundles, anti-bubble distribution
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
