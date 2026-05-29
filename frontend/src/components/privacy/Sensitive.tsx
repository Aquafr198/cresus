"use client";

import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  /**
   * Force the blur regardless of the global privacy toggle. Useful for
   * always-secret data like seed phrase displays.
   */
  always?: boolean;
  /**
   * Disable hover-to-reveal — for truly secret data that should never be
   * shown by a casual hover (seed phrase, private keys). Default false:
   * a 1.5s hover briefly reveals the value.
   */
  lock?: boolean;
  className?: string;
}

/**
 * Wrap any rendered value that contains sensitive info so the privacy
 * toggle can blur it. Renders an inline `<span>` with `data-sensitive`
 * attribute matched by the CSS rule in `globals.css`.
 *
 * Wrap: balances, addresses, mints, signatures, monetary amounts, percent
 * of supply, USD values. DO NOT wrap: token symbols ($SYMBOL), wallet
 * labels ("dev"), status badges, navigation, counts.
 */
export function Sensitive({ children, always, lock, className }: Props) {
  return (
    <span
      data-sensitive={always ? "always" : "true"}
      data-locked={lock ? "true" : undefined}
      className={className}
    >
      {children}
    </span>
  );
}
