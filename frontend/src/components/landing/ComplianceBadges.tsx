"use client";

import type { CSSProperties } from "react";

/**
 * Compliance & security badges row.
 *
 * Hardening notes :
 *   - Rendered via CSS `background-image` instead of <img> → no right-click
 *     "Save image as" option, no drag-to-desktop, no appears as image in DOM.
 *   - `contextmenu` / `dragstart` events cancelled.
 *   - `user-select` + `pointer-events: none` on the inner layer.
 *   - Pair with Referer-check middleware on `/badges.svg` (see middleware.ts)
 *     so the asset 403s on direct hotlinking from outside the site.
 *
 * NOTE — none of this is bulletproof. A motivated user can still open
 * DevTools → Network → copy the SVG source. These layers filter casual
 * right-clickers and external scrapers, which is the realistic threat model
 * for a public marketing asset.
 */
export function ComplianceBadges() {
  const protect: CSSProperties = {
    backgroundImage: "url(/badges.svg)",
    // Hint browsers to block native image drag / iOS callout
    WebkitUserSelect: "none",
    userSelect: "none",
  };

  return (
    <div className="pt-10 mt-10 border-t border-white/[0.04]">
      <div className="text-center text-[10px] font-display uppercase tracking-[0.25em] text-offivex-text-muted mb-6">
        Compliance &amp; security
      </div>

      <div className="flex justify-center px-6">
        <div
          role="img"
          aria-label="Offivex compliance & security certifications"
          onContextMenu={(e) => e.preventDefault()}
          onDragStart={(e) => e.preventDefault()}
          draggable={false}
          className="
            w-full max-w-sm
            aspect-[1239/171]
            bg-no-repeat bg-center bg-contain
            opacity-80
            select-none
            [-webkit-touch-callout:none]
            [-webkit-user-drag:none]
          "
          style={protect}
        />
      </div>
    </div>
  );
}
