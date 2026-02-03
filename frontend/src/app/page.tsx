"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api, DashboardStats } from "@/lib/api";

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setStatsError(null);
      const res = await api.stats();
      setStats(res.data);
    } catch (e) {
      setStatsError(e instanceof Error ? e.message : "Failed to load stats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const s = stats || {
    wallets: 0,
    tokens: 0,
    bundles: 0,
    bundles_confirmed: 0,
    distributions: 0,
    profiles: 0,
    rpc_endpoints_active: 0,
    meme_assets: 0,
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Dashboard</h1>

      {statsError && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">
          {statsError}
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <StatCard
              title="Wallets"
              value={s.wallets}
              href="/wallets"
              accent="indigo"
            />
            <StatCard
              title="Tokens"
              value={s.tokens}
              href="/mint"
              accent="purple"
            />
            <StatCard
              title="Bundles"
              value={s.bundles}
              subtitle={`${s.bundles_confirmed} confirmed`}
              href="/bundle"
              accent="emerald"
            />
            <StatCard
              title="Distributions"
              value={s.distributions}
              href="/distribution"
              accent="amber"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <StatCard
              title="Profiles"
              value={s.profiles}
              href="/profiles"
              accent="cyan"
            />
            <StatCard
              title="Meme Assets"
              value={s.meme_assets}
              href="/meme-library"
              accent="pink"
            />
            <StatCard
              title="Active RPCs"
              value={s.rpc_endpoints_active}
              href="/settings"
              accent="emerald"
            />
            <div className="bg-gray-900 rounded-lg border border-gray-800 p-5 flex items-center justify-center">
              <button
                onClick={fetchStats}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-md text-sm text-gray-300 transition-colors"
              >
                Refresh Stats
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="bg-gray-900 rounded-lg border border-gray-800 p-6">
              <h2 className="text-lg font-semibold mb-3">Getting Started</h2>
              <div className="space-y-3">
                <Step
                  number={1}
                  done={true}
                  label="Set your app password"
                  href="/settings"
                />
                <Step
                  number={2}
                  done={s.rpc_endpoints_active > 0}
                  label="Configure an RPC endpoint"
                  href="/settings"
                />
                <Step
                  number={3}
                  done={s.wallets > 0}
                  label="Create your first wallet"
                  href="/wallets"
                />
                <Step
                  number={4}
                  done={s.tokens > 0}
                  label="Mint a token"
                  href="/mint"
                />
                <Step
                  number={5}
                  done={s.bundles_confirmed > 0}
                  label="Launch with Jito bundle"
                  href="/bundle"
                />
              </div>
            </section>

            <section className="bg-gray-900 rounded-lg border border-gray-800 p-6">
              <h2 className="text-lg font-semibold mb-3">Quick Actions</h2>
              <div className="grid grid-cols-2 gap-3">
                <QuickAction href="/wallets" label="Create Wallet" />
                <QuickAction href="/mint" label="Mint Token" />
                <QuickAction href="/bundle" label="Launch Bundle" />
                <QuickAction href="/distribution" label="Distribute SOL" />
                <QuickAction href="/profiles" label="Randomize Profiles" />
                <QuickAction href="/monitor" label="Monitor Trades" />
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  href,
  accent,
}: {
  title: string;
  value: number;
  subtitle?: string;
  href: string;
  accent: string;
}) {
  const accentColors: Record<string, string> = {
    indigo: "border-l-indigo-500",
    purple: "border-l-purple-500",
    emerald: "border-l-emerald-500",
    amber: "border-l-amber-500",
    cyan: "border-l-cyan-500",
    pink: "border-l-pink-500",
  };

  return (
    <Link href={href}>
      <div
        className={`bg-gray-900 rounded-lg border border-gray-800 border-l-4 ${
          accentColors[accent] || "border-l-gray-500"
        } p-5 hover:bg-gray-800/50 transition-colors cursor-pointer`}
      >
        <p className="text-xs text-gray-400 uppercase tracking-wide">
          {title}
        </p>
        <p className="text-2xl font-bold mt-1">{value}</p>
        {subtitle && (
          <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
        )}
      </div>
    </Link>
  );
}

function Step({
  number,
  done,
  label,
  href,
}: {
  number: number;
  done: boolean;
  label: string;
  href: string;
}) {
  return (
    <Link href={href}>
      <div className="flex items-center gap-3 p-2 rounded hover:bg-gray-800/50 transition-colors">
        <div
          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
            done
              ? "bg-emerald-600 text-white"
              : "bg-gray-800 border border-gray-700 text-gray-500"
          }`}
        >
          {done ? "\u2713" : number}
        </div>
        <span
          className={`text-sm ${done ? "text-gray-400 line-through" : "text-gray-200"}`}
        >
          {label}
        </span>
      </div>
    </Link>
  );
}

function QuickAction({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href}>
      <div className="p-3 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-center transition-colors cursor-pointer">
        {label}
      </div>
    </Link>
  );
}
