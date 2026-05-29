"use client";

import { api } from "@/lib/api";
import type { Token } from "@/lib/types";
import { useSWR } from "@/lib/swr";
import { useLaunch } from "./LaunchContext";
import {
  formatKeyCode,
  useKeybindConfig,
} from "@/lib/useKeybinds";

/**
 * Compact always-visible pill in the sidebar showing which token the
 * quick-sell keybinds will hit. This is the single source of truth the user
 * checks BEFORE pressing F4/F5 — without it the feature feels unsafe.
 *
 * Resolution order matches QuickSellRoot:
 *   1. `LaunchContext.activeMint` (claimed by /monitor focus, mint/bundle/
 *       pump-fun result modals)
 *   2. `tokens.list[0]` from the shared SWR cache (most recently launched)
 *   3. None → renders an explanatory empty state
 *
 * This component DOES fetch `tokens.list` on mount (cheap, deduped via SWR
 * shared key), so the HUD is always accurate. QuickSellRoot reads from the
 * cache only — they share the same key, so still one network call.
 */
export function QuickSellHUD() {
  const { activeMint, activeLabel } = useLaunch();
  const config = useKeybindConfig();

  const tokensSwr = useSWR<Token[]>("tokens.list", () =>
    api.tokens.list().then((r) => r.data),
  );

  const fallbackToken = tokensSwr.data?.[0];
  const mint = activeMint || fallbackToken?.mint_address || null;
  const fromContext = Boolean(activeMint);

  const label = mint
    ? activeLabel ||
      tokensSwr.data?.find((t) => t.mint_address === mint)?.symbol ||
      `${mint.slice(0, 4)}…${mint.slice(-4)}`
    : null;

  const sellAllKey = formatKeyCode(config.sellAll);
  const sellHalfKey = formatKeyCode(config.sellHalf);
  const slippagePct = (config.slippageBps / 100).toFixed(0);

  if (!mint) {
    return (
      <div
        className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px] text-gray-500 leading-tight"
        title="The quick-sell keybinds need an active token. Launch one or focus a mint on /monitor."
      >
        <div className="flex items-center gap-2">
          <Kbd>{sellAllKey}</Kbd>
          <span>Quick-sell · no active token</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-lg border border-offivex-purple/30 bg-offivex-purple/[0.06] px-3 py-2 text-[11px] leading-tight"
      title={`Quick-sell target: ${mint}\n${sellAllKey} = sell ${100}% · ${sellHalfKey} = sell 50% · slippage ${slippagePct}%`}
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="text-offivex-purple-light font-semibold uppercase tracking-wider text-[9px]">
          Armed
        </span>
        <span className="text-gray-200 font-mono truncate">
          {label && label !== mint ? `$${label}` : label}
        </span>
        {!fromContext && (
          <span
            className="text-[9px] text-gray-500"
            title="No page has claimed focus — falling back to your most recent launched token"
          >
            (latest)
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5 text-gray-400">
        <Kbd>{sellAllKey}</Kbd>
        <span>100%</span>
        <span className="text-gray-700">·</span>
        <Kbd>{sellHalfKey}</Kbd>
        <span>50%</span>
        <span className="text-gray-700">·</span>
        <span className="text-gray-500">{slippagePct}% slip</span>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="px-1 py-0.5 rounded bg-black/40 border border-white/[0.1] text-[10px] font-mono text-gray-200">
      {children}
    </kbd>
  );
}
