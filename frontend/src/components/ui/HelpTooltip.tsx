"use client";

import { useState } from "react";

/// Small inline help tooltip — a circled `?` icon that reveals microcopy on
/// hover or focus. Use next to technical labels (multi_hop, slippage, batch_delay)
/// so users don't have to guess what an option does.
///
/// Audit P3 UX-7 / UX-8 — replaces the practice of leaving cryptic field names
/// uncommented in dense forms.

export interface HelpTooltipProps {
  /// The body text shown when the tooltip opens. Plain text or short JSX.
  children: React.ReactNode;
  /// Accessible label for screen readers (defaults to "Help").
  label?: string;
  /// Side the tooltip opens to. Default "right" works for inline-after-label.
  side?: "right" | "top" | "bottom" | "left";
}

export function HelpTooltip({
  children,
  label = "Help",
  side = "right",
}: HelpTooltipProps) {
  const [open, setOpen] = useState(false);

  const sideClasses = (() => {
    switch (side) {
      case "right":
        return "left-full ml-2 top-1/2 -translate-y-1/2";
      case "left":
        return "right-full mr-2 top-1/2 -translate-y-1/2";
      case "top":
        return "bottom-full mb-2 left-1/2 -translate-x-1/2";
      case "bottom":
      default:
        return "top-full mt-2 left-1/2 -translate-x-1/2";
    }
  })();

  return (
    <span
      className="relative inline-flex items-center align-middle"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-700/60 text-gray-300 text-[10px] font-bold leading-none border border-gray-600 hover:bg-gray-600 hover:text-white focus:outline-none focus:ring-2 focus:ring-offivex-purple/60"
      >
        ?
      </button>
      {open && (
        <span
          role="tooltip"
          className={`absolute z-50 ${sideClasses} w-64 px-3 py-2 rounded-md bg-gray-900 border border-gray-700 shadow-xl text-xs text-gray-200 leading-relaxed whitespace-normal pointer-events-none`}
        >
          {children}
        </span>
      )}
    </span>
  );
}
