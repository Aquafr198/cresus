"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api";
import { useSWR } from "@/lib/swr";
import { monitorWs } from "@/lib/ws";
import type { LaunchDashboardData, MonitorEvent } from "@/lib/types";

/**
 * Single-source-of-truth hook for the launch dashboard page AND the floating
 * widget. Both consume the same SWR cache key (`launches.{mint}.dashboard`)
 * so two mounts = one network call.
 *
 * Strategy:
 *   - REST poll every 5 s for balances, tasks, curve state (slow-moving data).
 *   - WS subscribe to the mint; push events into a local buffer in real-time.
 *   - Merge buffer + REST backfill, dedup by signature, newest-first.
 *   - `refresh()` is exposed for sell-button callsites to invalidate
 *     immediately after a trade.
 */
export function useLaunchDashboard(mint: string | null) {
  const swr = useSWR<LaunchDashboardData>(
    mint ? `launches.${mint}.dashboard` : null,
    () => api.launches.dashboard(mint!).then((r) => r.data),
    {
      refreshInterval: 5000,
      dedupingInterval: 2000,
    },
  );

  // WS-driven live events for THIS mint. Kept separate from the REST
  // `activity` so the merge stays deterministic.
  const [liveEvents, setLiveEvents] = useState<MonitorEvent[]>([]);

  useEffect(() => {
    if (!mint) return;
    setLiveEvents([]); // reset when switching mints
    monitorWs.connect();
    monitorWs.subscribe(mint);
    const off = monitorWs.onEvent((ev) => {
      if (ev.mint_address !== mint) return;
      setLiveEvents((prev) => {
        // Dedup against ourselves (the WS can echo on reconnect).
        if (prev.some((e) => e.signature === ev.signature)) return prev;
        return [ev, ...prev].slice(0, 100);
      });
    });
    return () => {
      monitorWs.unsubscribe(mint);
      off();
    };
  }, [mint]);

  // Newest-first merged feed, capped at 100 entries. Live events take
  // priority over the REST backfill when their signatures collide.
  const activity = useMemo<MonitorEvent[]>(() => {
    const seen = new Set<string>();
    const out: MonitorEvent[] = [];
    for (const ev of [...liveEvents, ...(swr.data?.activity ?? [])]) {
      if (seen.has(ev.signature)) continue;
      seen.add(ev.signature);
      out.push(ev);
      if (out.length >= 100) break;
    }
    return out;
  }, [liveEvents, swr.data?.activity]);

  const refresh = useCallback(() => {
    void swr.mutate();
  }, [swr]);

  return {
    data: swr.data,
    activity,
    isLoading: swr.isLoading,
    error: swr.error,
    refresh,
  };
}
