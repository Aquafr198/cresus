"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

// SessionStorage relay key — set by /pay/[invoiceId] when the reveal succeeds,
// read + cleared by this page. Decouples the post-payment redirect from query
// params (which would otherwise leak the API key in browser history).
const RELAY_KEY = "offivex_welcome_reveal";

interface RelayPayload {
  invoiceId: string;
  apiKey: string;
  ts: number;
}

export default function WelcomePage() {
  const router = useRouter();
  const params = useSearchParams();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [acked, setAcked] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Read + clear (one-shot — refresh after dismissing intentionally drops it)
    const raw = window.sessionStorage.getItem(RELAY_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as RelayPayload;
        // Validate freshness (< 10 minutes) — defends against stale relay state
        if (Date.now() - parsed.ts < 600_000 && parsed.apiKey && parsed.invoiceId) {
          setApiKey(parsed.apiKey);
          setInvoiceId(parsed.invoiceId);
        }
      } catch {
        /* malformed payload — ignore */
      }
      // We do NOT clear immediately so the user can refresh the welcome page
      // once if they accidentally lost focus. Clear happens on "Continue" click.
    }
    // Also support ?id= for direct navigation back to welcome (no apiKey,
    // just the tour view).
    const id = params?.get("id");
    if (id && !invoiceId) setInvoiceId(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCopy = async () => {
    if (!apiKey) return;
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  const handleDownload = () => {
    if (!apiKey) return;
    const blob = new Blob(
      [
        `Offivex API key — store this safely.\n\n${apiKey}\n\n` +
          `Generated: ${new Date().toISOString()}\n` +
          (invoiceId ? `Invoice: ${invoiceId}\n` : ""),
      ],
      { type: "text/plain" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const prefix = apiKey.slice(0, 12);
    a.download = `offivex-api-key-${prefix}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleContinue = () => {
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(RELAY_KEY);
    }
    // Clear the plaintext key from React state BEFORE navigating so it
    // can't be retrieved via DevTools after the user clicks Continue.
    // Pre-refactor `apiKey` stayed in memory for the full lifetime of the
    // /welcome component, and a screen-sharing user could pull it from
    // the Components tab even after seeing the success screen.
    setApiKey(null);
    router.push("/wallets");
  };

  return (
    <div className="min-h-screen bg-offivex-bg-base text-offivex-text-primary flex flex-col items-center px-6 py-12">
      <div className="mb-10">
        <Link href="/" className="inline-flex items-center gap-3">
          <Image src="/logo.png" alt="Offivex" width={48} height={40} priority />
        </Link>
      </div>

      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="text-[11px] uppercase tracking-[0.2em] text-offivex-purple-light mb-2">
            Welcome to Offivex
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight mb-2">
            {apiKey ? "Payment confirmed" : "You're all set"}
          </h1>
          <p className="text-sm text-offivex-text-secondary">
            {apiKey
              ? "Save your API key now — it's shown ONCE."
              : "Your access is active. Head to the dashboard to start launching."}
          </p>
        </div>

        {apiKey && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/[0.05] p-5 space-y-4">
            <div className="text-xs font-medium text-red-300 uppercase tracking-wider">
              ⚠ Save this key now — we cannot recover it
            </div>
            <div className="font-mono text-sm bg-black/50 border border-white/10 rounded-lg p-3 break-all">
              {apiKey}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="flex-1 px-3 py-2 rounded-lg bg-white/[0.05] border border-white/[0.10] text-sm text-offivex-text-primary hover:bg-white/[0.08] transition-colors"
              >
                {copied ? "Copied ✓" : "Copy"}
              </button>
              <button
                onClick={handleDownload}
                className="flex-1 px-3 py-2 rounded-lg bg-white/[0.05] border border-white/[0.10] text-sm text-offivex-text-primary hover:bg-white/[0.08] transition-colors"
              >
                Download .txt
              </button>
            </div>
            <label className="flex items-start gap-2 text-sm text-offivex-text-secondary cursor-pointer select-none">
              <input
                type="checkbox"
                checked={acked}
                onChange={(e) => setAcked(e.target.checked)}
                className="mt-0.5 accent-offivex-purple"
              />
              <span>I have saved my API key in a safe place</span>
            </label>
          </div>
        )}

        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <div className="text-xs uppercase tracking-wider text-offivex-text-muted mb-3">
            Next steps
          </div>
          <ol className="space-y-2 text-sm text-offivex-text-secondary">
            <Step
              done={!!apiKey}
              label="Save your API key"
            />
            <Step
              done={false}
              label="Create a wallet — generates a fresh Solana keypair, encrypted at rest"
            />
            <Step
              done={false}
              label="Mint your first token (or import an existing mint)"
            />
            <Step
              done={false}
              label="Launch a bundle — atomic market + pool + snipe via Jito"
            />
          </ol>
        </div>

        <button
          onClick={handleContinue}
          disabled={!!apiKey && !acked}
          className="w-full py-2.5 rounded-lg btn-purple text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue to dashboard
        </button>

        {!apiKey && (
          <div className="text-center text-xs text-offivex-text-muted">
            Lost your key? Contact admin on{" "}
            <a
              href="https://t.me/offivex"
              target="_blank"
              rel="noopener noreferrer"
              className="text-offivex-purple-light hover:text-white underline"
            >
              Telegram
            </a>{" "}
            to request a rotation.
          </div>
        )}
      </div>
    </div>
  );
}

function Step({ done, label }: { done: boolean; label: string }) {
  return (
    <li className="flex items-start gap-2">
      <span
        className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold mt-0.5 ${
          done
            ? "bg-green-500/20 text-green-300 border border-green-500/30"
            : "bg-white/[0.04] text-offivex-text-muted border border-white/[0.10]"
        }`}
      >
        {done ? "✓" : "·"}
      </span>
      <span className="flex-1">{label}</span>
    </li>
  );
}
