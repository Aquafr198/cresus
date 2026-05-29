"use client";

import { useEffect, useState, useRef } from "react";
import { api, ApiError } from "@/lib/api";
import { useSWR } from "@/lib/swr";
import { monitorWs } from "@/lib/ws";
import { MonitorEvent } from "@/lib/types";
import { useClaimActiveMint } from "@/components/launch/LaunchContext";

const MAX_EVENTS = 200;

export default function MonitorPage() {
  const [events, setEvents] = useState<MonitorEvent[]>([]);
  // Shared SWR keys with /mint, /bundle. Monitor-specific subscriptions
  // get their own key.
  const tSwr = useSWR("tokens.list", () => api.tokens.list().then((r) => r.data));
  const sSwr = useSWR(
    "monitor.subscriptions",
    () => api.monitor.subscriptions().then((r) => r.data),
  );
  const tokens = tSwr.data ?? [];
  const subscriptions = sSwr.data ?? [];
  const [mintInput, setMintInput] = useState("");
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const eventsRef = useRef<MonitorEvent[]>([]);
  const feedRef = useRef<HTMLDivElement>(null);

  // Keep pausedRef in sync
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // Surface fetch errors via the existing banner.
  useEffect(() => {
    const e = tSwr.error ?? sSwr.error;
    if (e instanceof ApiError) setError(e.message);
    else if (e) setError("Failed to load monitor data");
  }, [tSwr.error, sSwr.error]);

  // Quick-sell focus. The keybind (F4/F5) targets the *focused* subscription
  // while this page is mounted. Default: the most recently subscribed mint.
  // The user can click the star on any subscription row to re-focus.
  const [focusedMint, setFocusedMint] = useState<string | null>(null);

  // Auto-fallback: if the manually-focused mint disappears (unsubscribed) or
  // none has ever been chosen, point at the most recent subscription.
  const claimedMint =
    (focusedMint && subscriptions.includes(focusedMint) ? focusedMint : null) ||
    subscriptions[subscriptions.length - 1] ||
    null;
  const claimedLabel =
    (claimedMint &&
      tokens.find((t) => t.mint_address === claimedMint)?.symbol) ||
    null;
  useClaimActiveMint(claimedMint, claimedLabel);

  // Called after subscribe/unsubscribe to refresh the subscriptions list.
  const fetchData = () => {
    void sSwr.mutate();
  };

  useEffect(() => {
    // Connect WS — independent of REST cache.
    monitorWs.connect();
    setConnected(monitorWs.connected);

    const checkConnection = setInterval(() => {
      setConnected(monitorWs.connected);
    }, 2000);

    // Listen for events — use pausedRef to avoid stale closure
    const unsubscribe = monitorWs.onEvent((event) => {
      eventsRef.current = [event, ...eventsRef.current].slice(0, MAX_EVENTS);
      if (!pausedRef.current) {
        setEvents([...eventsRef.current]);
      }
    });

    return () => {
      clearInterval(checkConnection);
      unsubscribe();
      monitorWs.disconnect();
    };
  }, []);

  const handleSubscribe = async (mint: string) => {
    if (!mint.trim()) return;
    setError(null);
    try {
      await api.monitor.subscribe(mint.trim());
      monitorWs.subscribe(mint.trim());
      setMintInput("");
      fetchData();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("Failed to subscribe");
    }
  };

  const handleUnsubscribe = async (mint: string) => {
    setError(null);
    try {
      await api.monitor.unsubscribe(mint);
      monitorWs.unsubscribe(mint);
      fetchData();
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
    }
  };

  const eventTypeColor = (type: string) => {
    switch (type) {
      case "swap":
        return "text-yellow-400";
      case "mint":
        return "text-emerald-400";
      case "transfer":
        return "text-blue-400";
      case "burn":
        return "text-red-400";
      case "add_liquidity":
        return "text-purple-400";
      case "remove_liquidity":
        return "text-orange-400";
      default:
        return "text-gray-400";
    }
  };

  const directionBadge = (dir: string | null) => {
    if (!dir) return null;
    const color = dir === "buy" ? "text-emerald-400 bg-emerald-900/30" : "text-red-400 bg-red-900/30";
    return (
      <span className={`px-1.5 py-0.5 rounded text-xs ${color}`}>
        {dir.toUpperCase()}
      </span>
    );
  };

  const tokenLabel = (mint: string) => {
    const t = tokens.find((t) => t.mint_address === mint);
    if (t) return t.name || t.symbol || mint.slice(0, 8) + "...";
    return mint.slice(0, 8) + "...";
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Transaction Monitor</h1>
        <div className="flex items-center gap-3">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              connected ? "bg-emerald-400" : "bg-red-400"
            }`}
          />
          <span className="text-xs text-gray-400">
            {connected ? "Connected" : "Disconnected"}
          </span>
          <button
            onClick={() => setPaused(!paused)}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              paused
                ? "bg-yellow-600 hover:bg-yellow-700"
                : "bg-gray-700 hover:bg-gray-600"
            }`}
          >
            {paused ? "Resume" : "Pause"}
          </button>
          <button
            onClick={() => {
              eventsRef.current = [];
              setEvents([]);
            }}
            className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {error && (
        <div className="text-red-400 text-sm mb-4 bg-red-900/20 border border-red-800 rounded p-2">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Subscriptions Panel */}
        <div>
          <section className="bg-gray-900 rounded-lg border border-gray-800 p-4">
            <h2 className="text-sm font-semibold mb-3">Subscriptions</h2>

            <div className="flex gap-2 mb-3">
              {tokens.length > 0 ? (
                <select
                  value={mintInput}
                  onChange={(e) => setMintInput(e.target.value)}
                  className="flex-1 px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Select token...</option>
                  {tokens.map((t) => (
                    <option key={t.id} value={t.mint_address}>
                      {t.name || t.symbol || t.mint_address.slice(0, 12) + "..."}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={mintInput}
                  onChange={(e) => setMintInput(e.target.value)}
                  placeholder="Mint address..."
                  className="flex-1 px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs font-mono focus:outline-none focus:border-indigo-500"
                />
              )}
              <button
                onClick={() => handleSubscribe(mintInput)}
                disabled={!mintInput.trim()}
                className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded transition-colors"
              >
                +
              </button>
            </div>

            {subscriptions.length === 0 ? (
              <p className="text-gray-500 text-xs">No active subscriptions.</p>
            ) : (
              <div className="space-y-1">
                {subscriptions.map((mint) => {
                  const isFocused = mint === claimedMint;
                  return (
                    <div
                      key={mint}
                      className={`flex items-center gap-1.5 px-2 py-1.5 rounded transition-colors ${
                        isFocused
                          ? "bg-offivex-purple/15 border border-offivex-purple/40"
                          : "bg-gray-800 border border-transparent"
                      }`}
                    >
                      <button
                        onClick={() => setFocusedMint(mint)}
                        title={
                          isFocused
                            ? "Quick-sell target (F4/F5)"
                            : "Set as quick-sell target"
                        }
                        className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${
                          isFocused
                            ? "text-offivex-purple-light"
                            : "text-gray-500 hover:text-gray-300"
                        }`}
                        aria-label={
                          isFocused ? "Active quick-sell target" : "Focus this mint"
                        }
                      >
                        {isFocused ? "★" : "☆"}
                      </button>
                      <span className="text-xs font-mono truncate flex-1">
                        {tokenLabel(mint)}
                      </span>
                      <button
                        onClick={() => handleUnsubscribe(mint)}
                        className="ml-1 px-1.5 py-0.5 text-xs text-red-400 hover:bg-red-900/30 rounded"
                      >
                        X
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Event Feed */}
        <div className="lg:col-span-3">
          <section className="bg-gray-900 rounded-lg border border-gray-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">
                Live Feed ({events.length} events)
              </h2>
              {paused && (
                <span className="text-xs text-yellow-400">Paused</span>
              )}
            </div>

            <div
              ref={feedRef}
              className="space-y-1 max-h-[600px] overflow-y-auto"
            >
              {events.length === 0 ? (
                <p className="text-gray-500 text-xs py-8 text-center">
                  No events yet. Subscribe to a mint address to start monitoring.
                </p>
              ) : (
                events.map((e, i) => (
                  <div
                    key={`${e.signature}-${i}`}
                    className="flex items-center gap-3 px-3 py-2 bg-gray-800 rounded text-xs hover:bg-gray-700/50"
                  >
                    <span className="text-gray-500 w-16 flex-shrink-0">
                      {new Date(e.timestamp * 1000).toLocaleTimeString()}
                    </span>
                    <span
                      className={`w-20 flex-shrink-0 font-medium ${eventTypeColor(
                        e.event_type
                      )}`}
                    >
                      {e.event_type}
                    </span>
                    {directionBadge(e.direction)}
                    <span className="text-gray-400 truncate flex-1 font-mono">
                      {e.signature.slice(0, 20)}...
                    </span>
                    <span className="text-gray-500 flex-shrink-0">
                      slot {e.slot}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
