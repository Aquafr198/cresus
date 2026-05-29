"use client";

import Link from "next/link";

import { api } from "@/lib/api";
import { useSWR } from "@/lib/swr";
import type { Token } from "@/lib/types";
import { SolscanButton } from "@/components/ui/SolscanButton";
import { TokenAvatar } from "@/components/launch/TokenAvatar";

/**
 * Index of every token launched through Offivex. Each card links to the
 * full /launches/[mint] console. This is the entry point for the "Launches"
 * sidebar section.
 */
export default function LaunchesIndexPage() {
  const tSwr = useSWR<Token[]>("tokens.list", () =>
    api.tokens.list().then((r) => r.data),
  );
  const tokens = tSwr.data ?? [];
  const isLoading = tSwr.isLoading;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <header className="mb-6">
        <div className="text-[11px] uppercase tracking-[0.22em] text-offivex-purple-light mb-2">
          Launches
        </div>
        <h1 className="font-display text-3xl md:text-4xl font-bold text-gray-100 mb-1">
          Your launches
        </h1>
        <p className="text-sm text-offivex-text-secondary">
          Live dashboard for every token you&rsquo;ve launched on Offivex.
          Pick one to open the full console — or use the floating widget
          (bottom-right) to keep an eye on a launch from any page.
        </p>
      </header>

      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-white/[0.06] bg-offivex-bg-surface h-32 animate-pulse"
            />
          ))}
        </div>
      ) : tokens.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {tokens.map((t) => (
            <LaunchCard key={t.id} token={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function LaunchCard({ token }: { token: Token }) {
  const symbol = token.symbol ?? "?";
  return (
    <Link
      href={`/launches/${token.mint_address}`}
      className="group block rounded-xl border border-white/[0.06] bg-offivex-bg-surface hover:border-offivex-purple/40 hover:bg-offivex-purple/[0.04] transition-colors p-4"
    >
      <div className="flex items-start gap-3">
        <TokenAvatar
          metadataUri={token.metadata_uri}
          symbol={token.symbol}
          mint={token.mint_address}
          size={48}
          className="rounded-lg"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-gray-100 truncate group-hover:text-offivex-purple-light">
              ${symbol}
            </div>
            <StatusPill createdAt={token.created_at} />
          </div>
          <div className="text-xs text-gray-500 truncate">
            {token.name ?? "(unnamed)"}
          </div>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-white/[0.04] flex items-center justify-between text-[11px] text-gray-500 font-mono">
        <span className="truncate">
          {token.mint_address.slice(0, 4)}…
          {token.mint_address.slice(-4)}
        </span>
        <SolscanButton address={token.mint_address} size={12} />
      </div>
    </Link>
  );
}

/**
 * Coarse freshness signal based purely on `tokens.created_at`. We don't
 * fetch live curve / activity here (that would mean N RPC calls just to
 * render the index) — the user gets the full state on the per-mint page.
 *
 * `created_at` is the unix-seconds value stored by the DB.
 */
function StatusPill({ createdAt }: { createdAt: number }) {
  const ageMs = Date.now() - createdAt * 1000;
  const ONE_DAY = 24 * 3600_000;
  const SEVEN_DAYS = 7 * ONE_DAY;
  let label = "Idle";
  let cls = "bg-white/[0.04] border-white/[0.08] text-gray-500";
  if (ageMs < ONE_DAY) {
    label = "Active";
    cls = "bg-green-500/15 border-green-500/30 text-green-300";
  } else if (ageMs < SEVEN_DAYS) {
    label = "Recent";
    cls = "bg-offivex-purple/15 border-offivex-purple/30 text-offivex-purple-light";
  }
  return (
    <span
      className={`inline-block text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border whitespace-nowrap ${cls}`}
    >
      {label}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-offivex-bg-surface p-8 text-center">
      <div className="text-sm text-gray-300 mb-2">
        No launches yet.
      </div>
      <div className="text-xs text-gray-500 mb-4">
        Mint a token to get started — it will show up here automatically.
      </div>
      <Link
        href="/mint"
        className="inline-block px-4 py-2 rounded-lg bg-offivex-purple/20 hover:bg-offivex-purple/30 text-offivex-purple-light text-sm font-semibold transition-colors"
      >
        Go to Mint
      </Link>
    </div>
  );
}
