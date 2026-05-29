"use client";

import { useCallback, useRef } from "react";

import { api } from "@/lib/api";
import type { Token } from "@/lib/types";
import { useSWR } from "@/lib/swr";
import { useToast } from "@/components/ui/ToastProvider";
import { useQuickSellKeybinds, useKeybindConfig } from "@/lib/useKeybinds";
import { useLaunch } from "./LaunchContext";

/**
 * Headless component that:
 *  1. Listens for the configured quick-sell keybinds globally.
 *  2. Resolves which mint to sell (LaunchContext → fallback to `tokens.list[0]`).
 *  3. Calls `api.trading.quickSell()`.
 *  4. Toasts progress and per-wallet results.
 *
 * Mounted inside the authenticated branch of AuthGate so it never fires on
 * marketing routes (/docs, /apply, etc.).
 */
export function QuickSellRoot(): null {
  const toast = useToast();
  const { activeMint, activeLabel } = useLaunch();
  const config = useKeybindConfig();

  // Cache-only read of `tokens.list`. We rely on QuickSellHUD (in the
  // sidebar) and any visited launch page (/mint, /bundle, /trade) to
  // populate the shared cache. If the user fires a keybind and the cache
  // happens to be empty, `fire()` falls back to an on-demand mutate.
  const tokensSwr = useSWR<Token[]>(
    "tokens.list",
    () => api.tokens.list().then((r) => r.data),
    {
      revalidateOnMount: false,
      revalidateIfStale: false,
      revalidateOnFocus: false,
    },
  );

  // Re-entrancy guard: hammering F4 in 50 ms should not fire two quick-sells
  // in flight (they'd race the same on-chain balances and produce dupes).
  const inFlightRef = useRef(false);

  const fire = useCallback(
    async (percent: 50 | 100) => {
      if (inFlightRef.current) return;

      // Resolve target: explicit LaunchContext wins; else most-recent
      // launched token. If the cache hasn't been populated yet (user
      // hasn't touched /mint, /bundle, /trade, and HUD hasn't loaded),
      // pull it on-demand here before resolving.
      let tokens = tokensSwr.data;
      if (!activeMint && !tokens) {
        try {
          tokens = await tokensSwr.mutate();
        } catch {
          tokens = undefined;
        }
      }

      const mint = activeMint || tokens?.[0]?.mint_address || null;
      if (!mint) {
        toast.warning(
          "No active token — launch one or open /monitor first",
          4000,
        );
        return;
      }

      const tokenLabel =
        activeLabel ||
        tokens?.find((t) => t.mint_address === mint)?.symbol ||
        `${mint.slice(0, 4)}…${mint.slice(-4)}`;

      inFlightRef.current = true;
      const startedAt = performance.now();
      // Long duration: the result toast usually arrives in under a second on
      // a healthy RPC, but a degraded RPC can take 5–10 s. Better to stack
      // toasts briefly than have the progress one fade into silence.
      toast.info(
        `Selling ${percent}% of ${tokenLabel} across your wallets…`,
        10000,
      );

      try {
        const res = await api.trading.quickSell({
          mint,
          percent,
          slippage_bps: config.slippageBps,
        });
        const d = res.data;
        const wallClock = Math.round(performance.now() - startedAt);

        if (d.successful > 0 && d.failed === 0) {
          toast.success(
            `Sold ${percent}% of ${tokenLabel} on ${d.successful}/${d.total_wallets} wallets in ${d.elapsed_ms}ms (round-trip ${wallClock}ms)`,
            6000,
          );
        } else if (d.successful > 0 && d.failed > 0) {
          const firstError =
            d.results.find((r) => r.error)?.error || "unknown";
          toast.warning(
            `Partial: ${d.successful}/${d.total_wallets} sold, ${d.failed} failed. First error: ${firstError}`,
            8000,
          );
        } else {
          const firstError =
            d.results.find((r) => r.error)?.error || "all wallets failed";
          toast.error(`Quick-sell failed: ${firstError}`, 8000);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        toast.error(`Quick-sell error: ${msg}`, 8000);
      } finally {
        inFlightRef.current = false;
      }
    },
    [activeMint, activeLabel, config.slippageBps, toast, tokensSwr.data],
  );

  useQuickSellKeybinds({
    onSellAll: () => void fire(100),
    onSellHalf: () => void fire(50),
  });

  return null;
}
