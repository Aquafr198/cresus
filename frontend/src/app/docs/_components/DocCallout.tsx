"use client";

import type { ReactNode } from "react";
import {
  InformationCircleIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ShieldExclamationIcon,
  LightBulbIcon,
} from "@heroicons/react/24/solid";

type Variant = "info" | "warn" | "danger" | "success" | "tip";

const VARIANTS: Record<
  Variant,
  {
    icon: React.ElementType;
    border: string;
    bg: string;
    iconColor: string;
    labelColor: string;
    defaultLabel: string;
  }
> = {
  info: {
    icon: InformationCircleIcon,
    border: "border-blue-500/30",
    bg: "bg-blue-500/[0.05]",
    iconColor: "text-blue-400",
    labelColor: "text-blue-300",
    defaultLabel: "Note",
  },
  warn: {
    icon: ExclamationTriangleIcon,
    border: "border-amber-500/30",
    bg: "bg-amber-500/[0.05]",
    iconColor: "text-amber-400",
    labelColor: "text-amber-300",
    defaultLabel: "Caution",
  },
  danger: {
    icon: ShieldExclamationIcon,
    border: "border-red-500/30",
    bg: "bg-red-500/[0.05]",
    iconColor: "text-red-400",
    labelColor: "text-red-300",
    defaultLabel: "Danger",
  },
  success: {
    icon: CheckCircleIcon,
    border: "border-green-500/30",
    bg: "bg-green-500/[0.05]",
    iconColor: "text-green-400",
    labelColor: "text-green-300",
    defaultLabel: "OK",
  },
  tip: {
    icon: LightBulbIcon,
    border: "border-offivex-purple/30",
    bg: "bg-offivex-purple/[0.05]",
    iconColor: "text-offivex-purple-light",
    labelColor: "text-offivex-purple-light",
    defaultLabel: "Tip",
  },
};

export function DocCallout({
  variant = "info",
  title,
  children,
}: {
  variant?: Variant;
  title?: string;
  children: ReactNode;
}) {
  const v = VARIANTS[variant];
  const Icon = v.icon;
  return (
    <div className={`my-4 rounded-lg border ${v.border} ${v.bg} p-4`}>
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 ${v.iconColor} shrink-0 mt-0.5`} />
        <div className="min-w-0 flex-1">
          <div
            className={`text-[11px] uppercase tracking-[0.18em] font-semibold ${v.labelColor} mb-1`}
          >
            {title || v.defaultLabel}
          </div>
          <div className="text-sm text-gray-300 leading-relaxed">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
