"use client";

import { useEffect, useState } from "react";
import { api, type AdminPaymentView, type PaymentStatusFilter } from "@/lib/api";

const TABS: { key: PaymentStatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "confirming", label: "Confirming" },
  { key: "confirmed", label: "Confirmed" },
  { key: "underpaid", label: "Underpaid" },
  { key: "expired", label: "Expired" },
  { key: "failed", label: "Failed" },
];

export default function AdminPaymentsPage() {
  const [tab, setTab] = useState<PaymentStatusFilter>("all");
  const [rows, setRows] = useState<AdminPaymentView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async (filter: PaymentStatusFilter) => {
    setError(null);
    setRows(null);
    try {
      const res = await api.admin.listPayments(filter === "all" ? undefined : filter);
      setRows(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load payments");
      setRows([]);
    }
  };

  useEffect(() => {
    void load(tab);
  }, [tab]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-offivex-purple-light mb-1">
            Treasury
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Payments
          </h1>
        </div>
        <button
          onClick={() => void load(tab)}
          className="px-3.5 py-2 rounded-lg text-sm text-offivex-text-secondary hover:text-white border border-white/[0.06] hover:border-white/[0.12] transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-white/[0.06] overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={
              "px-4 py-2 text-sm transition-colors border-b-2 -mb-px whitespace-nowrap " +
              (tab === t.key
                ? "border-offivex-purple text-white"
                : "border-transparent text-offivex-text-secondary hover:text-white")
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm mb-4">
          {error}
        </div>
      )}

      {rows === null ? (
        <div className="text-sm text-offivex-text-muted py-12 text-center">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-offivex-text-muted py-12 text-center border border-white/[0.06] bg-white/[0.02] rounded-2xl">
          No {tab === "all" ? "" : tab} payments.
        </div>
      ) : (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-offivex-text-muted bg-white/[0.02]">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Created</th>
                <th className="text-left px-4 py-3 font-medium">User</th>
                <th className="text-left px-4 py-3 font-medium">Plan</th>
                <th className="text-right px-4 py-3 font-medium">Amount</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Tx</th>
                <th className="text-left px-4 py-3 font-medium">Confirmed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-t border-white/[0.04] hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-offivex-text-secondary whitespace-nowrap">
                    {formatRelative(p.created_at)}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-offivex-text-secondary">
                    {truncId(p.user_id)}
                  </td>
                  <td className="px-4 py-3 text-offivex-text-secondary">
                    {formatPlan(p.plan_id)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono whitespace-nowrap">
                    <div className="text-offivex-text-primary">
                      {p.amount_sol_str ?? "—"} SOL
                    </div>
                    <div className="text-[10px] text-offivex-text-muted">
                      ${(p.amount_usd_cents / 100).toFixed(2)}
                      {p.sol_usd_rate_cents
                        ? ` · $${(p.sol_usd_rate_cents / 100).toFixed(2)}/SOL`
                        : ""}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-4 py-3">
                    {p.tx_hash ? (
                      <a
                        href={`https://solscan.io/tx/${p.tx_hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-[11px] text-offivex-purple-light hover:text-white underline"
                      >
                        {truncId(p.tx_hash, 8)}
                      </a>
                    ) : (
                      <span className="text-offivex-text-muted text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-offivex-text-muted whitespace-nowrap text-xs">
                    {p.confirmed_at ? formatRelative(p.confirmed_at) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === "confirmed"
      ? "bg-offivex-green/15 border-offivex-green/30 text-offivex-green-light"
      : status === "pending" || status === "confirming"
        ? "bg-offivex-purple/15 border-offivex-purple/30 text-offivex-purple-light"
        : status === "underpaid" || status === "failed"
          ? "bg-red-500/10 border-red-500/30 text-red-300"
          : "bg-zinc-500/10 border-zinc-500/30 text-zinc-400";
  return (
    <span
      className={
        "inline-block px-2 py-0.5 rounded-md text-[11px] uppercase tracking-wider border " +
        styles
      }
    >
      {status}
    </span>
  );
}

function formatPlan(planId: string): string {
  if (planId === "plan_monthly_default") return "Monthly";
  if (planId === "plan_yearly_default") return "Yearly";
  return planId;
}

function truncId(s: string, head = 6): string {
  if (s.length <= head + 4) return s;
  return `${s.slice(0, head)}…`;
}

function formatRelative(ts: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - ts;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
