"use client";

import { useEffect, useState } from "react";
import {
  ApiError,
  userApi,
  type UserPaymentView,
  type UserSubscriptionView,
} from "@/lib/api";

const SOLSCAN_BASE =
  process.env.NEXT_PUBLIC_SOLSCAN_BASE || "https://solscan.io/tx";

export default function BillingPage() {
  const [sub, setSub] = useState<UserSubscriptionView | null>(null);
  const [payments, setPayments] = useState<UserPaymentView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [subRes, paysRes] = await Promise.all([
          userApi.billing.subscription(),
          userApi.billing.payments(),
        ]);
        if (cancelled) return;
        setSub(subRes.data);
        setPayments(paysRes.data);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError) {
          setError(e.message);
        } else {
          setError("Failed to load billing data");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-1">
          Billing &amp; payments
        </h1>
        <p className="text-sm text-gray-500">
          Your current subscription and on-chain payment history.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/[0.04] p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Current subscription */}
      <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
        {loading ? (
          <div className="text-sm text-gray-500">Loading subscription…</div>
        ) : sub == null ? (
          <div>
            <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">
              Subscription
            </div>
            <div className="text-base text-gray-300 mb-3">
              You don&apos;t have an active subscription yet.
            </div>
            <a
              href="https://t.me/offivex"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-4 py-2 rounded-lg bg-blue-500 text-[#060a14] text-sm font-semibold hover:bg-blue-400 transition-colors"
            >
              Contact admin on Telegram
            </a>
          </div>
        ) : (
          <SubscriptionCard sub={sub} />
        )}
      </section>

      {/* Payment history */}
      <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <h2 className="text-base font-semibold">Payment history</h2>
          <span className="text-xs text-gray-500">
            {payments.length} {payments.length === 1 ? "payment" : "payments"}
          </span>
        </div>

        {loading ? (
          <div className="px-6 py-8 text-sm text-gray-500">Loading…</div>
        ) : payments.length === 0 ? (
          <div className="px-6 py-10 text-sm text-gray-500 text-center">
            No payments yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/[0.02]">
                <tr className="text-left text-xs uppercase tracking-wider text-gray-500">
                  <th className="px-6 py-3 font-medium">Date</th>
                  <th className="px-6 py-3 font-medium">Plan</th>
                  <th className="px-6 py-3 font-medium">Amount</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium text-right">Tx</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <PaymentRow key={p.id} payment={p} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="text-xs text-gray-600 text-center pt-4">
        Need help with a payment?{" "}
        <a
          href="https://t.me/offivex"
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-500 hover:text-gray-300 underline"
        >
          DM admin on Telegram
        </a>
      </div>
    </div>
  );
}

function SubscriptionCard({ sub }: { sub: UserSubscriptionView }) {
  const priceUsd = (sub.plan_price_usd_cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  const expiresStr = sub.expires_at
    ? new Date(sub.expires_at * 1000).toLocaleString()
    : "—";
  const startedStr = sub.started_at
    ? new Date(sub.started_at * 1000).toLocaleDateString()
    : "—";

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">
            Current plan
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold">{sub.plan_name}</span>
            <span className="text-sm text-gray-500">
              · ${priceUsd} / {sub.plan_duration_days}d
            </span>
          </div>
          <div className="text-xs text-gray-500 mt-1.5">
            Started: <span className="text-gray-300">{startedStr}</span>
            <span className="mx-2 text-gray-700">·</span>
            Expires: <span className="text-gray-300">{expiresStr}</span>
          </div>
        </div>
        <div
          className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
            sub.active
              ? "bg-green-500/15 text-green-300 border-green-500/30"
              : "bg-red-500/15 text-red-300 border-red-500/30"
          }`}
        >
          {sub.active ? "Active" : sub.status}
        </div>
      </div>

      {sub.active && (
        <div className="text-xs text-gray-400">
          <span className="font-mono text-gray-300">{sub.days_remaining}</span>{" "}
          {sub.days_remaining === 1 ? "day" : "days"} remaining
        </div>
      )}

      {!sub.active && (
        <a
          href="https://t.me/offivex"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-3 px-4 py-2 rounded-lg bg-blue-500 text-[#060a14] text-sm font-semibold hover:bg-blue-400 transition-colors"
        >
          Renew via Telegram
        </a>
      )}
    </div>
  );
}

function PaymentRow({ payment }: { payment: UserPaymentView }) {
  const dateStr = new Date(payment.created_at * 1000).toLocaleDateString();
  const priceUsd = (payment.amount_usd_cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  const statusClass = (() => {
    switch (payment.status) {
      case "confirmed":
        return "bg-green-500/15 text-green-300 border border-green-500/30";
      case "pending":
      case "confirming":
        return "bg-yellow-500/15 text-yellow-300 border border-yellow-500/30";
      case "underpaid":
        return "bg-orange-500/15 text-orange-300 border border-orange-500/30";
      default:
        return "bg-red-500/15 text-red-300 border border-red-500/30";
    }
  })();
  const txShort = payment.tx_hash
    ? `${payment.tx_hash.slice(0, 6)}…${payment.tx_hash.slice(-4)}`
    : null;

  return (
    <tr className="border-t border-white/[0.04] hover:bg-white/[0.01]">
      <td className="px-6 py-3.5 text-sm text-gray-300">{dateStr}</td>
      <td className="px-6 py-3.5 text-sm text-gray-300">{payment.plan_name}</td>
      <td className="px-6 py-3.5 text-sm text-gray-300">
        <span className="font-mono">${priceUsd}</span>
        {payment.amount_sol_str && (
          <span className="text-gray-500 ml-2 text-xs">
            ≈ {payment.amount_sol_str} SOL
          </span>
        )}
      </td>
      <td className="px-6 py-3.5">
        <span
          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider ${statusClass}`}
        >
          {payment.status}
        </span>
      </td>
      <td className="px-6 py-3.5 text-right">
        {payment.tx_hash ? (
          <a
            href={`${SOLSCAN_BASE}/${payment.tx_hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-400 hover:text-blue-300 font-mono"
          >
            {txShort} ↗
          </a>
        ) : (
          <span className="text-xs text-gray-600">—</span>
        )}
      </td>
    </tr>
  );
}
