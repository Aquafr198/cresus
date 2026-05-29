"use client";

// Thin client-side wrapper so the root layout (a server component) can mount
// SWR's React context without becoming a client component itself.

import { SWRConfig, swrConfig } from "@/lib/swr";

export function SwrProvider({ children }: { children: React.ReactNode }) {
  return <SWRConfig value={swrConfig}>{children}</SWRConfig>;
}
