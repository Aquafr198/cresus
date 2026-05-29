"use client";

import { useSWR } from "@/lib/swr";

/**
 * Resolves a Metaplex `metadata_uri` (which points to a JSON file per the
 * Token Metadata standard) to the actual image URL stored inside it (the
 * `.image` field).
 *
 * Cached via SWR keyed on the URI so the same metadata file is fetched at
 * most once across the entire app session. Returns `null` when the URI is
 * missing, the fetch fails, the JSON is malformed, or the `.image` field
 * is absent — callers should render a fallback (see `TokenAvatar`).
 */
export function useTokenImage(metadataUri: string | null | undefined): {
  image: string | null;
  isLoading: boolean;
} {
  const swr = useSWR<string | null>(
    metadataUri ? `token-meta:${metadataUri}` : null,
    async () => {
      try {
        const res = await fetch(metadataUri!, { cache: "force-cache" });
        if (!res.ok) return null;
        const json = (await res.json()) as { image?: unknown } | null;
        const img = json?.image;
        return typeof img === "string" && img.length > 0 ? img : null;
      } catch {
        return null;
      }
    },
    {
      revalidateOnFocus: false,
      revalidateIfStale: false,
      dedupingInterval: 60_000,
    },
  );
  return { image: swr.data ?? null, isLoading: swr.isLoading };
}
