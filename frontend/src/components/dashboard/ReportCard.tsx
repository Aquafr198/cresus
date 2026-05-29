"use client";

import { Clock } from "lucide-react";
import { Sparkline } from "./Sparkline";

export interface ReportCardProps {
  title: string;
  /// Pre-formatted value string (e.g. "247" or "Σ 2,578.77").
  value: string;
  /// Optional % delta vs previous period. Positive renders green ↑, negative red ↓.
  deltaPct?: number;
  /// Short human-readable timestamp (e.g. "5:55 PM").
  lastUpdated?: string;
  /// Tag badges shown next to the timestamp.
  tags?: string[];
  /// Sparkline data for the trend.
  sparkline: number[];
  /// Sparkline color override (default Offivex purple-light).
  color?: string;
  /// Optional icon node shown next to the title.
  icon?: React.ReactNode;
}

/// Compact stat card with title + big value + delta % + tag chips + sparkline.
/// Designed to fit the Kinesis "Coin Report" / "Volume Report" cards exactly.
export function ReportCard({
  title,
  value,
  deltaPct,
  lastUpdated,
  tags = [],
  sparkline,
  color = "#B070FF",
  icon,
}: ReportCardProps) {
  const isDeltaPositive = deltaPct != null && deltaPct > 0;
  const isDeltaNegative = deltaPct != null && deltaPct < 0;

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
      {/* Title */}
      <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wider text-offivex-text-secondary">
        {icon && <span className="text-offivex-text-secondary">{icon}</span>}
        <span>{title}</span>
      </div>

      {/* Value + delta */}
      <div className="mb-2 flex items-baseline gap-2">
        <span className="font-display text-3xl font-semibold tabular-nums text-offivex-text-primary">
          {value}
        </span>
        {deltaPct != null && (
          <span
            className={`text-xs font-medium tabular-nums ${
              isDeltaPositive
                ? "text-emerald-400"
                : isDeltaNegative
                  ? "text-red-400"
                  : "text-offivex-text-muted"
            }`}
          >
            {isDeltaPositive ? "↑ " : isDeltaNegative ? "↓ " : ""}
            {Math.abs(deltaPct).toFixed(1)}%
          </span>
        )}
      </div>

      {/* Timestamp + tags */}
      <div className="mb-4 flex items-center gap-2 text-[10px] text-offivex-text-muted">
        {lastUpdated && (
          <span className="inline-flex items-center gap-1">
            <Clock size={10} strokeWidth={1.75} aria-hidden />
            {lastUpdated}
          </span>
        )}
        {tags.map((t) => (
          <span
            key={t}
            className="rounded-md border border-white/[0.06] bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-offivex-text-secondary"
          >
            {t}
          </span>
        ))}
      </div>

      {/* Sparkline */}
      <div className="-mx-1 -mb-1">
        <Sparkline data={sparkline} color={color} height={48} />
      </div>
    </div>
  );
}

