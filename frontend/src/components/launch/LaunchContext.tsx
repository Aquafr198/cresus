"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Tracks the "currently focused" token across the authenticated app. Pages
 * that show a specific mint (Monitor subscription, launch result modals)
 * call `setActiveMint(mintAddress)` so the global quick-sell keybind knows
 * what to sell when the user presses the configured key.
 *
 * When no page has claimed an active mint, the QuickSellRoot falls back to
 * the most recently launched token from the SWR cache.
 */
interface LaunchContextValue {
  activeMint: string | null;
  activeLabel: string | null;
  setActive: (mint: string | null, label?: string | null) => void;
}

const LaunchContext = createContext<LaunchContextValue>({
  activeMint: null,
  activeLabel: null,
  setActive: () => {},
});

export function LaunchProvider({ children }: { children: ReactNode }) {
  const [activeMint, setActiveMint] = useState<string | null>(null);
  const [activeLabel, setActiveLabel] = useState<string | null>(null);

  const setActive = useCallback((mint: string | null, label?: string | null) => {
    setActiveMint(mint);
    setActiveLabel(label ?? null);
  }, []);

  const value = useMemo(
    () => ({ activeMint, activeLabel, setActive }),
    [activeMint, activeLabel, setActive],
  );

  return <LaunchContext.Provider value={value}>{children}</LaunchContext.Provider>;
}

export function useLaunch(): LaunchContextValue {
  return useContext(LaunchContext);
}

/**
 * Convenience hook for pages that want to claim a mint while mounted and
 * release it on unmount. Idempotent — passing the same value won't churn.
 */
export function useClaimActiveMint(
  mint: string | null | undefined,
  label?: string | null,
): void {
  const { setActive } = useLaunch();
  useEffect(() => {
    if (!mint) return;
    setActive(mint, label ?? null);
    return () => setActive(null, null);
  }, [mint, label, setActive]);
}
