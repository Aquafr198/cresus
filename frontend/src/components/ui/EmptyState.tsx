"use client";

import React from "react";

/// Reusable empty-state for tables and lists. Replaces the inconsistent
/// "No X yet" lines scattered across pages with a single shape so the visual
/// language is predictable for the user.
///
/// Audit P4 UX-10.

export interface EmptyStateProps {
  /// Optional emoji or icon (`<svg>`, `<Image>`) shown at the top.
  icon?: React.ReactNode;
  /// Short headline — what's missing.
  title: string;
  /// Optional supporting copy / instruction on how to fix it.
  description?: React.ReactNode;
  /// Optional CTA — button, link, etc. Rendered after the description.
  action?: React.ReactNode;
  /// Variant: `"card"` (bordered surface, default), `"flat"` (no border,
  /// for use inside an already-bordered container).
  variant?: "card" | "flat";
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  variant = "card",
}: EmptyStateProps) {
  const wrapper =
    variant === "card"
      ? "text-center py-10 px-6 rounded-lg border border-dashed border-gray-700 bg-gray-900/30"
      : "text-center py-8 px-4";
  return (
    <div className={wrapper}>
      {icon && (
        <div className="text-3xl mb-2 opacity-60 inline-flex items-center justify-center">
          {icon}
        </div>
      )}
      <p className="text-gray-200 text-sm font-medium mb-1">{title}</p>
      {description && (
        <p className="text-gray-500 text-xs leading-relaxed max-w-md mx-auto">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
