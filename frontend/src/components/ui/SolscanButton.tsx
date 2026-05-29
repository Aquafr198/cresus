"use client";

import Image from "next/image";
import { solscanAccountUrl, useCluster } from "@/lib/useCluster";

interface SolscanButtonProps {
  /// Solana account / mint / program address to open on Solscan.
  address: string;
  /// Optional size in px (square). Default 16 — matches inline icon sizes.
  size?: number;
  /// Optional title for the tooltip. Default is built from the address.
  title?: string;
  /// Extra Tailwind classes for the wrapping anchor.
  className?: string;
}

/// Inline icon-button that opens the Solana address on Solscan in a new
/// tab. Uses the **official Solana logo** asset shipped in `/public/
/// solana-logo.svg` (Solana Foundation brand kit — CC-BY). The button
/// honors the detected cluster (mainnet / devnet) so devnet users land
/// on the right network without an extra click.
export function SolscanButton({
  address,
  size = 16,
  title,
  className = "",
}: SolscanButtonProps) {
  const cluster = useCluster();
  const href = solscanAccountUrl(address, cluster);
  const label =
    title ??
    `Open ${address.slice(0, 4)}…${address.slice(-4)} on Solscan` +
      (cluster === "devnet" ? " (devnet)" : "");

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={label}
      aria-label={label}
      className={
        "inline-flex items-center justify-center rounded p-1 " +
        "text-offivex-text-secondary hover:text-white " +
        "hover:bg-white/[0.06] transition-colors " +
        className
      }
    >
      <Image
        src="/solana-logo.svg"
        alt=""
        width={size}
        height={size}
        priority={false}
        unoptimized
        aria-hidden
      />
    </a>
  );
}
