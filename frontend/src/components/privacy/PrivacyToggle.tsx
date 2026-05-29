"use client";

import { Eye, EyeOff } from "lucide-react";

import { usePrivacyMode } from "./PrivacyProvider";

/**
 * Sidebar toggle that flips Privacy Mode on/off. Renders compact next to
 * the Lock button. Active state has a purple tint so it's visible at a
 * glance during a stream that the mode is engaged.
 */
export function PrivacyToggle() {
  const { enabled, toggle } = usePrivacyMode();
  return (
    <button
      onClick={toggle}
      title={
        enabled
          ? "Privacy mode ON — sensitive values are blurred. Click to disable."
          : "Activate privacy mode — blurs balances, mints, signatures, amounts."
      }
      className={`flex items-center gap-2.5 w-full px-3 py-2 text-sm rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-offivex-purple/50 ${
        enabled
          ? "bg-offivex-purple/15 border border-offivex-purple/30 text-offivex-purple-light hover:bg-offivex-purple/25"
          : "bg-white/[0.04] border border-transparent text-gray-400 hover:text-gray-200 hover:bg-white/[0.08]"
      }`}
    >
      {enabled ? (
        <EyeOff className="w-4 h-4 shrink-0" />
      ) : (
        <Eye className="w-4 h-4 shrink-0" />
      )}
      <span className="truncate">
        {enabled ? "Privacy ON" : "Privacy"}
      </span>
    </button>
  );
}
