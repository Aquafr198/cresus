"use client";

import Image from "next/image";

import { useTokenImage } from "@/lib/useTokenImage";

interface Props {
  /** Metaplex metadata URI from `tokens.metadata_uri` — points to JSON. */
  metadataUri: string | null | undefined;
  symbol: string | null | undefined;
  /** Used to seed a deterministic fallback background color. */
  mint: string;
  /** Square edge length in px. */
  size: number;
  className?: string;
}

/**
 * Token avatar with graceful fallback. Tries to render the image referenced
 * by the Metaplex JSON; on miss (no URI, fetch failed, image field absent)
 * shows the first 2 chars of the symbol on a hashed background color.
 *
 * Matches the Phantom / Birdeye / Solscan fallback pattern: the user always
 * sees something deterministic per mint, never a broken image icon.
 */
export function TokenAvatar({
  metadataUri,
  symbol,
  mint,
  size,
  className,
}: Props) {
  const { image } = useTokenImage(metadataUri);
  const initials = (symbol || mint.slice(0, 2)).slice(0, 2).toUpperCase();
  const bgHue = hashHue(mint);

  return (
    <div
      className={`shrink-0 rounded-md overflow-hidden flex items-center justify-center ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        backgroundColor: image ? "rgba(255,255,255,0.06)" : `hsl(${bgHue} 55% 32%)`,
      }}
    >
      {image ? (
        <Image
          src={image}
          alt={symbol || "token"}
          width={size}
          height={size}
          unoptimized
          className="object-cover"
        />
      ) : (
        <span
          className="font-bold text-white tracking-tight leading-none select-none"
          style={{ fontSize: Math.max(10, Math.floor(size * 0.42)) }}
        >
          {initials}
        </span>
      )}
    </div>
  );
}

/** djb2-ish hash → hue degree [0, 360). Deterministic per mint string. */
function hashHue(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 360;
}
