// Global SWR configuration.
//
// Pattern in this app:
//   const { data, error, isLoading, mutate } = useSWR(
//     "wallets.list",                  // cache key (string OR null to skip)
//     () => api.wallets.list().then(r => r.data),
//   );
//
// We do NOT need a custom fetcher because every page calls the typed
// `api.*` helpers directly inside the SWR fetcher lambda. That keeps each
// page in control of its argument types and lets the `request()` helper add
// the Authorization header automatically (no duplicate auth wiring here).

import useSWRBase, { SWRConfig, SWRConfiguration, useSWRConfig as useSWRCfg } from "swr";

import { ApiError } from "./api";

/// Default config for the whole app.
///
/// Memecoin launchpad data freshness:
///   - dedupingInterval 2000 ms — collapses StrictMode double-mount + rapid
///     nav bursts into one network request.
///   - revalidateOnFocus true — coming back from another tab refreshes data,
///     because a user's wallet balance / token mint state can change in
///     seconds during a launch.
///   - revalidateOnReconnect false — mobile networks flap; aggressive
///     reconnect-revalidation creates a thundering herd.
///   - shouldRetryOnError — retry only on 5xx + network errors. Never retry
///     4xx — 401 (re-login), 402 (renew plan), 403 (unlock vault) all need
///     user action, not blind retries.
export const swrConfig: SWRConfiguration = {
  dedupingInterval: 2000,
  revalidateOnFocus: true,
  revalidateOnReconnect: false,
  shouldRetryOnError: (err: unknown) => {
    if (err instanceof ApiError) {
      return err.status >= 500;
    }
    return true;
  },
  errorRetryCount: 3,
  errorRetryInterval: 1500,
};

export { SWRConfig };
export const useSWR = useSWRBase;
export const useSWRConfig = useSWRCfg;
