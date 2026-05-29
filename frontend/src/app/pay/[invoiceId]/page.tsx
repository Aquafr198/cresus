"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  invoiceApi,
  USER_API_KEY_STORAGE,
  ApiError,
  type InvoicePublicView,
  type InvoiceStatusView,
} from "@/lib/api";

// Relay-key for handing off the freshly-revealed API key to `/welcome` via
// sessionStorage (avoids leaking the key in URL/history).
// Must match `RELAY_KEY` in src/app/welcome/page.tsx.
const WELCOME_RELAY_KEY = "offivex_welcome_reveal";

type Phase =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "pending"; invoice: InvoicePublicView; status: InvoiceStatusView }
  | { kind: "confirming"; invoice: InvoicePublicView; status: InvoiceStatusView }
  | {
      kind: "confirmed-reveal";
      invoice: InvoicePublicView;
      apiKey: string;
      txHash: string | null;
    }
  | {
      kind: "confirmed-already-revealed";
      invoice: InvoicePublicView;
      txHash: string | null;
    }
  | { kind: "expired"; invoice: InvoicePublicView }
  | { kind: "underpaid"; invoice: InvoicePublicView; status: InvoiceStatusView }
  | { kind: "failed"; invoice: InvoicePublicView };

const POLL_INTERVAL_MS = 3000;

