"use client";

import { Sparkline } from "./Sparkline";

export interface EarningsCardProps {
  last30dCents: number;
  todayCents: number;
  sparkline: number[];
}

/// Earnings panel with two columns (Last 30 days / Today) + a small trend
/// sparkline. Sits next to MintHistoryCard in the bottom row of the dashboard.
export function EarningsCard({
  last30dCents,
  todayCents,
  sparkline,
}: EarningsCardProps) {
  const last30d = formatUsd(last30dCents);
  const today = formatUsd(todayCents);

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
      <div className="mb-6 text-base font-semibold text-offivex-text-primary">
        Estimated Earnings
      </div>

      <div className="flex flex-wrap items-start gap-10">
        <Column label="Last 30 days" value={last30d} solEquiv="◎ 0.00" />
        <Column label="Today" value={today} solEquiv="◎ 0.00" />

        <div className="ml-auto flex-1 min-w-[160px]">
          <Sparkline
            data={sparkline.length > 0 ? sparkline : [0, 0, 0, 0, 0]}
            color="#14F195"
            height={56}
          />
        </div>
      </div>
    </div>
  );
}

function Column({
  label,
  value,
  solEquiv,
}: {
  label: string;
  value: string;
  solEquiv?: string;
}) {
  return (
    <div>
      <div className="mb-2 text-xs text-offivex-text-muted">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-3xl font-semibold tabular-nums text-offivex-text-primary">
          {value}
        </span>
        {solEquiv && (
          <span className="font-mono text-[11px] text-offivex-text-muted">
            {solEquiv}
          </span>
        )}
      </div>
    </div>
  );
}

function formatUsd(cents: number): string {
  const dollars = cents / 100;
  // Force en-US so we always render "$0.00" — never "0,00 $US" (French) or
  // other locale variants. Currency-style USD with browser locale leaks
  // commas/dots and the "$US" suffix instead of "$" prefix.
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
