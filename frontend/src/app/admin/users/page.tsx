"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type AdminUserListView } from "@/lib/api";

type StatusFilter = "all" | "active" | "suspended";

const TABS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "suspended", label: "Suspended" },
];

export default function AdminUsersPage() {
  const [tab, setTab] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<AdminUserListView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    setRows(null);
    try {
      const res = await api.admin.listUsers(search || undefined, tab);
      setRows(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
      setRows([]);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void load();
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-offivex-purple-light mb-1">
            Customers
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Users
          </h1>
        </div>
        <button
          onClick={() => void load()}
          className="px-3.5 py-2 rounded-lg text-sm text-offivex-text-secondary hover:text-white border border-white/[0.06] hover:border-white/[0.12] transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Search + tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-5">
        <form onSubmit={onSearchSubmit} className="flex-1 max-w-md">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by email or @telegram…"
            className="w-full px-3.5 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-offivex-text-primary placeholder-offivex-text-muted focus:outline-none focus:border-offivex-purple/50 focus:bg-white/[0.05] transition-colors text-sm"
          />
        </form>
        <div className="flex gap-1 border-b border-white/[0.06]">
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
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm mb-4">
          {error}
        </div>
      )}

      {rows === null ? (
        <div className="text-sm text-offivex-text-muted py-12 text-center">
          Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-offivex-text-muted py-12 text-center border border-white/[0.06] bg-white/[0.02] rounded-2xl">
          {search
            ? `No users match "${search}".`
            : tab === "all"
              ? "No users yet. Approve some applies to start populating this list."
              : `No ${tab} users.`}
        </div>
      ) : (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-offivex-text-muted bg-white/[0.02]">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Telegram</th>
                <th className="text-left px-4 py-3 font-medium">Email</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Plan</th>
                <th className="text-left px-4 py-3 font-medium">Expires</th>
                <th className="text-left px-4 py-3 font-medium">API key</th>
                <th className="text-left px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="border-t border-white/[0.04] hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="text-white hover:text-offivex-purple-light"
                    >
                      {u.telegram ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-offivex-text-secondary">{u.email}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={u.status} />
                  </td>
                  <td className="px-4 py-3 text-offivex-text-secondary">
                    {u.active_subscription?.plan_name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-offivex-text-secondary whitespace-nowrap">
                    {u.active_subscription?.expires_at
                      ? formatRelative(u.active_subscription.expires_at)
                      : "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-offivex-text-secondary">
                    {u.active_api_key_prefix ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-offivex-text-muted text-xs whitespace-nowrap">
                    {formatRelative(u.created_at)}
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
    status === "active"
      ? "bg-offivex-green/15 border-offivex-green/30 text-offivex-green-light"
      : "bg-zinc-500/15 border-zinc-500/30 text-zinc-400";
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
  const diff = ts - now;
  // Future timestamp (expires_at)
  if (diff > 0) {
    if (diff < 60) return `in ${diff}s`;
    if (diff < 3600) return `in ${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `in ${Math.floor(diff / 3600)}h`;
    return `in ${Math.floor(diff / 86400)}d`;
  }
  // Past timestamp (created_at)
  const abs = -diff;
  if (abs < 60) return `${abs}s ago`;
  if (abs < 3600) return `${Math.floor(abs / 60)}m ago`;
  if (abs < 86400) return `${Math.floor(abs / 3600)}h ago`;
  return `${Math.floor(abs / 86400)}d ago`;
}