export default function PayInvoicePage() {
  const params = useParams<{ invoiceId: string }>();
  const router = useRouter();
  const invoiceId = params?.invoiceId ?? "";
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const pollTimer = useRef<NodeJS.Timeout | null>(null);
  const stopped = useRef(false);

  const refreshInvoice = useCallback(async (): Promise<InvoicePublicView | null> => {
    try {
      const res = await invoiceApi.get(invoiceId);
      return res.data;
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setPhase({ kind: "error", message: "Invoice not found." });
      } else {
        setPhase({
          kind: "error",
          message: e instanceof Error ? e.message : "Network error",
        });
      }
      return null;
    }
  }, [invoiceId]);

  const pollStatus = useCallback(
    async (invoice: InvoicePublicView) => {
      if (stopped.current) return;
      try {
        const res = await invoiceApi.status(invoiceId);
        const s = res.data;

        switch (s.status) {
          case "pending":
            setPhase({ kind: "pending", invoice, status: s });
            break;
          case "confirming":
            setPhase({ kind: "confirming", invoice, status: s });
            break;
          case "confirmed":
            stopped.current = true;
            if (s.api_key) {
              // UX-1 — relay the fresh API key to /welcome via sessionStorage
              // (avoids leaking it in URL/history). Also persist to localStorage
              // so AuthGate picks it up immediately on the next protected route.
              if (typeof window !== "undefined") {
                window.localStorage.setItem(USER_API_KEY_STORAGE, s.api_key);
                window.sessionStorage.setItem(
                  WELCOME_RELAY_KEY,
                  JSON.stringify({
                    invoiceId,
                    apiKey: s.api_key,
                    ts: Date.now(),
                  }),
                );
              }
              router.push("/welcome");
              // Keep the visible state aligned in case the navigation is slow
              setPhase({
                kind: "confirmed-reveal",
                invoice,
                apiKey: s.api_key,
                txHash: s.tx_hash,
              });
            } else {
              setPhase({
                kind: "confirmed-already-revealed",
                invoice,
                txHash: s.tx_hash,
              });
            }
            break;
          case "expired":
            stopped.current = true;
            setPhase({ kind: "expired", invoice });
            break;
          case "underpaid":
            stopped.current = true;
            setPhase({ kind: "underpaid", invoice, status: s });
            break;
          case "failed":
            stopped.current = true;
            setPhase({ kind: "failed", invoice });
            break;
        }
      } catch (e) {
        // Transient network error — keep current phase, retry next tick
        console.warn("pay status poll error", e);
      }
    },
    [invoiceId]
  );

  useEffect(() => {
    if (!invoiceId) return;
    stopped.current = false;

    // Audit P3 PERF-6 — replace fixed `setInterval` with a self-scheduling
    // `setTimeout` chain that adds ±500ms jitter to each tick. Without jitter,
    // 200 simultaneous /pay pages produce a synchronized request spike every
    // 3s (~67 GET/sec); with jitter the load smooths out flat.
    const schedule = (invoice: InvoicePublicView) => {
      const delay = POLL_INTERVAL_MS + (Math.random() - 0.5) * 1000;
      pollTimer.current = setTimeout(async () => {
        if (stopped.current) return;
        await pollStatus(invoice);
        if (!stopped.current) schedule(invoice);
      }, delay);
    };

    (async () => {
      const invoice = await refreshInvoice();
      if (!invoice) return;
      await pollStatus(invoice);
      if (!stopped.current) schedule(invoice);
    })();

    return () => {
      stopped.current = true;
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [invoiceId, refreshInvoice, pollStatus]);

  return (
    <div className="min-h-screen bg-offivex-bg-base text-offivex-text-primary flex flex-col items-center px-6 py-12">
      {/* Logo top */}
      <div className="mb-12">
        <Link href="/" className="inline-flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="Offivex"
            width={48}
            height={40}
            priority
          />
        </Link>
      </div>

      {/* Card */}
      <div className="w-full max-w-md">
        {phase.kind === "loading" && <LoadingCard />}
        {phase.kind === "error" && <ErrorCard message={phase.message} />}
        {phase.kind === "pending" && (
          <PendingCard invoice={phase.invoice} />
        )}
        {phase.kind === "confirming" && (
          <ConfirmingCard invoice={phase.invoice} />
        )}
        {phase.kind === "confirmed-reveal" && (
          <RevealCard
            invoice={phase.invoice}
            apiKey={phase.apiKey}
            txHash={phase.txHash}
          />
        )}
        {phase.kind === "confirmed-already-revealed" && (
          <AlreadyRevealedCard invoice={phase.invoice} txHash={phase.txHash} />
        )}
        {phase.kind === "expired" && <ExpiredCard invoice={phase.invoice} />}
        {phase.kind === "underpaid" && (
          <UnderpaidCard invoice={phase.invoice} status={phase.status} />
        )}
        {phase.kind === "failed" && <FailedCard invoice={phase.invoice} />}
      </div>
    </div>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-900/80 to-black/60 p-6 shadow-2xl">
      {children}
    </div>
  );
}

function LoadingCard() {
  return (
    <Card>
      <div className="text-sm text-offivex-text-muted py-8 text-center">
        Loading invoice…
      </div>
    </Card>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <Card>
      <div className="text-center py-4">
        <div className="font-display text-xl font-semibold mb-2">
          Cannot load invoice
        </div>
        <div className="text-sm text-offivex-text-secondary mb-4">{message}</div>
        <a
          href="mailto:hello@offivex.io"
          className="text-sm text-offivex-purple-light hover:text-white underline"
        >
          Contact support
        </a>
      </div>
    </Card>
  );
}

function StatusPill({ status }: { status: InvoicePublicView["status"] }) {
  const map: Record<
    InvoicePublicView["status"],
    { label: string; classes: string; icon: string }
  > = {
    pending: {
      label: "Awaiting Payment",
      classes:
        "bg-amber-500/15 text-amber-300 border-amber-500/30",
      icon: "◌",
    },
    confirming: {
      label: "Confirming",
      classes: "bg-blue-500/15 text-blue-300 border-blue-500/30",
      icon: "◐",
    },
    confirmed: {
      label: "Paid",
      classes:
        "bg-offivex-green/15 text-offivex-green-light border-offivex-green/30",
      icon: "✓",
    },
    expired: {
      label: "Expired",
      classes: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
      icon: "⏱",
    },
    underpaid: {
      label: "Underpaid",
      classes: "bg-red-500/15 text-red-300 border-red-500/30",
      icon: "⚠",
    },
    failed: {
      label: "Failed",
      classes: "bg-red-500/15 text-red-300 border-red-500/30",
      icon: "✕",
    },
  };
  const cfg = map[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.classes}`}
    >
      <span className={status === "pending" ? "animate-pulse" : ""}>
        {cfg.icon}
      </span>
      {cfg.label}
    </span>
  );
}

function CopyButton({ value, ariaLabel }: { value: string; ariaLabel: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={async () => {
        if (typeof navigator === "undefined") return;
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // fallthrough
        }
      }}
      className="ml-2 inline-flex items-center justify-center w-7 h-7 rounded-md bg-white/[0.04] border border-white/[0.06] text-offivex-text-secondary hover:text-white hover:bg-white/[0.08] transition-colors"
    >
      {copied ? "✓" : (
        <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5">
          <path
            d="M8 4h10v14M6 6h10v14H6z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}

function FieldRow({
  label,
  value,
  copyValue,
  mono,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  copyValue?: string;
  mono?: boolean;
  sub?: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-offivex-text-muted mb-1.5">
        {label}
      </div>
      <div className="flex items-center justify-between gap-2">
        <div
          className={
            "min-w-0 break-all " +
            (mono ? "font-mono text-sm text-offivex-text-primary" : "")
          }
        >
          {value}
        </div>
        {copyValue && <CopyButton value={copyValue} ariaLabel={`Copy ${label}`} />}
      </div>
      {sub && (
        <div className="text-xs text-offivex-text-secondary mt-1">{sub}</div>
      )}
    </div>
  );
}

function truncMiddle(s: string, head = 8, tail = 6): string {
  if (s.length <= head + tail + 3) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

function formatExpiresIn(expires_at: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = expires_at - now;
  if (diff <= 0) return "Expired";
  const m = Math.floor(diff / 60);
  const s = diff % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatUsd(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function PendingCard({ invoice }: { invoice: InvoicePublicView }) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <Card>
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="font-display text-xl font-semibold tracking-tight">
            Your Invoice
          </div>
          <div className="text-sm text-offivex-text-secondary mt-0.5">
            Pay with Solana — {invoice.plan_name}
          </div>
        </div>
        <StatusPill status="pending" />
      </div>

      <div className="space-y-5">
        <FieldRow
          label="Payment address"
          value={
            invoice.address ? (
              <span className="font-mono text-sm">
                {truncMiddle(invoice.address, 6, 6)}
              </span>
            ) : (
              <span className="text-offivex-text-muted">Generating…</span>
            )
          }
          copyValue={invoice.address ?? undefined}
        />

        <FieldRow
          label="Amount"
          value={
            invoice.amount_sol_str ? (
              <span className="font-mono text-2xl font-semibold">
                {invoice.amount_sol_str} SOL
              </span>
            ) : (
              <span className="text-offivex-text-muted">—</span>
            )
          }
          copyValue={invoice.amount_sol_str ?? undefined}
          sub={
            <>
              ≈ {formatUsd(invoice.amount_usd_cents)}
              {invoice.sol_usd_rate_cents
                ? ` · rate locked at $${(invoice.sol_usd_rate_cents / 100).toFixed(2)}/SOL`
                : ""}
            </>
          }
        />

        {invoice.expires_at && (
          <div className="pt-2 border-t border-white/[0.06] text-xs text-offivex-text-muted">
            Expires in {formatExpiresIn(invoice.expires_at)}
          </div>
        )}
      </div>

      <div className="mt-6 text-[11px] text-offivex-text-muted leading-relaxed">
        Send the exact SOL amount to the address above from any Solana wallet
        (Phantom, Solflare, Backpack…). Confirmation typically takes 5–15
        seconds after broadcast.
      </div>
    </Card>
  );
}

function ConfirmingCard({ invoice }: { invoice: InvoicePublicView }) {
  return (
    <Card>
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="font-display text-xl font-semibold tracking-tight">
            Confirming on-chain
          </div>
          <div className="text-sm text-offivex-text-secondary mt-0.5">
            We detected your transfer. Waiting for confirmation…
          </div>
        </div>
        <StatusPill status="confirming" />
      </div>
      <div className="flex items-center justify-center py-6">
        <div className="w-10 h-10 rounded-full border-2 border-offivex-purple/30 border-t-offivex-purple animate-spin"></div>
      </div>
      <div className="text-xs text-offivex-text-muted text-center">
        This usually completes within 10 seconds. Please don&apos;t close this page.
      </div>
      {invoice.address && (
        <div className="mt-4 text-[10px] text-offivex-text-muted font-mono break-all">
          {invoice.address}
        </div>
      )}
    </Card>
  );
}

function RevealCard({
  invoice,
  apiKey,
  txHash,
}: {
  invoice: InvoicePublicView;
  apiKey: string;
  txHash: string | null;
}) {
  const [confirmed, setConfirmed] = useState(false);

  const handleDownload = () => {
    if (typeof window === "undefined") return;
    const content = `Offivex API key (KEEP SAFE — cannot be recovered)\nGenerated: ${new Date().toISOString()}\nPlan: ${invoice.plan_name}\n\n${apiKey}\n`;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `offivex-api-key-${apiKey.slice(0, 17)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="font-display text-xl font-semibold tracking-tight">
            Payment Received
          </div>
          <div className="text-sm text-offivex-text-secondary mt-0.5">
            Your API key — save it now
          </div>
        </div>
        <StatusPill status="confirmed" />
      </div>

      <div className="px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-200 text-xs leading-relaxed mb-5">
        <span className="font-semibold">⚠ This key is shown ONCE.</span> We
        cannot recover it if you lose it. Save it somewhere safe before
        continuing.
      </div>

      <FieldRow
        label="Your API key"
        value={<span className="font-mono text-sm break-all">{apiKey}</span>}
      />

      <div className="mt-3 flex gap-2">
        <CopyButton value={apiKey} ariaLabel="Copy API key" />
        <button
          type="button"
          onClick={handleDownload}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-offivex-text-secondary hover:text-white hover:bg-white/[0.08] text-xs transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5">
            <path
              d="M12 4v12m0 0-4-4m4 4 4-4M5 20h14"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Download .txt
        </button>
      </div>

      <label className="flex items-center gap-2 mt-6 cursor-pointer">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="w-4 h-4 rounded border-white/20 bg-white/[0.05]"
        />
        <span className="text-xs text-offivex-text-secondary">
          I have saved my API key in a secure place
        </span>
      </label>

      <Link
        href="/login"
        className={
          "block w-full mt-5 py-2.5 rounded-lg text-sm text-center transition-colors " +
          (confirmed
            ? "btn-purple"
            : "bg-white/[0.04] border border-white/[0.06] text-offivex-text-muted pointer-events-none")
        }
      >
        Continue to sign in →
      </Link>

      {txHash && (
        <div className="mt-5 pt-4 border-t border-white/[0.04] text-[10px] text-offivex-text-muted">
          Transaction:{" "}
          <a
            href={`https://solscan.io/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono hover:text-offivex-purple-light underline break-all"
          >
            {truncMiddle(txHash, 12, 8)}
          </a>
        </div>
      )}
    </Card>
  );
}

function AlreadyRevealedCard({
  invoice,
  txHash,
}: {
  invoice: InvoicePublicView;
  txHash: string | null;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="font-display text-xl font-semibold tracking-tight">
            Payment Confirmed
          </div>
          <div className="text-sm text-offivex-text-secondary mt-0.5">
            Plan {invoice.plan_name} active
          </div>
        </div>
        <StatusPill status="confirmed" />
      </div>

      <div className="px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs leading-relaxed mb-4">
        Your API key was already revealed on a previous visit. If you saved it,
        use it on the sign-in page below. If you lost it, contact admin to
        rotate.
      </div>

      <Link
        href="/login"
        className="block w-full py-2.5 rounded-lg btn-purple text-sm text-center"
      >
        Sign in with your API key
      </Link>

      {txHash && (
        <div className="mt-5 pt-4 border-t border-white/[0.04] text-[10px] text-offivex-text-muted">
          Transaction:{" "}
          <a
            href={`https://solscan.io/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono hover:text-offivex-purple-light underline break-all"
          >
            {truncMiddle(txHash, 12, 8)}
          </a>
        </div>
      )}
    </Card>
  );
}

function ExpiredCard({ invoice }: { invoice: InvoicePublicView }) {
  return (
    <Card>
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="font-display text-xl font-semibold tracking-tight">
            Invoice expired
          </div>
          <div className="text-sm text-offivex-text-secondary mt-0.5">
            {invoice.plan_name} — no payment received in 30 min
          </div>
        </div>
        <StatusPill status="expired" />
      </div>
      <div className="text-xs text-offivex-text-secondary leading-relaxed mb-4">
        SOL/USD rate windows lock for 30 minutes. Request a new payment link
        from your admin to generate a fresh invoice at the current rate.
      </div>
      <a
        href="mailto:hello@offivex.io"
        className="block w-full py-2.5 rounded-lg btn-outline text-sm text-center"
      >
        Request a new invoice
      </a>
    </Card>
  );
}

function UnderpaidCard({
  invoice,
  status,
}: {
  invoice: InvoicePublicView;
  status: InvoiceStatusView;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="font-display text-xl font-semibold tracking-tight">
            Underpayment detected
          </div>
          <div className="text-sm text-offivex-text-secondary mt-0.5">
            {invoice.plan_name}
          </div>
        </div>
        <StatusPill status="underpaid" />
      </div>
      <div className="text-xs text-offivex-text-secondary leading-relaxed mb-4">
        We received your transfer but the amount was below the required total
        (we allow 0.5% tolerance for network fees). Contact support to resolve.
      </div>
      {status.tx_hash && (
        <a
          href={`https://solscan.io/tx/${status.tx_hash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-[10px] font-mono text-offivex-text-muted hover:text-offivex-purple-light underline break-all mb-4"
        >
          View transaction
        </a>
      )}
      <a
        href="mailto:hello@offivex.io"
        className="block w-full py-2.5 rounded-lg btn-purple text-sm text-center"
      >
        Contact support
      </a>
    </Card>
  );
}

function FailedCard({ invoice }: { invoice: InvoicePublicView }) {
  return (
    <Card>
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="font-display text-xl font-semibold tracking-tight">
            Invoice cancelled
          </div>
          <div className="text-sm text-offivex-text-secondary mt-0.5">
            {invoice.plan_name}
          </div>
        </div>
        <StatusPill status="failed" />
      </div>
      <div className="text-xs text-offivex-text-secondary mb-4">
        This invoice was cancelled by admin. Contact support for help.
      </div>
      <a
        href="mailto:hello@offivex.io"
        className="block w-full py-2.5 rounded-lg btn-outline text-sm text-center"
      >
        Contact support
      </a>
    </Card>
  );
}
