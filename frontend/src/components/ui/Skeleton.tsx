"use client";

/// Reusable skeleton loader. Replaces inconsistent text-based "Loading…" with
/// shimmer placeholders that match the shape of the upcoming content.
///
/// Audit P4 UX-11.
///
/// ```tsx
/// {loading ? <Skeleton variant="table" rows={5} /> : <Table ... />}
/// ```

export interface SkeletonProps {
  /// Layout preset: `"line"` (single text line), `"card"` (block w/ title +
  /// 2 paragraph lines), `"stat"` (small numeric tile), `"table"` (N rows).
  variant?: "line" | "card" | "stat" | "table";
  /// Number of rows when `variant="table"` (default 3).
  rows?: number;
  /// Optional extra class for layout customization.
  className?: string;
}

export function Skeleton({
  variant = "line",
  rows = 3,
  className = "",
}: SkeletonProps) {
  const shimmer =
    "bg-gradient-to-r from-gray-800 via-gray-700/50 to-gray-800 bg-[length:200%_100%] animate-shimmer rounded";

  switch (variant) {
    case "stat":
      return (
        <div
          className={`rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 ${className}`}
        >
          <div className={`h-3 w-20 ${shimmer} mb-3`} />
          <div className={`h-8 w-24 ${shimmer}`} />
        </div>
      );
    case "card":
      return (
        <div
          className={`rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-3 ${className}`}
        >
          <div className={`h-4 w-1/3 ${shimmer}`} />
          <div className={`h-3 w-full ${shimmer}`} />
          <div className={`h-3 w-2/3 ${shimmer}`} />
        </div>
      );
    case "table":
      return (
        <div className={`space-y-2 ${className}`}>
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <div className={`h-3 w-1/5 ${shimmer}`} />
              <div className={`h-3 w-1/4 ${shimmer}`} />
              <div className={`h-3 flex-1 ${shimmer}`} />
              <div className={`h-3 w-16 ${shimmer}`} />
            </div>
          ))}
        </div>
      );
    case "line":
    default:
      return <div className={`h-3 ${shimmer} ${className}`} />;
  }
}
