"use client";

import { useEffect, useState } from "react";
import { LayoutGrid } from "lucide-react";
import { quoteOfTheDay, greetingFor } from "@/lib/quotes";
import type { UserMeSubscription } from "@/lib/api";

export interface GreetingCardProps {
  subscription?: UserMeSubscription | null;
}

/// Top-left dashboard card — gradient purple background, greeting + date,
/// subscription badge top-right, rotating launch quote at the bottom.
///
/// Renders deterministically server-side first (no quote / no date) then
/// hydrates with the real time-of-day greeting + daily quote. Avoids
/// React hydration mismatch errors from `new Date()` on render.
export function GreetingCard({ subscription }: GreetingCardProps) {
  // Hydrate after mount to avoid SSR/CSR clock mismatch.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    // No interval — greeting stable for hours; quote stable for a day.
  }, []);

  const greeting = now ? greetingFor(now) : "Welcome.";
  const quote = now ? quoteOfTheDay(now) : "";
  const dateLabel = now ? formatLongDate(now) : "";
  const isActive = subscription?.status === "active";
  const expiresLabel = subscription?.expires_at
    ? formatShortDate(new Date(subscription.expires_at * 1000))
    : null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-offivex-purple/30 via-offivex-purple/10 to-transparent p-7 h-full min-h-[180px]">
      {/* Subscription pill top-right */}
      {isActive && expiresLabel && (
        <div className="absolute right-5 top-5 inline-flex items-center gap-1.5 rounded-full border border-white/[0.10] bg-white/[0.06] px-2.5 py-1 text-[10px] font-medium text-offivex-text-secondary backdrop-blur-sm">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400"
            aria-hidden
          />
          Subscribed until {expiresLabel}
        </div>
      )}

      {/* Decorative dashboard mark top-left (matches Kinesis card layout). */}
      <div
        className="mb-12 flex h-10 w-10 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.05] text-offivex-text-secondary"
        aria-hidden
      >
        <LayoutGrid size={18} strokeWidth={1.75} />
      </div>

      {/* Greeting + date */}
      <h1 className="font-display text-4xl font-semibold tracking-tight text-offivex-text-primary">
        {greeting}
      </h1>
      <p className="mt-1 text-sm text-offivex-text-secondary">{dateLabel}</p>

      {/* Rotating quote */}
      {quote && (
        <p className="mt-6 max-w-md text-xs italic leading-relaxed text-offivex-text-muted">
          &ldquo;{quote}&rdquo;
        </p>
      )}
    </div>
  );
}

// English brand copy regardless of browser locale (Solana ecosystem default).
// Timezone still follows the user's system clock.

/// "Tuesday, July 8" — matches the Kinesis greeting card date format.
function formatLongDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

/// "July 9" — compact for the subscription pill.
function formatShortDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
}
