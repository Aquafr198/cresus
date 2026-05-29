"use client";

import { useEffect, useState } from "react";
import {
  ApiError,
  userApi,
  type UserReferralCodeView,
  type UserReferralListItem,
  type UserReferralStatsView,
} from "@/lib/api";

export default function ReferralPage() {
  const [codeView, setCodeView] = useState<UserReferralCodeView | null>(null);
  const [stats, setStats] = useState<UserReferralStatsView | null>(null);
  const [list, setList] = useState<UserReferralListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [codeRes, statsRes, listRes] = await Promise.all([
          userApi.referral.code(),
          userApi.referral.stats(),
          userApi.referral.list(),
        ]);
        if (cancelled) return;
        setCodeView(codeRes.data);
        setStats(statsRes.data);
        setList(listRes.data);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError) setError(e.message);
        else setError("Failed to load referral data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCopy = async (kind: "code" | "link", value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto py-16 text-center text-offivex-text-muted text-sm">
        Loading referral data...
      </div>
    );
  }

  if (error || !codeView || !stats) {
    return (
      <div className="max-w-5xl mx-auto py-16 text-center text-sm text-red-300">
        {error || "Could not load referral data."}
      </div>
    );
  }

  const code = codeView.code;
  const inviteLink = codeView.share_url;
  const shareTwitter = encodeURIComponent(
    `Launching Solana memes with @offivex — apply for early access with my code: ${inviteLink}`,
  );
  const shareTelegram = encodeURIComponent(inviteLink);
  const earningsUsd = (stats.total_earnings_cents / 100).toLocaleString(
    undefined,
    { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  );

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-1">
          Referral program
        </h1>
        <p className="text-sm text-gray-500">
          Earn 10% of every paid plan from users you refer. Payouts are
          processed manually by admin on request via Telegram.
        </p>
      </div>

      {/* Top stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total referees" value={stats.total_referees} />
        <StatCard label="Active referees" value={stats.active_referees} />
        <StatCard
          label="Total earnings"
          value={`$${earningsUsd}`}
          tone="green"
        />
      </div>

      {/* Code + share */}
      <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 space-y-5">
        <div>
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">
            Your referral code
          </div>
          <div className="flex items-stretch gap-2">
            <div className="flex-1 font-mono text-xl font-semibold px-4 py-3 rounded-lg bg-black/40 border border-white/[0.08] tracking-wider">
              {code}
            </div>
            <button
              onClick={() => handleCopy("code", code)}
              className="px-4 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-gray-200 hover:bg-white/[0.06] transition-colors"
            >
              {copied === "code" ? "Copied ✓" : "Copy"}
            </button>
          </div>
        </div>

        <div>
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">
            Share link
          </div>
          <div className="flex items-stretch gap-2">
            <div className="flex-1 font-mono text-sm px-4 py-3 rounded-lg bg-black/40 border border-white/[0.08] truncate text-gray-300">
              {inviteLink}
            </div>
            <button
              onClick={() => handleCopy("link", inviteLink)}
              className="px-4 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-gray-200 hover:bg-white/[0.06] transition-colors"
            >
              {copied === "link" ? "Copied ✓" : "Copy"}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <a
            href={`https://twitter.com/intent/tweet?text=${shareTwitter}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-gray-200 hover:bg-white/[0.06] transition-colors"
          >
            Share on Twitter
          </a>
          <a
            href={`https://t.me/share/url?url=${shareTelegram}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-gray-200 hover:bg-white/[0.06] transition-colors"
          >
            Share on Telegram
          </a>
        </div>
      </section>

      {/* Referees table */}
      <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <h2 className="text-base font-semibold">Referees</h2>
          <span className="text-xs text-gray-500">
            {list.length} {list.length === 1 ? "referee" : "referees"}
          </span>
        </div>
        {list.length === 0 ? (
          <div className="px-6 py-10 text-sm text-gray-500 text-center">
            No referees yet. Share your code above to start earning.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/[0.02]">
                <tr className="text-left text-xs uppercase tracking-wider text-gray-500">
                  <th className="px-6 py-3 font-medium">User</th>
                  <th className="px-6 py-3 font-medium">Plan</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Joined</th>
                  <th className="px-6 py-3 font-medium text-right">Earnings</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => {
                  const joined = new Date(
                    r.joined_at * 1000,
                  ).toLocaleDateString();
                  const earnings = (r.earnings_cents / 100).toLocaleString(
                    undefined,
                    {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    },
                  );
                  return (
                    <tr
                      key={r.referee_id_masked}
                      className="border-t border-white/[0.04] hover:bg-white/[0.01]"
                    >
                      <td className="px-6 py-3.5 text-sm font-mono text-gray-300">
                        {r.referee_id_masked}
                      </td>
                      <td className="px-6 py-3.5 text-sm text-gray-300">
                        {r.plan_slug || "—"}
                      </td>
                      <td className="px-6 py-3.5">
                        <StatusBadge status={r.subscription_status} />
                      </td>
                      <td className="px-6 py-3.5 text-sm text-gray-400">
                        {joined}
                      </td>
                      <td className="px-6 py-3.5 text-sm text-right font-mono text-gray-300">
                        ${earnings}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="text-xs text-gray-600 text-center pt-4">
        Ready to cash out? DM admin on{" "}
        <a
          href="https://t.me/offivex"
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-500 hover:text-gray-300 underline"
        >
          Telegram
        </a>{" "}
        to request a payout.
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "default" | "green";
}) {
  const valueClass =
    tone === "green" ? "text-green-300" : "text-white";
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
      <div className="text-xs uppercase tracking-wider text-gray-500 mb-2">
        {label}
      </div>
      <div className={`text-3xl font-bold ${valueClass}`}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) {
    return (
      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider bg-white/[0.04] text-gray-400 border border-white/[0.06]">
        none
      </span>
    );
  }
  const cls =
    status === "active"
      ? "bg-green-500/15 text-green-300 border-green-500/30"
      : status === "expired"
        ? "bg-orange-500/15 text-orange-300 border-orange-500/30"
        : "bg-white/[0.04] text-gray-400 border-white/[0.06]";
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider border ${cls}`}
    >
      {status}
    </span>
  );
}
