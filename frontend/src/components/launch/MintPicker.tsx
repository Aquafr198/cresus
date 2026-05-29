"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { api } from "@/lib/api";
import { useSWR } from "@/lib/swr";
import type { Token } from "@/lib/types";
import { useLaunch } from "./LaunchContext";

interface Props {
  /** Currently displayed mint, used to highlight the active option. */
  current?: string | null;
  /** When the user picks a new mint, where to send them. Defaults to
   *  `/launches/[mint]`. The widget overrides this to swap the context
   *  in-place without navigation. */
  onPick?: (mint: string) => void;
  /** Render compactly (used by the widget mini state). */
  compact?: boolean;
}

/**
 * Dropdown of all Offivex-launched tokens (no external mints by design).
 * Shared by the launch page header and the floating widget. Reads from the
 * `tokens.list` SWR cache key, so navigation is instant when the cache is
 * warm (which it is on any page that mints, bundles, or trades).
 */
export function MintPicker({ current, onPick, compact = false }: Props) {
  const router = useRouter();
  const { setActive } = useLaunch();
  const tokensSwr = useSWR<Token[]>("tokens.list", () =>
    api.tokens.list().then((r) => r.data),
  );
  const tokens = tokensSwr.data ?? [];

  const handlePick = (mint: string) => {
    const t = tokens.find((tk) => tk.mint_address === mint);
    setActive(mint, t?.symbol ?? null);
    if (onPick) onPick(mint);
    else router.push(`/launches/${mint}`);
  };

  if (tokens.length === 0) {
    return (
      <div className={compact ? "text-xs text-gray-500" : "text-sm text-gray-500"}>
        No launched tokens yet —{" "}
        <Link href="/mint" className="text-offivex-purple-light underline">
          mint your first
        </Link>
        .
      </div>
    );
  }

  return (
    <select
      value={current ?? ""}
      onChange={(e) => e.target.value && handlePick(e.target.value)}
      className={`bg-offivex-bg-elevated border border-white/[0.08] rounded-lg text-gray-100 focus:outline-none focus:border-offivex-purple/50 ${
        compact ? "px-2 py-1 text-xs max-w-[180px]" : "px-3 py-2 text-sm max-w-[280px]"
      }`}
    >
      {!current && <option value="">Pick a launch…</option>}
      {tokens.map((t) => (
        <option key={t.id} value={t.mint_address}>
          {t.symbol ? `$${t.symbol}` : "(no symbol)"}
          {t.name ? ` — ${t.name}` : ""}
        </option>
      ))}
    </select>
  );
}
