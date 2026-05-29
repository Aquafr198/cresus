"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type AdminDashboardStats } from "@/lib/api";

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.admin
      .stats()
      .then((r) => {
        if (!cancelled) setStats(r.data);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <div className="mb-8">
        <div className="text-[11px] uppercase tracking-[0.2em] text-offivex-purple-light mb-1">
          Overview
        </div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Dashboard
        </h1>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm mb-6">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Pending applies"
          value={stats?.pending_applies}
          href="/admin/applies"
          highlight={!!stats && stats.pending_applies > 0}
        />
        <StatCard label="Active users" value={stats?.active_users} />
        <StatCard label="MRR" value={"—"} subdued />
      </div>

      <div className="mt-10 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
        <div className="text-sm text-offivex-text-secondary leading-relaxed">
          Quick links:{" "}
          <Link
            href="/admin/applies"
            className="text-offivex-purple-light hover:text-white transition-colors"
          >
            Review pending applies
          </Link>
          .
        </div>
        <div className="mt-3 text-xs text-offivex-text-muted leading-relaxed">
          Phase 5 wires payments + API key generation. Users / Plans / Payments dashboards land in Phase 7.
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  href,
  highlight,
  subdued,
}: {
  label: string;
  value: number | string | undefined;
  href?: string;
  highlight?: boolean;
  subdued?: boolean;
}) {
  const inner = (
    <div
      className={
        "rounded-2xl border p-5 transition-colors " +
        (highlight
          ? "border-offivex-purple/40 bg-offivex-purple/[0.08] hover:bg-offivex-purple/[0.12]"
          : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.10]") +
        (href ? " cursor-pointer" : "")
      }
    >
      <div className="text-[11px] uppercase tracking-wider text-offivex-text-muted mb-2">
        {label}
      </div>
      <div
        className={
          "font-display text-3xl font-semibold tracking-tight " +
          (subdued ? "text-offivex-text-muted" : "")
        }
      >
        {value === undefined ? "—" : value}
      </div>
    </div>
  );

  return href ? <Link href={href}>{inner}</Link> : inner;
}
