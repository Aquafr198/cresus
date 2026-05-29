"use client";

import { useMemo } from "react";

export interface MintHistoryPoint {
  day: string; // "YYYY-MM-DD"
  count: number;
}

export interface MintHistoryBarsProps {
  data: MintHistoryPoint[];
  /// Bar color. Defaults to Offivex purple-light.
  color?: string;
  /// SVG viewBox height.
  height?: number;
}

const VIEW_W = 800;

/// Bar-chart timeline of mints per day. Matches the bottom panel of the
/// Kinesis dashboard screenshot — sparse bars, X-axis date labels every few
/// days, no Y-axis (label-by-tooltip via `<title>` element).
///
/// All-zero data renders an empty grid baseline; the parent should overlay
/// the "Nothing to see here" empty state in that case.
export function MintHistoryBars({
  data,
  color = "#B070FF",
  height = 240,
}: MintHistoryBarsProps) {
  const { bars, xLabels } = useMemo(() => {
    if (data.length === 0) {
      return { bars: [], xLabels: [] };
    }

    const max = Math.max(1, ...data.map((d) => d.count));
    const stepX = VIEW_W / data.length;
    const barW = Math.max(2, stepX * 0.55);
    const padTop = 16;
    const padBot = 28; // room for x-axis labels
    const innerH = height - padTop - padBot;
    const baselineY = padTop + innerH;

    const bars = data.map((d, i) => {
      const cx = i * stepX + stepX / 2;
      const h = (d.count / max) * innerH;
      return {
        key: d.day,
        x: cx - barW / 2,
        y: baselineY - h,
        w: barW,
        h: Math.max(d.count > 0 ? 2 : 0, h), // ensure ≥2px when count>0
        count: d.count,
        day: d.day,
      };
    });

    // Pick ~10 labels evenly spaced across the timeline (every 3 days for 30 points).
    const labelEvery = Math.max(1, Math.ceil(data.length / 10));
    const xLabels = data
      .map((d, i) => ({
        key: d.day,
        x: i * stepX + stepX / 2,
        y: height - 8,
        label: shortDay(d.day),
        show: i % labelEvery === 0,
      }))
      .filter((l) => l.show);

    return { bars, xLabels };
  }, [data, height]);

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${height}`}
      preserveAspectRatio="none"
      width="100%"
      height={height}
      role="img"
      aria-label={`Mint history bar chart with ${data.length} data points`}
    >
      {bars.map((b) => (
        <rect
          key={b.key}
          x={b.x}
          y={b.y}
          width={b.w}
          height={b.h}
          rx="1"
          fill={color}
          opacity={b.count > 0 ? 1 : 0}
        >
          <title>
            {b.day} — {b.count} {b.count === 1 ? "mint" : "mints"}
          </title>
        </rect>
      ))}
      {xLabels.map((l) => (
        <text
          key={l.key}
          x={l.x}
          y={l.y}
          textAnchor="middle"
          fontSize="11"
          fill="#8581A0"
          className="font-mono"
        >
          {l.label}
        </text>
      ))}
    </svg>
  );
}

/// "2026-05-22" → "May 22"
function shortDay(iso: string): string {
  const [, m, d] = iso.split("-");
  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const monthIdx = parseInt(m, 10) - 1;
  if (monthIdx < 0 || monthIdx > 11) return iso;
  return `${monthNames[monthIdx]} ${parseInt(d, 10)}`;
}
