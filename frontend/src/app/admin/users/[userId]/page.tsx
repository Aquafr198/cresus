"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  api,
  ApiError,
  type AdminUserDetailView,
  type RotateKeyResult,
} from "@/lib/api";
import { GrantAccessModal } from "@/components/admin/GrantAccessModal";

type Modal =
  | { kind: "none" }
  | { kind: "grant" }
  | { kind: "send-link" }
  | { kind: "rotate"; confirming: boolean }
  | { kind: "rotated"; result: RotateKeyResult; savedAck: boolean; copied: boolean }
  | { kind: "revoke"; confirming: boolean }
  | { kind: "suspend"; confirming: boolean }
  | { kind: "edit-notes"; draft: string; saving: boolean };

export default function AdminUserDetailPage() {
  const params = useParams<{ userId: string }>();
  const userId = params?.userId ?? "";

  const [detail, setDetail] = useState<AdminUserDetailView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"subs" | "payments" | "audit">("subs");
  const [modal, setModal] = useState<Modal>({ kind: "none" });

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await api.admin.getUserDetail(userId);
      setDetail(r.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load user");
    }
  }, [userId]);

  useEffect(() => {
    if (userId) void load();
  }, [userId, load]);

  // Opens the suspend/reactivate confirmation modal WITHOUT firing the API.
  // The actual mutation happens in `confirmToggleStatus()` once the user
  // clicks Confirm — pre-refactor `onToggleStatus` was wired to the button
  // and immediately mutated, with the modal serving as in-flight feedback
  // instead of as a guard. A single misclick suspended a paying user.
  const requestToggleStatus = () => {
    if (!detail) return;
    setModal({ kind: "suspend", confirming: false });
  };
  const confirmToggleStatus = async () => {
    if (!detail) return;
    const newStatus = detail.user.status === "active" ? "suspended" : "active";
    setModal({ kind: "suspend", confirming: true });
    try {
      await api.admin.updateUser(userId, { status: newStatus });
      await load();
      setModal({ kind: "none" });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Update failed");
      setModal({ kind: "none" });
    }
  };

  const onSaveNotes = async (notes: string) => {
    setModal({ kind: "edit-notes", draft: notes, saving: true });
    try {
      await api.admin.updateUser(userId, { notes });
      await load();
      setModal({ kind: "none" });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Notes save failed");
      setModal({ kind: "edit-notes", draft: notes, saving: false });
    }
  };

  const onRotate = async () => {
    setModal({ kind: "rotate", confirming: true });
    try {
      const r = await api.admin.rotateKey(userId);
      setModal({
        kind: "rotated",
        result: r.data,
        savedAck: false,
        copied: false,
      });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Rotate failed");
      setModal({ kind: "none" });
    }
  };

  const onRevoke = async () => {
    setModal({ kind: "revoke", confirming: true });
    try {
      await api.admin.revokeKey(userId);
      await load();
      setModal({ kind: "none" });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Revoke failed");
      setModal({ kind: "none" });
    }
  };

  if (error) {
    return (
      <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
        {error}
        <Link
          href="/admin/users"
          className="ml-3 underline text-offivex-purple-light hover:text-white"
        >
          Back to users
        </Link>
      </div>
    );
  }

  if (!detail) {
    return <div className="text-sm text-offivex-text-muted py-12 text-center">Loading…</div>;
  }

  const { user, apply_origin, subscriptions, payments, api_keys, audit_log } = detail;
  const activeSub = subscriptions.find(
    (s) => s.status === "active" && s.expires_at && s.expires_at > Math.floor(Date.now() / 1000)
  );
  const activeKey = api_keys.find((k) => k.status === "active");
  const revokedKeys = api_keys.filter((k) => k.status === "revoked");

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <Link
        href="/admin/users"
        className="text-sm text-offivex-text-secondary hover:text-white inline-flex items-center gap-1"
      >
        ← Back to users
      </Link>

      {/* Header card */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="font-display text-2xl font-semibold tracking-tight">
                {user.telegram ?? "(no telegram)"}
              </h1>
              <StatusBadge status={user.status} />
            </div>
            <div className="text-sm text-offivex-text-secondary">{user.email}</div>
            <div className="text-xs text-offivex-text-muted mt-2">
              Created {formatRelative(user.created_at)}
              {apply_origin && (
                <>
                  {" · From apply "}
                  <Link
                    href="/admin/applies"
                    className="font-mono text-offivex-purple-light hover:text-white"
                  >
                    {apply_origin.id.slice(0, 8)}…
                  </Link>
                </>
              )}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={requestToggleStatus}
              className={
                "px-3.5 py-2 rounded-lg text-sm transition-colors " +
                (user.status === "active"
                  ? "bg-red-500/10 border border-red-500/30 text-red-200 hover:bg-red-500/20"
                  : "bg-offivex-green/10 border border-offivex-green/30 text-offivex-green-light hover:bg-offivex-green/20")
              }
            >
              {user.status === "active" ? "Suspend" : "Reactivate"}
            </button>
            <button
              onClick={() =>
                setModal({
                  kind: "edit-notes",
                  draft: user.notes ?? "",
                  saving: false,
                })
              }
              className="px-3.5 py-2 rounded-lg text-sm text-offivex-text-secondary hover:text-white border border-white/[0.10] hover:border-white/[0.20] transition-colors"
            >
              Edit notes
            </button>
          </div>
        </div>

        {user.notes && (
          <div className="mt-4 pt-4 border-t border-white/[0.06]">
            <div className="text-[11px] uppercase tracking-wider text-offivex-text-muted mb-1.5">
              Admin notes
            </div>
            <div className="text-sm text-offivex-text-secondary whitespace-pre-wrap leading-relaxed">
              {user.notes}
            </div>
          </div>
        )}
      </div>

      {/* Subscription card */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
        <div className="text-[11px] uppercase tracking-[0.2em] text-offivex-purple-light mb-2">
          Subscription
        </div>
        {activeSub ? (
          <>
            <div className="flex items-center gap-3 mb-1">
              <div className="font-display text-xl font-semibold tracking-tight">
                {activeSub.plan_name}
              </div>
              <StatusBadge status={activeSub.status} />
            </div>
            <div className="text-sm text-offivex-text-secondary">
              Expires {formatRelative(activeSub.expires_at!)}
              {" · "}
              Started {activeSub.started_at ? formatRelative(activeSub.started_at) : "—"}
              {activeSub.current_payment_id === "manual_grant" && (
                <span className="ml-2 text-amber-300 text-xs">
                  · manual grant (no payment)
                </span>
              )}
            </div>
          </>
        ) : (
          <div className="text-sm text-offivex-text-secondary">No active subscription.</div>
        )}
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => setModal({ kind: "grant" })}
            className="px-3.5 py-2 rounded-lg text-sm border border-offivex-green/40 text-offivex-green-light hover:bg-offivex-green/10 transition-colors"
          >
            Grant access
          </button>
        </div>
      </div>

      {/* API Keys card */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
        <div className="text-[11px] uppercase tracking-[0.2em] text-offivex-purple-light mb-2">
          API Keys
        </div>

        {/* Security disclosure — explains why we only show the prefix */}
        <div className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200/90 text-[11px] mb-4 leading-relaxed">
          <strong>Full keys are revealed ONCE</strong> at generation/rotate. Only
          the prefix is stored (the rest is hashed, irrecoverable by design — same
          model as Stripe/GitHub). If the user lost their key, click{" "}
          <strong>Rotate</strong> to issue a fresh one and DM it via Telegram.
        </div>

        {activeKey ? (
          <div className="mb-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <div className="font-mono text-sm break-all">
                    {activeKey.key_prefix}
                    <span className="text-offivex-text-muted">…</span>
                  </div>
                  <PrefixCopyButton value={activeKey.key_prefix} />
                </div>
                <div className="text-xs text-offivex-text-muted">
                  Created {formatRelative(activeKey.created_at)}
                  {activeKey.last_used_at &&
                    ` · Last used ${formatRelative(activeKey.last_used_at)}`}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setModal({ kind: "rotate", confirming: false })}
                  className="px-3 py-1.5 rounded-md text-xs btn-purple"
                  title="Generate a new full key (current key gets revoked, new key shown once)"
                >
                  Rotate (reveal new key)
                </button>
                <button
                  onClick={() => setModal({ kind: "revoke", confirming: false })}
                  className="px-3 py-1.5 rounded-md text-xs border border-red-500/40 text-red-300 hover:bg-red-500/10 transition-colors"
                  title="Kill the current key without replacement (user loses access immediately)"
                >
                  Revoke
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-offivex-text-secondary mb-4">
            No active API key. Click <strong>Grant access</strong> in the
            Subscription section above to generate one.
          </div>
        )}

        {revokedKeys.length > 0 && (
          <details className="mt-4 pt-4 border-t border-white/[0.06]">
            <summary className="cursor-pointer text-xs text-offivex-text-muted uppercase tracking-wider hover:text-white">
              Revoked keys ({revokedKeys.length})
            </summary>
            <ul className="mt-3 space-y-1.5">
              {revokedKeys.map((k) => (
                <li
                  key={k.id}
                  className="text-xs text-offivex-text-secondary font-mono flex items-center gap-3"
                >
                  <span>{k.key_prefix}…</span>
                  <span className="text-offivex-text-muted">
                    revoked {k.revoked_at ? formatRelative(k.revoked_at) : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {/* History tabs */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
        <div className="flex border-b border-white/[0.06]">
          {([
            ["subs", "Subscriptions"],
            ["payments", "Payments"],
            ["audit", "Audit log"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={
                "px-4 py-3 text-sm transition-colors border-b-2 -mb-px " +
                (activeTab === key
                  ? "border-offivex-purple text-white"
                  : "border-transparent text-offivex-text-secondary hover:text-white")
              }
            >
              {label}
            </button>
          ))}
        </div>
        <div className="p-4">
          {activeTab === "subs" &&
            (subscriptions.length === 0 ? (
              <EmptyTab label="No subscriptions yet." />
            ) : (
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-offivex-text-muted">
                  <tr>
                    <th className="text-left px-2 py-2 font-medium">Plan</th>
                    <th className="text-left px-2 py-2 font-medium">Status</th>
                    <th className="text-left px-2 py-2 font-medium">Started</th>
                    <th className="text-left px-2 py-2 font-medium">Expires</th>
                    <th className="text-left px-2 py-2 font-medium">Origin</th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptions.map((s) => (
                    <tr key={s.id} className="border-t border-white/[0.04]">
                      <td className="px-2 py-2">{s.plan_name}</td>
                      <td className="px-2 py-2">
                        <StatusBadge status={s.status} />
                      </td>
                      <td className="px-2 py-2 text-offivex-text-secondary text-xs">
                        {s.started_at ? formatRelative(s.started_at) : "—"}
                      </td>
                      <td className="px-2 py-2 text-offivex-text-secondary text-xs">
                        {s.expires_at ? formatRelative(s.expires_at) : "—"}
                      </td>
                      <td className="px-2 py-2 text-xs text-offivex-text-muted">
                        {s.current_payment_id === "manual_grant"
                          ? "Manual grant"
                          : s.current_payment_id
                            ? "Payment"
                            : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}

          {activeTab === "payments" &&
            (payments.length === 0 ? (
              <EmptyTab label="No payments yet." />
            ) : (
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-offivex-text-muted">
                  <tr>
                    <th className="text-left px-2 py-2 font-medium">Created</th>
                    <th className="text-left px-2 py-2 font-medium">Plan</th>
                    <th className="text-right px-2 py-2 font-medium">Amount</th>
                    <th className="text-left px-2 py-2 font-medium">Status</th>
                    <th className="text-left px-2 py-2 font-medium">Tx</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-t border-white/[0.04]">
                      <td className="px-2 py-2 text-offivex-text-secondary text-xs whitespace-nowrap">
                        {formatRelative(p.created_at)}
                      </td>
                      <td className="px-2 py-2 text-offivex-text-secondary">
                        {p.plan_id === "plan_monthly_default"
                          ? "Monthly"
                          : p.plan_id === "plan_yearly_default"
                            ? "Yearly"
                            : p.plan_id}
                      </td>
                      <td className="px-2 py-2 text-right font-mono whitespace-nowrap">
                        {p.amount_sol_str ?? "—"} SOL
                        <div className="text-[10px] text-offivex-text-muted">
                          ${(p.amount_usd_cents / 100).toFixed(2)}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <StatusBadge status={p.status} />
                      </td>
                      <td className="px-2 py-2">
                        {p.tx_hash ? (
                          <a
                            href={`https://solscan.io/tx/${p.tx_hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-[11px] text-offivex-purple-light hover:text-white underline"
                          >
                            {p.tx_hash.slice(0, 8)}…
                          </a>
                        ) : (
                          <span className="text-xs text-offivex-text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}

          {activeTab === "audit" &&
            (audit_log.length === 0 ? (
              <EmptyTab label="No audit events yet." />
            ) : (
              <ul className="space-y-2">
                {audit_log.map((a) => (
                  <li
                    key={a.id}
                    className="text-xs text-offivex-text-secondary border-b border-white/[0.04] pb-2 last:border-0"
                  >
                    <div className="flex justify-between gap-3">
                      <span className="font-mono text-offivex-purple-light">{a.action}</span>
                      <span className="text-offivex-text-muted whitespace-nowrap">
                        {formatRelative(a.created_at)}
                      </span>
                    </div>
                    {a.detail && (
                      <div className="text-offivex-text-secondary mt-0.5 font-mono break-all">
                        {a.detail}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ))}
        </div>
      </div>

      {/* ─── Modals ──────────────────────────────────────────────────── */}

      {modal.kind === "grant" && (
        <GrantAccessModal
          userId={userId}
          subtitle={`${user.telegram ?? user.email}`}
          initialPlan={
            activeSub?.plan_slug === "yearly" ? "yearly" : "monthly"
          }
          onClose={() => setModal({ kind: "none" })}
          onGranted={() => {
            void load();
          }}
        />
      )}

      {(modal.kind === "rotate" || modal.kind === "rotated") && (
        <RotateKeyModalView
          modal={modal}
          onConfirm={onRotate}
          onClose={() => setModal({ kind: "none" })}
          onAck={(ack) => {
            if (modal.kind === "rotated") {
              setModal({ ...modal, savedAck: ack });
            }
          }}
          onCopied={() => {
            if (modal.kind === "rotated") {
              setModal({ ...modal, copied: true });
              setTimeout(() => {
                setModal((m) => (m.kind === "rotated" ? { ...m, copied: false } : m));
              }, 1500);
            }
          }}
        />
      )}

      {modal.kind === "revoke" && (
        <ConfirmModal
          title="Revoke API key"
          subtitle={`${user.telegram ?? user.email}`}
          message="The user will lose access immediately. They'll need a new key (via grant or rotate) to come back."
          confirmLabel="Revoke key"
          danger
          loading={modal.confirming}
          onConfirm={onRevoke}
          onClose={() => setModal({ kind: "none" })}
        />
      )}

      {modal.kind === "suspend" && (
        <ConfirmModal
          title={user.status === "active" ? "Suspend user" : "Reactivate user"}
          subtitle={`${user.telegram ?? user.email}`}
          message={
            user.status === "active"
              ? "The user will lose API access immediately. Their active subscription stays in place (no refund) and you can reactivate them at any time."
              : "The user will regain API access immediately. Their existing API key resumes working."
          }
          confirmLabel={user.status === "active" ? "Suspend" : "Reactivate"}
          danger={user.status === "active"}
          loading={modal.confirming}
          onConfirm={confirmToggleStatus}
          onClose={() => setModal({ kind: "none" })}
        />
      )}

      {modal.kind === "edit-notes" && (
        <EditNotesModal
          initial={modal.draft}
          saving={modal.saving}
          onSave={onSaveNotes}
          onClose={() => setModal({ kind: "none" })}
        />
      )}
    </div>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────

function EmptyTab({ label }: { label: string }) {
  return <div className="text-sm text-offivex-text-muted py-6 text-center">{label}</div>;
}

function PrefixCopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        if (typeof navigator === "undefined") return;
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // ignore
        }
      }}
      title="Copy prefix (useful for matching keys in audit logs)"
      className="inline-flex items-center justify-center px-2 py-1 rounded-md bg-white/[0.04] border border-white/[0.06] text-offivex-text-secondary hover:text-white hover:bg-white/[0.08] text-[10px] uppercase tracking-wider transition-colors"
    >
      {copied ? "✓ Copied" : "Copy prefix"}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === "active"
      ? "bg-offivex-green/15 border-offivex-green/30 text-offivex-green-light"
      : status === "suspended"
        ? "bg-red-500/15 border-red-500/30 text-red-300"
        : status === "confirmed" || status === "approved"
          ? "bg-offivex-green/15 border-offivex-green/30 text-offivex-green-light"
          : status === "expired" || status === "canceled" || status === "rejected"
            ? "bg-zinc-500/15 border-zinc-500/30 text-zinc-400"
            : status === "underpaid" || status === "failed"
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

function ConfirmModal({
  title,
  subtitle,
  message,
  confirmLabel,
  danger,
  loading,
  onConfirm,
  onClose,
}: {
  title: string;
  subtitle?: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-50"
      onClick={onClose}
    >
      <div
        className="bg-offivex-bg-base border border-white/[0.10] rounded-2xl p-6 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-lg font-semibold mb-1 tracking-tight">{title}</h2>
        {subtitle && <p className="text-sm text-offivex-text-secondary mb-4">{subtitle}</p>}
        <div className="text-sm text-offivex-text-secondary mb-5 leading-relaxed">{message}</div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-offivex-text-secondary hover:text-white border border-white/[0.10] hover:border-white/[0.20] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={
              "px-4 py-2 rounded-lg text-sm disabled:opacity-60 transition-colors " +
              (danger
                ? "bg-red-500/15 border border-red-500/40 text-red-200 hover:bg-red-500/25"
                : "btn-purple")
            }
          >
            {loading ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function RotateKeyModalView({
  modal,
  onConfirm,
  onClose,
  onAck,
  onCopied,
}: {
  modal: Extract<Modal, { kind: "rotate" } | { kind: "rotated" }>;
  onConfirm: () => void;
  onClose: () => void;
  onAck: (ack: boolean) => void;
  onCopied: () => void;
}) {
  if (modal.kind === "rotate") {
    return (
      <ConfirmModal
        title="Rotate API key"
        message="This will revoke the user's current key and generate a fresh one. The new key is shown ONCE — copy it now and send to the user."
        confirmLabel="Rotate key"
        loading={modal.confirming}
        onConfirm={onConfirm}
        onClose={onClose}
      />
    );
  }

  const downloadKey = (key: string) => {
    if (typeof window === "undefined") return;
    const content = `Offivex API key (rotated) — KEEP SAFE\nGenerated: ${new Date().toISOString()}\n\n${key}\n`;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `offivex-api-key-${key.slice(0, 17)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(modal.result.api_key_plaintext);
      onCopied();
    } catch {
      // ignore
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-50"
      onClick={onClose}
    >
      <div
        className="bg-offivex-bg-base border border-white/[0.10] rounded-2xl p-6 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-lg font-semibold mb-1 tracking-tight">
          New API key
        </h2>
        <p className="text-sm text-offivex-text-secondary mb-4">
          Previous key revoked. New key shown ONCE.
        </p>

        <div className="px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-200 text-xs mb-4">
          <strong>⚠ Copy now.</strong> We cannot recover it.
        </div>

        <div className="font-mono text-sm bg-black/40 border border-white/[0.10] rounded-lg p-3 break-all mb-3">
          {modal.result.api_key_plaintext}
        </div>

        <div className="flex gap-2 mb-5">
          <button
            onClick={copy}
            className="flex-1 px-3 py-2 rounded-md text-xs bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] transition-colors"
          >
            {modal.copied ? "✓ Copied" : "📋 Copy key"}
          </button>
          <button
            onClick={() => downloadKey(modal.result.api_key_plaintext)}
            className="flex-1 px-3 py-2 rounded-md text-xs bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] transition-colors"
          >
            ⬇ Download .txt
          </button>
        </div>

        <label className="flex items-center gap-2 mb-5 cursor-pointer">
          <input
            type="checkbox"
            checked={modal.savedAck}
            onChange={(e) => onAck(e.target.checked)}
            className="w-4 h-4 rounded border-white/20 bg-white/[0.05]"
          />
          <span className="text-xs text-offivex-text-secondary">
            I have saved the key and sent it to the user
          </span>
        </label>

        <button
          onClick={onClose}
          disabled={!modal.savedAck}
          className={
            "w-full py-2.5 rounded-lg text-sm transition-colors " +
            (modal.savedAck
              ? "btn-purple"
              : "bg-white/[0.04] border border-white/[0.06] text-offivex-text-muted cursor-not-allowed")
          }
        >
          Done
        </button>
      </div>
    </div>
  );
}

function EditNotesModal({
  initial,
  saving,
  onSave,
  onClose,
}: {
  initial: string;
  saving: boolean;
  onSave: (notes: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(initial);

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center px-6 z-50"
      onClick={onClose}
    >
      <div
        className="bg-offivex-bg-base border border-white/[0.10] rounded-2xl p-6 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-lg font-semibold mb-1 tracking-tight">
          Admin notes
        </h2>
        <p className="text-sm text-offivex-text-secondary mb-4">
          Internal only — never shown to the user.
        </p>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={6}
          maxLength={2000}
          autoFocus
          placeholder="e.g. VIP partner, comped access, project notes…"
          className="w-full px-3.5 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-offivex-text-primary placeholder-offivex-text-muted focus:outline-none focus:border-offivex-purple/50 focus:bg-white/[0.05] transition-colors resize-none"
        />
        <div className="text-[10px] text-offivex-text-muted mt-1 text-right">
          {draft.length} / 2000
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-offivex-text-secondary hover:text-white border border-white/[0.10] hover:border-white/[0.20] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(draft)}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm btn-purple disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatRelative(ts: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = ts - now;
  if (diff > 0) {
    if (diff < 60) return `in ${diff}s`;
    if (diff < 3600) return `in ${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `in ${Math.floor(diff / 3600)}h`;
    return `in ${Math.floor(diff / 86400)}d`;
  }
  const abs = -diff;
  if (abs < 60) return `${abs}s ago`;
  if (abs < 3600) return `${Math.floor(abs / 60)}m ago`;
  if (abs < 86400) return `${Math.floor(abs / 3600)}h ago`;
  return `${Math.floor(abs / 86400)}d ago`;
}
