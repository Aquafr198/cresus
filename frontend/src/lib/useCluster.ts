"use client";

import { api } from "./api";
import { useSWR } from "./swr";

/// Cached lookup of the current Solana cluster (mainnet / devnet) the
/// backend is configured for. Returns `null` while loading / on error so
/// callers can fall back to the safer default (mainnet — they'll never
/// link a devnet user to a mainnet block explorer).
///
/// Single SWR key shared by every consumer → 1 request per session.
export function useCluster(): "mainnet" | "devnet" | null {
  const { data } = useSWR(
    "health.cluster",
    () => api.health().then((h) => h.cluster ?? null),
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );
  if (data === "mainnet" || data === "devnet") return data;
  return null;
}

/// Build a Solscan account URL for the given Solana address, honoring the
/// detected cluster. Solscan defaults to mainnet when no `cluster` query is
/// set, so we only append the param on devnet.
export function solscanAccountUrl(
  address: string,
  cluster: "mainnet" | "devnet" | null,
): string {
  const base = `https://solscan.io/account/${encodeURIComponent(address)}`;
  return cluster === "devnet" ? `${base}?cluster=devnet` : base;
}
