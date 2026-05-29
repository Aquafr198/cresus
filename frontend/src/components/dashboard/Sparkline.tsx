"use client";

import { useMemo } from "react";

/// Lightweight SVG sparkline (no external chart lib).
///
/// Renders a smooth polyline over `data`, normalized to fill the height.
/// Optional `fillBelow` adds a subtle gradient under the line for the
/// Kinesis "filled area" look. Designed to be ~100% width of its parent and
/// fixed height (default 48px).
///
/// Design choices:
///   * No axes, no grid, no tooltips — pure decorative trend line.
///   * No animation — Offivex aesthetic is flat / motion-free.
///   * `vectorEffect: non-scaling-stroke` keeps the line thickness constant
///     even when the SVG is resized by CSS.
///   * Works on 0 or 1 data points (renders a flat baseline).

export interface SparklineProps {
  data: number[];
  /// Stroke color (any valid CSS color). Defaults to Offivex purple-light.
  color?: string;
  /// SVG viewBox height — width auto-fits parent via `preserveAspectRatio`.
  /// Default 48 (matches Kinesis card sparkline scale).
  height?: number;
  /// Stroke width in non-scaled pixels.
  strokeWidth?: number;
  /// Fill under the line with a vertical gradient (color → transparent).
  /// Default true to match Kinesis cards.
  fillBelow?: boolean;
  /// Extra CSS class on the SVG element.
  className?: string;
  /// Accessible label (sparkline is decorative by default, label optional).
  ariaLabel?: string;
}

const VIEW_W = 200; // logical width — SVG scales to fit parent via preserveAspectRatio

export function Sparkline({
  data,
  color = "#B070FF", // var(--color-offivex-purple-light)
  height = 48,
  strokeWidth = 1.5,
  fillBelow = true,
  className = "",
  ariaLabel,
}: SparklineProps) {
  const { path, areaPath } = useMemo(() => {
    if (data.length === 0) {
      const y = height / 2;
      return {
        path: `M0,${y} L${VIEW_W},${y}`,
        areaPath: `M0,${height} L0,${y} L${VIEW_W},${y} L${VIEW_W},${height} Z`,
      };
    }
    if (data.length === 1) {
      const y = height / 2;
      return {
        path: `M0,${y} L${VIEW_W},${y}`,
        areaPath: `M0,${height} L0,${y} L${VIEW_W},${y} L${VIEW_W},${height} Z`,
      };
    }

    const min = Math.min(...data);
    const max = Math.max(...data);
    // Pad the vertical range so flat-low or flat-high lines aren't crushed
    // against the edges.
    const range = Math.max(max - min, 1e-9);
    const padTop = 4;
    const padBot = 4;
    const innerH = height - padTop - padBot;

    const stepX = VIEW_W / (data.length - 1);

    const pts = data.map((v, i) => {
      const x = i * stepX;
      const y = padTop + innerH * (1 - (v - min) / range);
      return [x, y] as const;
    });

    // Smooth-ish curve via Catmull-Rom-style: each segment is a cubic Bezier
    // with control points derived from neighboring points. Gives the
    // Kinesis "natural" smooth feel without needing a 3rd-party path lib.
    const path = pts
      .map(([x, y], i, arr) => {
        if (i === 0) return `M${x.toFixed(2)},${y.toFixed(2)}`;
        const [x0, y0] = arr[i - 1];
        const cpx = (x0 + x) / 2;
        return `C${cpx.toFixed(2)},${y0.toFixed(2)} ${cpx.toFixed(2)},${y.toFixed(2)} ${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");

    const areaPath = `${path} L${VIEW_W},${height} L0,${height} Z`;
    return { path, areaPath };
  }, [data, height]);

  // Stable gradient id per color so multiple sparklines on the same page
  // don't clash (color is the discriminator we control).
  const gradientId = useMemo(
    () => `sparkline-fill-${color.replace(/[^a-zA-Z0-9]/g, "")}`,
    [color],
  );

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${height}`}
      preserveAspectRatio="none"
      width="100%"
      height={height}
      className={className}
      aria-hidden={ariaLabel ? undefined : true}
      aria-label={ariaLabel}
      role={ariaLabel ? "img" : undefined}
    >
      {fillBelow && (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
      )}
      {fillBelow && <path d={areaPath} fill={`url(#${gradientId})`} />}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
