"use client";

import { Fragment, useEffect, useState } from "react";
import {
  api,
  ApiError,
  type AdminApplyView,
  type InvoiceCreatedView,
} from "@/lib/api";
import { GrantAccessModal } from "@/components/admin/GrantAccessModal";

type StatusFilter = "pending" | "approved" | "rejected" | "all";

const TABS: { key: StatusFilter; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

export default function AdminAppliesPage() {
  const [tab, setTab] = useState<StatusFilter>("pending");
  const [rows, setRows] = useState<AdminApplyView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<{ id: string; kind: "approve" | "reject" } | null>(null);

  // Reject modal state
  const [rejectTarget, setRejectTarget] = useState<AdminApplyView | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");

  // Send-payment-link modal state (Phase 5.8)
  const [sendLinkTarget, setSendLinkTarget] = useState<AdminApplyView | null>(null);
  const [sendLinkPlan, setSendLinkPlan] = useState<"monthly" | "yearly">("monthly");
  const [sendLinkCreating, setSendLinkCreating] = useState(false);
  const [sendLinkResult, setSendLinkResult] = useState<InvoiceCreatedView | null>(null);
  const [sendLinkError, setSendLinkError] = useState<string | null>(null);

  // Grant-access modal state (Section 16)
  const [grantTarget, setGrantTarget] = useState<AdminApplyView | null>(null);

  // Expanded apply row (to show full project text)
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async (filter: StatusFilter) => {
    setError(null);
    setRows(null);
    try {
      const res = await api.admin.listApplies(filter);
      setRows(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load applies");
      setRows([]);
    }
  };

  useEffect(() => {
    void load(tab);
  }, [tab]);

  const onApprove = async (a: AdminApplyView) => {
    if (!confirm(`Approve apply from ${a.telegram} (${a.email})?`)) return;
    setActing({ id: a.id, kind: "approve" });
    try {
      const r = await api.admin.approveApply(a.id);
      alert(
        `Approved.\nuser_id: ${r.data.user_id}${
          r.data.user_already_existed ? "\n(reused existing user)" : ""
        }`
      );
      await load(tab);
    } catch (e) {
      if (e instanceof ApiError) alert(`Approve failed: ${e.message}`);
      else alert("Approve failed");
    } finally {
      setActing(null);
    }
  };

  const onRejectSubmit = async () => {
    if (!rejectTarget) return;
    setActing({ id: rejectTarget.id, kind: "reject" });
    try {
      await api.admin.rejectApply(rejectTarget.id, rejectNotes);
      setRejectTarget(null);
      setRejectNotes("");
      await load(tab);
    } catch (e) {
      if (e instanceof ApiError) alert(`Reject failed: ${e.message}`);
      else alert("Reject failed");
    } finally {
      setActing(null);
    }
  };

  // Phase 5.8 — open send-link modal for an approved apply
  const onOpenSendLink = (a: AdminApplyView) => {
    setSendLinkTarget(a);
    setSendLinkPlan((a.plan_pref as "monthly" | "yearly") ?? "monthly");
    setSendLinkResult(null);
    setSendLinkError(null);
  };

  const onCreateInvoice = async () => {
    if (!sendLinkTarget?.user_id_after_approval) return;
    setSendLinkCreating(true);
    setSendLinkError(null);
    try {
      const r = await api.admin.createInvoice(
        sendLinkTarget.user_id_after_approval,
        sendLinkPlan
      );
      setSendLinkResult(r.data);
    } catch (e) {
      setSendLinkError(e instanceof ApiError ? e.message : "Failed to create invoice");
    } finally {
      setSendLinkCreating(false);
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-offivex-purple-light mb-1">
            Reviews
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Apply requests
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
      <div className="flex gap-1 mb-5 border-b border-white/[0.06]">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={
              "px-4 py-2 text-sm transition-colors border-b-2 -mb-px " +
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
          No {tab === "all" ? "" : tab} applies.
        </div>
      ) : (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-offivex-text-muted bg-white/[0.02]">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Telegram</th>
                <th className="text-left px-4 py-3 font-medium">Email</th>
                <th className="text-left px-4 py-3 font-medium">Plan</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Submitted</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const isOpen = expanded === a.id;
                return (
                  <Fragment key={a.id}>
                    <tr
                      className="border-t border-white/[0.04] cursor-pointer hover:bg-white/[0.02]"
                      onClick={() => setExpanded(isOpen ? null : a.id)}
                    >
                      <td className="px-4 py-3 font-medium">{a.telegram}</td>
                      <td className="px-4 py-3 text-offivex-text-secondary">{a.email}</td>
                      <td className="px-4 py-3 text-offivex-text-secondary">
                        {a.plan_pref ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={a.status} />
                      </td>
                      <td className="px-4 py-3 text-offivex-text-muted whitespace-nowrap">
                        {formatRelative(a.submitted_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {a.status === "pending" ? (
                          <div
                            className="inline-flex gap-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => onApprove(a)}
                              disabled={acting?.id === a.id}
                              className="px-3 py-1.5 rounded-md text-xs btn-purple disabled:opacity-60"
                            >
                              {acting?.id === a.id && acting.kind === "approve"
                                ? "…"
                                : "Approve"}
                            </button>
                            <button
                              onClick={() => {
                                setRejectTarget(a);
                                setRejectNotes("");
                              }}
                              disabled={acting?.id === a.id}
                              className="px-3 py-1.5 rounded-md text-xs border border-white/[0.10] text-offivex-text-secondary hover:text-white hover:border-white/[0.20] transition-colors disabled:opacity-60"
                            >
                              Reject
                            </button>
                          </div>
                        ) : a.status === "approved" && a.user_id_after_approval ? (
                          <div
                            className="inline-flex gap-2 items-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => onOpenSendLink(a)}
                              className="px-3 py-1.5 rounded-md text-xs btn-purple"
                            >
                              Send payment link
                            </button>
                            <button
                              onClick={() => setGrantTarget(a)}
                              className="px-3 py-1.5 rounded-md text-xs border border-offivex-green/40 text-offivex-green-light hover:bg-offivex-green/10 transition-colors"
                              title="Grant immediate access without payment (comped / free)"
                            >
                              Grant access
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-offivex-text-muted">
                            {a.decided_at ? formatRelative(a.decided_at) : "—"}
                          </span>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-black/20">
                        <td colSpan={6} className="px-6 py-4">
                          <div className="text-[11px] uppercase tracking-wider text-offivex-text-muted mb-1.5">
                            Project
                          </div>
                          <div className="text-sm text-offivex-text-secondary leading-relaxed whitespace-pre-wrap mb-3">
                            {a.project}
                          </div>
                          {a.ip && (
                            <div className="text-xs text-offivex-text-muted">
                              IP: <span className="font-mono">{a.ip}</span>
                            </div>
                          )}
                          {a.notes && (
                            <div className="mt-2 text-xs text-offivex-text-muted">
                              Notes: {a.notes}
                            </div>
                          )}
                          {a.user_id_after_approval && (
                            <div className="mt-2 text-xs text-offivex-text-muted">
                              User created:{" "}
                              <span className="font-mono">
                                {a.user_id_after_approval}
                              </span>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Grant access modal (Section 16 — shared component) */}
      {grantTarget && grantTarget.user_id_after_approval && (
        <GrantAccessModal
          userId={grantTarget.user_id_after_approval}
          subtitle={`${grantTarget.telegram} · ${grantTarget.email}`}
          initialPlan={
            grantTarget.plan_pref === "yearly" ? "yearly" : "monthly"
          }
          onClose={() => setGrantTarget(null)}
          onGranted={() => {
            // After grant, refresh the applies list to surface any DB changes
            void load(tab);
          }}
        />
      )}

      {/* Send payment link modal (Phase 5.8) */}
      {sendLinkTarget && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-50"
          onClick={() => setSendLinkTarget(null)}
        >
          <div
            className="bg-offivex-bg-base border border-white/[0.10] rounded-2xl p-6 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-display text-lg font-semibold mb-1 tracking-tight">
              Send payment link
            </h2>
            <p className="text-sm text-offivex-text-secondary mb-5">
              {sendLinkTarget.telegram} · {sendLinkTarget.email}
            </p>

            {!sendLinkResult ? (
              <>
                <label className="block text-[11px] uppercase tracking-wider text-offivex-text-muted mb-1.5">
                  Plan
                </label>
                <div className="grid grid-cols-2 gap-2 mb-5">
                  {(["monthly", "yearly"] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setSendLinkPlan(p)}
                      className={
                        "px-3 py-2.5 rounded-lg text-sm transition-colors border " +
                        (sendLinkPlan === p
                          ? "bg-offivex-purple/15 border-offivex-purple/40 text-white"
                          : "bg-white/[0.03] border-white/[0.08] text-offivex-text-secondary hover:border-white/[0.16]")
                      }
                    >
                      <div className="font-medium capitalize">{p}</div>
                      <div className="text-xs text-offivex-text-muted mt-0.5">
                        {p === "monthly" ? "$1,000 / month" : "$7,000 / year"}
                      </div>
                    </button>
                  ))}
                </div>

                {sendLinkError && (
                  <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-200 text-xs">
                    {sendLinkError}
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setSendLinkTarget(null)}
                    className="px-4 py-2 rounded-lg text-sm text-offivex-text-secondary hover:text-white border border-white/[0.10] hover:border-white/[0.20] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={onCreateInvoice}
                    disabled={sendLinkCreating}
                    className="px-4 py-2 rounded-lg text-sm btn-purple disabled:opacity-60"
                  >
                    {sendLinkCreating ? "Generating…" : "Generate link"}
                  </button>
                </div>
              </>
            ) : (
              <SendLinkResult result={sendLinkResult} onClose={() => setSendLinkTarget(null)} />
            )}
          </div>
        </div>
      )}

      {/* Reject modal */}
      {rejectTarget && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-50"
          onClick={() => setRejectTarget(null)}
        >
          <div
            className="bg-offivex-bg-base border border-white/[0.10] rounded-2xl p-6 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-display text-lg font-semibold mb-1 tracking-tight">
              Reject apply
            </h2>
            <p className="text-sm text-offivex-text-secondary mb-4">
              {rejectTarget.telegram} · {rejectTarget.email}
            </p>
            <label className="block text-[11px] uppercase tracking-wider text-offivex-text-muted mb-1.5">
              Notes (internal, optional)
            </label>
            <textarea
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              rows={4}
              autoFocus
              placeholder="Reason for rejection — visible to admins only."
              className="w-full px-3.5 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-offivex-text-primary placeholder-offivex-text-muted focus:outline-none focus:border-offivex-purple/50 focus:bg-white/[0.05] transition-colors resize-none"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setRejectTarget(null)}
                className="px-4 py-2 rounded-lg text-sm text-offivex-text-secondary hover:text-white border border-white/[0.10] hover:border-white/[0.20] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onRejectSubmit}
                disabled={acting?.id === rejectTarget.id}
                className="px-4 py-2 rounded-lg text-sm bg-red-500/15 border border-red-500/40 text-red-200 hover:bg-red-500/25 disabled:opacity-60 transition-colors"
              >
                {acting?.id === rejectTarget.id ? "Rejecting…" : "Confirm reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: "pending" | "approved" | "rejected" }) {
  const styles =
    status === "approved"
      ? "bg-offivex-green/15 border-offivex-green/30 text-offivex-green-light"
      : status === "rejected"
        ? "bg-red-500/10 border-red-500/30 text-red-300"
        : "bg-offivex-purple/15 border-offivex-purple/30 text-offivex-purple-light";
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

function formatRelative(ts: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - ts;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function SendLinkResult({
  result,
  onClose,
}: {
  result: InvoiceCreatedView;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  // Build the absolute URL the admin will DM to the user
  const payUrl =
    (typeof window !== "undefined" ? window.location.origin : "") +
    `/pay/${result.invoice_id}`;

  const copyUrl = async () => {
    if (typeof navigator === "undefined") return;
    try {
      await navigator.clipboard.writeText(payUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <>
      <div className="px-3 py-2.5 rounded-lg bg-offivex-green/10 border border-offivex-green/30 text-offivex-green-light text-xs mb-4">
        ✓ Invoice created. DM the link below to the user on Telegram.
      </div>

      <div className="space-y-3 mb-5">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-offivex-text-muted mb-1">
            Payment link
          </div>
          <div className="flex gap-2">
            <input
              readOnly
              value={payUrl}
              className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-offivex-text-primary text-xs font-mono"
            />
            <button
              onClick={copyUrl}
              className="px-3 py-2 rounded-lg btn-purple text-xs whitespace-nowrap"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <div className="text-offivex-text-muted">Plan</div>
            <div className="text-offivex-text-primary capitalize">{result.plan_name}</div>
          </div>
          <div>
            <div className="text-offivex-text-muted">Amount (USD)</div>
            <div className="text-offivex-text-primary">
              ${(result.amount_usd_cents / 100).toLocaleString("en-US", {
                minimumFractionDigits: 2,
              })}
            </div>
          </div>
          <div>
            <div className="text-offivex-text-muted">Amount (SOL)</div>
            <div className="text-offivex-text-primary font-mono">{result.amount_sol_str}</div>
          </div>
          <div>
            <div className="text-offivex-text-muted">Rate locked</div>
            <div className="text-offivex-text-primary">
              ${(result.sol_usd_rate_cents / 100).toFixed(2)} / SOL
            </div>
          </div>
        </div>

        <div className="text-[10px] text-offivex-text-muted">
          Expires {formatRelative(result.expires_at)} (rate locked for 30 min).
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg text-sm btn-outline"
        >
          Done
        </button>
      </div>
    </>
  );
}
