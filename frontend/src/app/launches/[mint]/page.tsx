"use client";

import { use } from "react";
import Link from "next/link";

import { LaunchDashboard } from "@/components/launch/LaunchDashboard";
import { MintPicker } from "@/components/launch/MintPicker";
import { useClaimActiveMint } from "@/components/launch/LaunchContext";

export default function LaunchPage({
  params,
}: {
  params: Promise<{ mint: string }>;
}) {
  const { mint } = use(params);
  // Claim this mint as the quick-sell target while the page is mounted
  // (auto-released on navigation).
  useClaimActiveMint(mint);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/launches"
            className="text-[11px] uppercase tracking-[0.18em] text-gray-500 hover:text-gray-300"
          >
            ← All launches
          </Link>
          <h1 className="font-display text-2xl md:text-3xl font-bold text-gray-100 mt-1">
            Viewing mint
          </h1>
        </div>
        <MintPicker current={mint} />
      </header>

      <LaunchDashboard mint={mint} density="page" />
    </div>
  );
}
