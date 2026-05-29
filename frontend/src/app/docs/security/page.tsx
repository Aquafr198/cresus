"use client";

import { useState } from "react";
import type { JSX } from "react";
import Link from "next/link";
import {
  ArrowLeftIcon,
  ShieldCheckIcon,
  LockClosedIcon,
  KeyIcon,
  CircleStackIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  InformationCircleIcon,
  ArrowTopRightOnSquareIcon
} from "@heroicons/react/24/solid";

interface Section {
  id: string;
  title: string;
  content: JSX.Element;
}

export default function SecurityPage() {
  const [openSection, setOpenSection] = useState<string | null>(
    "security-overview"
  );

  const toggleSection = (id: string) => {
    setOpenSection(openSection === id ? null : id);
  };

  const sections: Section[] = [
    {
      id: "security-overview",
      title: "Security Overview",
      content: (
        <div className="space-y-4">
          <div className="bg-gray-900 rounded-lg p-4 font-mono text-xs overflow-x-auto">
            <pre className="text-gray-300">
              {`┌──────────────────────────────────────────────────────┐
│            SECURITY ARCHITECTURE                     │
├──────────────────────────────────────────────────────┤
│                                                       │
│  LEVEL 1: User Password                              │
│      ↓ Argon2id (~200ms, anti-brute-force)           │
│  LEVEL 2: Master Encryption Key (MEK)                │
│      ↓ AES-256-GCM encryption                        │
│  LEVEL 3: Encrypted Private Keys (DB)                │
│      ↓ Permissions 600 (owner only)                  │
│  LEVEL 4: Local Database                             │
│                                                       │
│  BACKUP: BIP39 Seed Phrase (12 words)                │
│      → Recovery possible anywhere                    │
│                                                       │
└──────────────────────────────────────────────────────┘`}
            </pre>
          </div>

          <div className="grid md:grid-cols-2 gap-4 mt-4">
            <div className="bg-green-900/20 border border-green-800 rounded-lg p-4">
              <h4 className="text-green-400 font-semibold mb-2 flex items-center gap-2">
                <CheckCircleIcon className="w-5 h-5" />
                Strengths
              </h4>
              <ul className="space-y-1 text-sm text-gray-300">
                <li className="flex items-center gap-2">
                  <CheckCircleIcon className="w-3 h-3" />
                  Military-grade AES-256-GCM encryption
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircleIcon className="w-3 h-3" />
                  Anti-GPU Argon2id KDF
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircleIcon className="w-3 h-3" />
                  Standard BIP39 seed phrase
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircleIcon className="w-3 h-3" />
                  Local storage (no cloud)
                </li>
              </ul>
            </div>

            <div className="bg-amber-900/20 border border-amber-800 rounded-lg p-4">
              <h4 className="text-amber-400 font-semibold mb-2 flex items-center gap-2">
                <ExclamationTriangleIcon className="w-5 h-5" />
                Responsibilities
              </h4>
              <ul className="space-y-1 text-sm text-gray-300">
                <li className="flex items-center gap-2">
                  <ExclamationTriangleIcon className="w-3 h-3" />
                  You manage your own keys
                </li>
                <li className="flex items-center gap-2">
                  <ExclamationTriangleIcon className="w-3 h-3" />
                  Mandatory seed phrase backup
                </li>
                <li className="flex items-center gap-2">
                  <ExclamationTriangleIcon className="w-3 h-3" />
                  Strong password required
                </li>
                <li className="flex items-center gap-2">
                  <ExclamationTriangleIcon className="w-3 h-3" />
                  No centralized recovery
                </li>
              </ul>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "seed-phrase",
      title: "Seed Phrase Management",
      content: (
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-offivex-purple-light flex items-center gap-2">
            <KeyIcon className="w-6 h-6" />
            What is the Seed Phrase?
          </h3>
          <p className="text-gray-300">
            <strong>12 words</strong> generated according to the{" "}
            <strong>BIP39</strong> standard:
          </p>
          <div className="bg-gray-900 rounded-lg p-4 text-center">
            <code className="text-offivex-purple-light text-sm">
              abandon ability able about above absent
              <br />
              absorb abstract absurd abuse access accident
            </code>
          </div>

          <h3 className="text-xl font-semibold text-red-400 mt-6 flex items-center gap-2">
            <ExclamationTriangleIcon className="w-6 h-6" />
            Why is it Critical?
          </h3>
          <div className="bg-gray-900 rounded-lg p-4 font-mono text-xs overflow-x-auto">
            <pre className="text-gray-300">
              {`┌──────────────────────────────────────────────────────┐
│                  LOSS SCENARIOS                      │
├──────────────────────────────────────────────────────┤
│                                                       │
│  ❌ Forgot password + No seed phrase                 │
│     → 💸 FUNDS LOST PERMANENTLY                      │
│                                                       │
│  ❌ Broken computer + No seed phrase                 │
│     → 💸 FUNDS LOST PERMANENTLY                      │
│                                                       │
│  ❌ Corrupted DB + No seed phrase                    │
│     → 💸 FUNDS LOST PERMANENTLY                      │
│                                                       │
│  ✅ Any problem + Seed phrase                        │
│     → 🎉 RECOVERY POSSIBLE                           │
│                                                       │
└──────────────────────────────────────────────────────┘`}
            </pre>
          </div>

          <h3 className="text-xl font-semibold text-green-400 mt-6 flex items-center gap-2">
            <ShieldCheckIcon className="w-6 h-6" />
            How to Backup the Seed Phrase?
          </h3>
          <div className="bg-green-900/20 border border-green-800 rounded-lg p-4">
            <h4 className="text-green-400 font-semibold mb-3 flex items-center gap-2">
              <CheckCircleIcon className="w-5 h-5" />
              RECOMMENDED METHOD: Triple Backup
            </h4>
            <div className="space-y-4">
              <div className="bg-gray-900 rounded-lg p-3">
                <h5 className="text-blue-400 font-semibold mb-2 text-sm">
                  BACKUP #1: Encrypted USB (Physical)
                </h5>
                <ol className="list-decimal list-inside text-xs text-gray-300 space-y-1">
                  <li>Buy dedicated USB drive</li>
                  <li>Encrypt with VeraCrypt/LUKS</li>
                  <li>Write seed phrase in text file</li>
                  <li>Store USB in safe place (vault, etc.)</li>
                </ol>
              </div>

              <div className="bg-gray-900 rounded-lg p-3">
                <h5 className="text-purple-400 font-semibold mb-2 text-sm">
                  BACKUP #2: Encrypted Cloud
                </h5>
                <ol className="list-decimal list-inside text-xs text-gray-300 space-y-1">
                  <li>Use 1Password/Bitwarden</li>
                  <li>Create a "Secure Note"</li>
                  <li>Copy the 12 words there</li>
                  <li>Enable 2FA on the manager</li>
                </ol>
              </div>

              <div className="bg-gray-900 rounded-lg p-3">
                <h5 className="text-amber-400 font-semibold mb-2 text-sm">
                  BACKUP #3: Paper (Physical)
                </h5>
                <ol className="list-decimal list-inside text-xs text-gray-300 space-y-1">
                  <li>Write the 12 words on paper</li>
                  <li>Laminate the paper</li>
                  <li>Store in safe/bank vault</li>
                  <li>DO NOT photograph</li>
                </ol>
              </div>
            </div>
          </div>

          <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 mt-4">
            <h4 className="text-red-400 font-semibold mb-3 flex items-center gap-2">
              <ExclamationTriangleIcon className="w-5 h-5" />
              DANGEROUS METHODS
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-gray-300 border border-gray-700">
                <thead className="bg-gray-900">
                  <tr>
                    <th className="px-4 py-2 text-left">Method</th>
                    <th className="px-4 py-2 text-left">Risk</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-gray-700">
                    <td className="px-4 py-2">Unencrypted email</td>
                    <td className="px-4 py-2 text-red-400">Easily hacked</td>
                  </tr>
                  <tr className="border-t border-gray-700">
                    <td className="px-4 py-2">Screenshot</td>
                    <td className="px-4 py-2 text-red-400">
                      Cloud sync, malware
                    </td>
                  </tr>
                  <tr className="border-t border-gray-700">
                    <td className="px-4 py-2">Phone notes</td>
                    <td className="px-4 py-2 text-red-400">
                      Malware, phone theft
                    </td>
                  </tr>
                  <tr className="border-t border-gray-700">
                    <td className="px-4 py-2">Google Docs</td>
                    <td className="px-4 py-2 text-red-400">Google access, hack</td>
                  </tr>
                  <tr className="border-t border-gray-700">
                    <td className="px-4 py-2">Discord/Slack</td>
                    <td className="px-4 py-2 text-red-400">Server logs, leak</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <h3 className="text-xl font-semibold text-blue-400 mt-6 flex items-center gap-2">
            <InformationCircleIcon className="w-6 h-6" />
            Test Recovery
          </h3>
          <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4">
            <p className="text-blue-300 mb-3 font-semibold">
              IMPORTANT: Test BEFORE putting real funds!
            </p>
            <div className="bg-gray-900 rounded p-3 font-mono text-xs overflow-x-auto">
              <pre className="text-gray-300">
                {`# 1. Initial setup with seed phrase
POST /auth/setup
{ "password": "test123456" }
→ Response: { "mnemonic": "word1 word2 ... word12" }

# 2. Note the 12 words

# 3. Create test wallet
POST /wallets
{ "name": "Test Recovery" }

# 4. Send 0.01 SOL test

# 5. COMPLETELY delete DB
rm data/offivex.db

# 6. Restart backend

# 7. Restore with seed phrase
POST /auth/restore
{
  "mnemonic": "word1 word2 ... word12",
  "password": "new-password-456"
}

# 8. Verify wallet reappears
GET /wallets

# ✅ If it works: You're protected!
# ❌ If it fails: DO NOT put real funds`}
              </pre>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "password-security",
      title: "Password Security",
      content: (
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-offivex-purple-light flex items-center gap-2">
            <LockClosedIcon className="w-6 h-6" />
            Golden Rules
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-green-900/20 border border-green-800 rounded-lg p-4">
              <h4 className="text-green-400 font-semibold mb-2 flex items-center gap-2">
                <CheckCircleIcon className="w-4 h-4" />
                DO:
              </h4>
              <ul className="space-y-1 text-sm text-gray-300">
                <li>• Minimum 16 characters</li>
                <li>• Mix: uppercase, lowercase, numbers, symbols</li>
                <li>• Use a manager (1Password, Bitwarden)</li>
                <li>• Unique (never reused elsewhere)</li>
              </ul>
            </div>

            <div className="bg-red-900/20 border border-red-800 rounded-lg p-4">
              <h4 className="text-red-400 font-semibold mb-2 flex items-center gap-2">
                <ExclamationTriangleIcon className="w-4 h-4" />
                DO NOT:
              </h4>
              <ul className="space-y-1 text-sm text-gray-300">
                <li>• {`<`} 8 characters</li>
                <li>• Dictionary words</li>
                <li>• Personal info (birthdate, etc.)</li>
                <li>• Same as Gmail, etc.</li>
              </ul>
            </div>
          </div>

          <h3 className="text-xl font-semibold text-purple-400 mt-6">
            Password Strength Examples
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-gray-300 border border-gray-700">
              <thead className="bg-gray-800">
                <tr>
                  <th className="px-4 py-2 text-left">Password</th>
                  <th className="px-4 py-2 text-left">Strength</th>
                  <th className="px-4 py-2 text-left">Brute-force time</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-gray-700">
                  <td className="px-4 py-2 font-mono text-xs">password123</td>
                  <td className="px-4 py-2">
                    <span className="text-red-500">💀 Terrible</span>
                  </td>
                  <td className="px-4 py-2 text-red-400">{`<`} 1 second</td>
                </tr>
                <tr className="border-t border-gray-700">
                  <td className="px-4 py-2 font-mono text-xs">
                    MyBirthday1990!
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-red-400">🔴 Weak</span>
                  </td>
                  <td className="px-4 py-2 text-orange-400">{`<`} 1 hour</td>
                </tr>
                <tr className="border-t border-gray-700">
                  <td className="px-4 py-2 font-mono text-xs">Tr0ub4dor&amp;3</td>
                  <td className="px-4 py-2">
                    <span className="text-yellow-400">🟡 Medium</span>
                  </td>
                  <td className="px-4 py-2 text-yellow-400">~3 days</td>
                </tr>
                <tr className="border-t border-gray-700">
                  <td className="px-4 py-2 font-mono text-xs">
                    correct-horse-battery-staple
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-green-400">🟢 Strong</span>
                  </td>
                  <td className="px-4 py-2 text-green-400">~550 years</td>
                </tr>
                <tr className="border-t border-gray-700">
                  <td className="px-4 py-2 font-mono text-xs">
                    Xk9#mP2$vL5@nQ8!wR4%
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-green-500">🟢🟢 Very strong</span>
                  </td>
                  <td className="px-4 py-2 text-green-500">Millennia</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4 mt-4">
            <h4 className="text-blue-400 font-semibold mb-2 flex items-center gap-2">
              <ArrowTopRightOnSquareIcon className="w-4 h-4" />
              Check Strength
            </h4>
            <p className="text-gray-300 text-sm">
              Use:{" "}
              <a
                href="https://www.security.org/how-secure-is-my-password/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline inline-flex items-center gap-1"
              >
                https://www.security.org/how-secure-is-my-password/
                <ArrowTopRightOnSquareIcon className="w-3 h-3" />
              </a>
            </p>
          </div>

          <h3 className="text-xl font-semibold text-amber-400 mt-6">
            Rate Limiting
          </h3>
          <div className="bg-gray-900 rounded-lg p-4">
            <p className="text-gray-300 mb-2">
              Offivex limits login attempts:
            </p>
            <div className="bg-gray-800 rounded p-3 font-mono text-sm">
              <code className="text-offivex-purple-light">
                /auth/unlock: 5 attempts / 60 seconds
              </code>
            </div>
            <p className="text-gray-400 text-sm mt-2">
              After 5 failures → <strong>Wait 60 seconds</strong>
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "database-backup",
      title: "Database Backup",
      content: (
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-offivex-purple-light flex items-center gap-2">
            <CircleStackIcon className="w-6 h-6" />
            Why?
          </h3>
          <div className="bg-gray-900 rounded-lg p-4">
            <p className="text-gray-300 mb-3">The DB contains:</p>
            <ul className="list-disc list-inside text-gray-300 space-y-1">
              <li>Encrypted private keys</li>
              <li>Encrypted seed phrase</li>
              <li>Wallet metadata</li>
              <li>Configuration</li>
            </ul>
            <div className="bg-red-900/20 border border-red-800 rounded p-3 mt-3">
              <p className="text-red-400 font-semibold text-sm">
                Lost DB = Lost access (except with seed phrase)
              </p>
            </div>
          </div>

          <h3 className="text-xl font-semibold text-green-400 mt-6">
            Automatic Backup Script
          </h3>
          <div className="bg-gray-900 rounded-lg p-4">
            <div className="bg-gray-950 rounded p-3 font-mono text-xs overflow-x-auto">
              <pre className="text-gray-300">
                {`#!/bin/bash
# save as: backup-offivex.sh

BACKUP_DIR="$HOME/offivex-backups"
DB_PATH="$HOME/offivex/data/offivex.db"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/offivex_$DATE.db"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Stop server (optional but recommended)
# killall offivex-server

# Copy DB
cp "$DB_PATH" "$BACKUP_FILE"

# Compress
gzip "$BACKUP_FILE"

# Keep only last 7 backups
ls -t "$BACKUP_DIR"/offivex_*.db.gz | tail -n +8 | xargs rm -f

echo "✅ Backup created: \${BACKUP_FILE}.gz"

# Restart server
# cd ~/offivex/backend && cargo run -p offivex-server &`}
              </pre>
            </div>
          </div>

          <h3 className="text-xl font-semibold text-purple-400 mt-6">
            Automation with Cron
          </h3>
          <div className="bg-gray-900 rounded-lg p-4">
            <div className="bg-gray-950 rounded p-3 font-mono text-xs overflow-x-auto">
              <pre className="text-gray-300">
                {`# Edit crontab
crontab -e

# Add daily backup at 3 AM
0 3 * * * /path/to/backup-offivex.sh`}
              </pre>
            </div>
          </div>

          <h3 className="text-xl font-semibold text-blue-400 mt-6">
            Restoration
          </h3>
          <div className="bg-gray-900 rounded-lg p-4">
            <div className="bg-gray-950 rounded p-3 font-mono text-xs overflow-x-auto">
              <pre className="text-gray-300">
                {`#!/bin/bash
# Stop server
killall offivex-server

# Decompress backup
gunzip offivex_20240315_030000.db.gz

# Replace DB
cp offivex_20240315_030000.db ~/offivex/data/offivex.db

# Restart
cd ~/offivex/backend && cargo run -p offivex-server`}
              </pre>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "attack-protection",
      title: "Attack Protection",
      content: (
        <div className="space-y-4">
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-lg p-4">
              <h4 className="text-red-400 font-semibold mb-3 flex items-center gap-2">
                <ExclamationTriangleIcon className="w-5 h-5" />
                1. Brute Force Attack
              </h4>
              <div className="mb-3">
                <span className="text-green-400 font-semibold text-sm">
                  Protection:
                </span>
                <span className="text-gray-300 text-sm ml-2">
                  Argon2id KDF
                </span>
              </div>
              <div className="bg-gray-900 rounded p-3 font-mono text-xs overflow-x-auto">
                <pre className="text-gray-300">
                  {`// Current configuration:
Argon2::new(
    Algorithm::Argon2id,
    Version::V0x13,
    Params::new(
        65536,  // 64 MiB memory (makes GPU inefficient)
        3,      // 3 iterations
        1,      // 1 thread (forces sequential)
        Some(32),
    )
)`}
                </pre>
              </div>
              <div className="grid md:grid-cols-3 gap-2 mt-3 text-xs">
                <div className="bg-blue-900/20 border border-blue-800 rounded p-2">
                  <div className="text-blue-400 font-semibold">
                    Derivation time
                  </div>
                  <div className="text-gray-300">~200ms per attempt</div>
                </div>
                <div className="bg-purple-900/20 border border-purple-800 rounded p-2">
                  <div className="text-purple-400 font-semibold">
                    Possible attempts
                  </div>
                  <div className="text-gray-300">~5 per second max</div>
                </div>
                <div className="bg-green-900/20 border border-green-800 rounded p-2">
                  <div className="text-green-400 font-semibold">
                    16 char password
                  </div>
                  <div className="text-gray-300">~centuries to crack</div>
                </div>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-4">
              <h4 className="text-red-400 font-semibold mb-3 flex items-center gap-2">
                <ExclamationTriangleIcon className="w-5 h-5" />
                2. DB Theft Attack
              </h4>
              <div className="mb-3">
                <span className="text-amber-400 font-semibold text-sm">
                  Scenario:
                </span>
                <span className="text-gray-300 text-sm ml-2">
                  Attacker steals offivex.db
                </span>
              </div>
              <div className="space-y-2">
                <div className="bg-green-900/20 border border-green-800 rounded p-3">
                  <p className="text-green-400 font-semibold text-sm mb-2">
                    Protection:
                  </p>
                  <ul className="text-xs text-gray-300 space-y-1">
                    <li>• Keys encrypted with AES-256-GCM</li>
                    <li>• Impossible to decrypt without password</li>
                    <li>• Even with GPU, Argon2id slows down enormously</li>
                  </ul>
                </div>
                <div className="bg-blue-900/20 border border-blue-800 rounded p-3">
                  <p className="text-blue-400 font-semibold text-sm mb-2">
                    Recommendation:
                  </p>
                  <div className="bg-gray-900 rounded p-2 font-mono text-xs">
                    <code className="text-gray-300">
                      # Strict permissions
                      <br />
                      chmod 600 data/offivex.db
                    </code>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-4">
              <h4 className="text-red-400 font-semibold mb-3 flex items-center gap-2">
                <ExclamationTriangleIcon className="w-5 h-5" />
                3. Keylogger Attack
              </h4>
              <div className="mb-3">
                <span className="text-amber-400 font-semibold text-sm">
                  Scenario:
                </span>
                <span className="text-gray-300 text-sm ml-2">
                  Malware records keystrokes
                </span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="bg-yellow-900/20 border border-yellow-800 rounded p-3">
                  <p className="text-yellow-400 font-semibold mb-2">
                    Mitigation:
                  </p>
                  <ul className="text-xs text-gray-300 space-y-1">
                    <li>
                      • Use password manager (auto-fill)
                    </li>
                    <li>• Updated antivirus/antimalware</li>
                    <li>• Don't type password on public machine</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-4">
              <h4 className="text-red-400 font-semibold mb-3 flex items-center gap-2">
                <ExclamationTriangleIcon className="w-5 h-5" />
                4. Phishing Attack
              </h4>
              <div className="mb-3">
                <span className="text-amber-400 font-semibold text-sm">
                  Scenario:
                </span>
                <span className="text-gray-300 text-sm ml-2">
                  Fake site asks for seed phrase
                </span>
              </div>
              <div className="space-y-2">
                <div className="bg-green-900/20 border border-green-800 rounded p-3">
                  <p className="text-green-400 font-semibold text-sm mb-2">
                    Protection:
                  </p>
                  <ul className="text-xs text-gray-300 space-y-1">
                    <li className="flex items-center gap-1">
                      <CheckCircleIcon className="w-3 h-3" />
                      Offivex is local (localhost:3000)
                    </li>
                    <li className="flex items-center gap-1">
                      <CheckCircleIcon className="w-3 h-3" />
                      Never external website
                    </li>
                    <li className="flex items-center gap-1">
                      <ExclamationTriangleIcon className="w-3 h-3" />
                      NEVER enter seed phrase elsewhere
                    </li>
                  </ul>
                </div>
                <div className="bg-blue-900/20 border border-blue-800 rounded p-3">
                  <p className="text-blue-400 font-semibold text-sm">
                    Golden rule: Seed phrase = enter ONLY in local Offivex
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "compromise-response",
      title: "What to Do If Compromised?",
      content: (
        <div className="space-y-4">
          <div className="bg-red-900/20 border border-red-800 rounded-lg p-4">
            <h4 className="text-red-400 font-semibold mb-3 flex items-center gap-2">
              <ExclamationTriangleIcon className="w-5 h-5" />
              If you think your password is compromised
            </h4>
            <div className="space-y-3">
              <div className="bg-gray-900 rounded p-3">
                <h5 className="text-amber-400 font-semibold mb-2 text-sm">
                  STEP 1: Act FAST
                </h5>
                <ol className="list-decimal list-inside text-xs text-gray-300 space-y-1">
                  <li>Open Offivex</li>
                  <li>Unlock with old password</li>
                  <li>View seed phrase: GET /auth/seed-phrase</li>
                  <li>Note the 12 words</li>
                </ol>
              </div>
              <div className="bg-gray-900 rounded p-3">
                <h5 className="text-red-400 font-semibold mb-2 text-sm">
                  STEP 2: Transfer Funds
                </h5>
                <ol className="list-decimal list-inside text-xs text-gray-300 space-y-1">
                  <li>Create NEW wallet on Phantom/Solflare</li>
                  <li>Transfer ALL SOL/tokens to new wallet</li>
                  <li>This takes priority over everything else!</li>
                </ol>
              </div>
              <div className="bg-gray-900 rounded p-3">
                <h5 className="text-green-400 font-semibold mb-2 text-sm">
                  STEP 3: Restore with New Password
                </h5>
                <ol className="list-decimal list-inside text-xs text-gray-300 space-y-1">
                  <li>Delete offivex.db</li>
                  <li>
                    Restore: POST /auth/restore with seed phrase + new
                    password
                  </li>
                  <li>Or continue with Phantom</li>
                </ol>
              </div>
            </div>
          </div>

          <div className="bg-red-950 border-2 border-red-600 rounded-lg p-4">
            <h4 className="text-red-400 font-semibold mb-3 text-lg flex items-center gap-2">
              <ExclamationTriangleIcon className="w-6 h-6" />
              If your seed phrase is compromised
            </h4>
            <div className="bg-red-900/40 rounded p-4 mb-3">
              <p className="text-red-300 font-bold text-center mb-2 flex items-center justify-center gap-2">
                <ExclamationTriangleIcon className="w-5 h-5" />
                CRITICAL EMERGENCY
              </p>
              <p className="text-red-200 text-sm text-center">
                Your funds are in IMMEDIATE DANGER
              </p>
            </div>
            <div className="bg-gray-900 rounded p-3">
              <h5 className="text-red-400 font-semibold mb-2 text-sm">
                IMMEDIATE ACTION:
              </h5>
              <ol className="list-decimal list-inside text-xs text-gray-300 space-y-1">
                <li>Create NEW wallet (new seed phrase)</li>
                <li>Transfer ALL funds NOW</li>
                <li>Abandon old seed phrase</li>
              </ol>
              <div className="mt-3 bg-red-900/30 rounded p-2">
                <p className="text-red-400 font-semibold text-xs">
                  TIME: {`<`} 5 minutes to act
                </p>
              </div>
            </div>
          </div>

          <div className="bg-amber-900/20 border border-amber-800 rounded-lg p-4">
            <h4 className="text-amber-400 font-semibold mb-3">
              If your computer is stolen
            </h4>
            <div className="grid md:grid-cols-2 gap-3">
              <div className="bg-gray-900 rounded p-3">
                <h5 className="text-red-400 font-semibold mb-2 text-sm">
                  SCENARIO 1: Computer unlocked
                </h5>
                <p className="text-red-300 text-xs mb-2 flex items-center gap-1">
                  <ExclamationTriangleIcon className="w-3 h-3" />
                  Funds at risk
                </p>
                <p className="text-gray-300 text-xs">
                  → Transfer funds from another machine with seed phrase
                </p>
              </div>
              <div className="bg-gray-900 rounded p-3">
                <h5 className="text-green-400 font-semibold mb-2 text-sm">
                  SCENARIO 2: Computer locked
                </h5>
                <p className="text-green-300 text-xs mb-2 flex items-center gap-1">
                  <CheckCircleIcon className="w-3 h-3" />
                  Keys encrypted, but...
                </p>
                <ul className="text-gray-300 text-xs space-y-1">
                  <li>→ Change password as precaution</li>
                  <li>→ Use seed phrase on new machine</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "security-checklist",
      title: "Security Checklist",
      content: (
        <div className="space-y-4">
          <div className="bg-red-900/20 border border-red-800 rounded-lg p-4">
            <h4 className="text-red-400 font-semibold mb-3">
              Before putting real funds
            </h4>
            <div className="space-y-2">
              {[
                "Seed phrase backed up 3 times (USB, cloud, paper)",
                "Recovery test successful",
                "Strong password (16+ chars)",
                "Password stored in manager",
                "Automatic backup configured",
                "DB permissions 600",
                "Active antivirus",
                "Operating system up to date",
              ].map((item, idx) => (
                <label
                  key={idx}
                  className="flex items-center space-x-2 text-gray-300 text-sm hover:bg-gray-900 p-2 rounded cursor-pointer"
                >
                  <input
                    type="checkbox"
                    className="w-4 h-4 text-red-600 bg-gray-700 border-gray-600 rounded focus:ring-red-500"
                  />
                  <span>{item}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4">
            <h4 className="text-blue-400 font-semibold mb-3">Daily</h4>
            <div className="space-y-2">
              {[
                "Lock Offivex when inactive",
                "Weekly backup verified",
                "No screenshots with seed phrase",
                "Browser up to date",
              ].map((item, idx) => (
                <label
                  key={idx}
                  className="flex items-center space-x-2 text-gray-300 text-sm hover:bg-gray-900 p-2 rounded cursor-pointer"
                >
                  <input
                    type="checkbox"
                    className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                  />
                  <span>{item}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="bg-purple-900/20 border border-purple-800 rounded-lg p-4">
            <h4 className="text-purple-400 font-semibold mb-3">Monthly</h4>
            <div className="space-y-2">
              {[
                "Test restoration from backup",
                "Verify file permissions",
                "Audit security logs",
              ].map((item, idx) => (
                <label
                  key={idx}
                  className="flex items-center space-x-2 text-gray-300 text-sm hover:bg-gray-900 p-2 rounded cursor-pointer"
                >
                  <input
                    type="checkbox"
                    className="w-4 h-4 text-purple-600 bg-gray-700 border-gray-600 rounded focus:ring-purple-500"
                  />
                  <span>{item}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "resources",
      title: "Resources & Support",
      content: (
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-offivex-purple-light">
            Technical Documentation
          </h3>
          <div className="space-y-2">
            <a
              href="https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki"
              target="_blank"
              rel="noopener noreferrer"
              className="block p-3 bg-gray-900 rounded-lg border border-gray-800 hover:border-blue-500 transition-colors"
            >
              <h5 className="text-blue-400 font-semibold text-sm flex items-center gap-2">
                BIP39 Standard
                <ArrowTopRightOnSquareIcon className="w-3 h-3" />
              </h5>
              <p className="text-gray-400 text-xs mt-1">
                Bitcoin Improvement Proposal for mnemonic seed phrases
              </p>
            </a>
            <a
              href="https://github.com/P-H-C/phc-winner-argon2"
              target="_blank"
              rel="noopener noreferrer"
              className="block p-3 bg-gray-900 rounded-lg border border-gray-800 hover:border-blue-500 transition-colors"
            >
              <h5 className="text-blue-400 font-semibold text-sm flex items-center gap-2">
                Argon2
                <ArrowTopRightOnSquareIcon className="w-3 h-3" />
              </h5>
              <p className="text-gray-400 text-xs mt-1">
                Winner Password Hashing Competition
              </p>
            </a>
            <a
              href="https://en.wikipedia.org/wiki/Galois/Counter_Mode"
              target="_blank"
              rel="noopener noreferrer"
              className="block p-3 bg-gray-900 rounded-lg border border-gray-800 hover:border-blue-500 transition-colors"
            >
              <h5 className="text-blue-400 font-semibold text-sm flex items-center gap-2">
                AES-256-GCM
                <ArrowTopRightOnSquareIcon className="w-3 h-3" />
              </h5>
              <p className="text-gray-400 text-xs mt-1">
                Galois/Counter Mode authenticated encryption
              </p>
            </a>
          </div>

          <h3 className="text-xl font-semibold text-purple-400 mt-6">
            Password Managers
          </h3>
          <div className="grid md:grid-cols-3 gap-3">
            <a
              href="https://1password.com"
              target="_blank"
              rel="noopener noreferrer"
              className="block p-3 bg-gray-900 rounded-lg border border-gray-800 hover:border-purple-500 transition-colors text-center"
            >
              <h5 className="text-purple-400 font-semibold text-sm flex items-center justify-center gap-2">
                1Password
                <ArrowTopRightOnSquareIcon className="w-3 h-3" />
              </h5>
            </a>
            <a
              href="https://bitwarden.com"
              target="_blank"
              rel="noopener noreferrer"
              className="block p-3 bg-gray-900 rounded-lg border border-gray-800 hover:border-purple-500 transition-colors text-center"
            >
              <h5 className="text-purple-400 font-semibold text-sm flex items-center justify-center gap-2">
                Bitwarden
                <ArrowTopRightOnSquareIcon className="w-3 h-3" />
              </h5>
            </a>
            <a
              href="https://keepassxc.org"
              target="_blank"
              rel="noopener noreferrer"
              className="block p-3 bg-gray-900 rounded-lg border border-gray-800 hover:border-purple-500 transition-colors text-center"
            >
              <h5 className="text-purple-400 font-semibold text-sm flex items-center justify-center gap-2">
                KeePassXC
                <ArrowTopRightOnSquareIcon className="w-3 h-3" />
              </h5>
            </a>
          </div>

          <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 mt-6">
            <h3 className="text-red-400 font-semibold mb-3 flex items-center gap-2">
              <ExclamationTriangleIcon className="w-5 h-5" />
              Security issue?
            </h3>
            <p className="text-gray-300 text-sm mb-3">
              <strong>DO NOT</strong> post publicly!
            </p>
            <div className="space-y-2 text-sm">
              <div className="bg-gray-900 rounded p-2">
                <span className="text-gray-400">Email:</span>
                <span className="text-gray-300 ml-2">
                  security@offivex.io (if configured)
                </span>
              </div>
              <div className="bg-gray-900 rounded p-2">
                <span className="text-gray-400">GitHub Security:</span>
                <a
                  href="https://github.com/your-repo/offivex/security"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 ml-2 underline inline-flex items-center gap-1"
                >
                  Security Advisory
                  <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>

          <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <h3 className="text-amber-400 font-semibold mb-3">
              Known Vulnerabilities
            </h3>
            <p className="text-gray-400 text-sm mb-3">
              See: AUDIT_REPORT.md for complete details
            </p>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between p-2 bg-gray-800 rounded">
                <span className="text-gray-300">
                  SEC-01: Export wallet (plaintext keys)
                </span>
                <span className="text-amber-400">To fix</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-gray-800 rounded">
                <span className="text-gray-300">
                  SEC-02: Vanity grind (unencrypted keys)
                </span>
                <span className="text-amber-400">To fix</span>
              </div>
              <div className="flex items-center justify-between p-2 bg-gray-800 rounded">
                <span className="text-gray-300">SEC-03: Centralized middleware</span>
                <span className="text-green-400 flex items-center gap-1">
                  <CheckCircleIcon className="w-3 h-3" />
                  Fixed
                </span>
              </div>
              <div className="flex items-center justify-between p-2 bg-gray-800 rounded">
                <span className="text-gray-300">SEC-04: Zeroization</span>
                <span className="text-green-400 flex items-center gap-1">
                  <CheckCircleIcon className="w-3 h-3" />
                  Fixed
                </span>
              </div>
              <div className="flex items-center justify-between p-2 bg-gray-800 rounded">
                <span className="text-gray-300">SEC-05: DB permissions</span>
                <span className="text-green-400 flex items-center gap-1">
                  <CheckCircleIcon className="w-3 h-3" />
                  Fixed (600)
                </span>
              </div>
              <div className="flex items-center justify-between p-2 bg-gray-800 rounded">
                <span className="text-gray-300">Rate limiting</span>
                <span className="text-green-400 flex items-center gap-1">
                  <CheckCircleIcon className="w-3 h-3" />
                  Implemented
                </span>
              </div>
            </div>
          </div>

          <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-4 text-center">
            <p className="text-blue-300 font-semibold flex items-center justify-center gap-2">
              <ShieldCheckIcon className="w-5 h-5" />
              Security is a continuous process, not a state. Stay vigilant!
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
          Security Guide & Best Practices
        </h1>
        <p className="text-gray-400 text-lg">
          Key protection, backups, recovery and incident response
        </p>
      </div>

      <div className="mb-8 p-4 rounded-lg border border-offivex-purple/30 bg-offivex-purple/[0.05]">
        <p className="text-sm text-gray-300 leading-relaxed">
          <strong className="text-offivex-purple-light">Looking for the short version?</strong>{" "}
          The{" "}
          <Link
            href="/docs/feature/security"
            className="text-offivex-purple-light underline"
          >
            Security feature page
          </Link>{" "}
          is a one-page summary covering master password rules, seed phrase
          handling, auto-lock, export, rotation, and disaster recovery — read
          that first, come back here for the long-form details and threat
          scenarios.
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
            href="/docs/features"
            className="group block p-4 rounded-lg bg-gray-900 border border-gray-800 hover:border-offivex-purple hover:shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-offivex-purple"
          >
            <h4 className="font-semibold text-offivex-purple-light mb-1 group-hover:translate-x-1 transition-transform">
              Complete Features
            </h4>
            <p className="text-sm text-gray-400 group-hover:text-gray-300 transition-colors">
              Token minting, bundles, anti-bubble distribution
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
