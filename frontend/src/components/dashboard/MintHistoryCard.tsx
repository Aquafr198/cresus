"use client";

import { MintHistoryBars, type MintHistoryPoint } from "./MintHistoryBars";

export interface MintHistoryCardProps {
  data: MintHistoryPoint[];
}

/// Container card for the MintHistoryBars chart with title + empty state.
export function MintHistoryCard({ data }: MintHistoryCardProps) {
  const hasData = data.some((d) => d.count > 0);

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
      <div className="mb-4 text-base font-semibold text-offivex-text-primary">
        Mint History
      </div>

      {hasData ? (
        <MintHistoryBars data={data} />
      ) : (
        <div className="relative">
          {/* Faded baseline bars to hint the chart shape */}
          <MintHistoryBars
            data={data.length > 0 ? data : placeholder30Days()}
            color="#2A2640"
          />
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-sm font-medium text-offivex-text-primary">
              Nothing to see here
            </div>
            <div className="mt-1 text-xs text-offivex-text-muted">
              You haven&apos;t launched any coins yet
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/// Generate 30 empty days ending today (for the faded baseline grid).
function placeholder30Days(): MintHistoryPoint[] {
  const out: MintHistoryPoint[] = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const day = d.toISOString().slice(0, 10);
    out.push({ day, count: 0 });
  }
  return out;
}
