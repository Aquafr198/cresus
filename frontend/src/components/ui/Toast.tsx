"use client";

import { useEffect } from "react";
import {
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid";

export type ToastVariant = "success" | "error" | "warning" | "info";

export interface ToastProps {
  id: number;
  message: string;
  variant: ToastVariant;
  duration?: number;
  onDismiss: (id: number) => void;
}

const variantStyles = {
  success: {
    container: "bg-green-900/90 border-green-700 text-green-100",
    icon: "text-green-400",
    IconComponent: CheckCircleIcon,
  },
  error: {
    container: "bg-red-900/90 border-red-700 text-red-100",
    icon: "text-red-400",
    IconComponent: XCircleIcon,
  },
  warning: {
    container: "bg-yellow-900/90 border-yellow-700 text-yellow-100",
    icon: "text-yellow-400",
    IconComponent: ExclamationTriangleIcon,
  },
  info: {
    container: "bg-blue-900/90 border-blue-700 text-blue-100",
    icon: "text-blue-400",
    IconComponent: InformationCircleIcon,
  },
};

export function Toast({ id, message, variant, duration = 5000, onDismiss }: ToastProps) {
  const styles = variantStyles[variant];
  const Icon = styles.IconComponent;

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onDismiss(id);
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [id, duration, onDismiss]);

  return (
    <div
      className={`
        flex items-start gap-3 p-4 rounded-lg border shadow-lg
        backdrop-blur-sm animate-slide-in-right
        min-w-[320px] max-w-md
        ${styles.container}
      `}
      role="alert"
    >
      <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${styles.icon}`} />
      <div className="flex-1 text-sm font-medium leading-relaxed">
        {message}
      </div>
      <button
        onClick={() => onDismiss(id)}
        className="flex-shrink-0 text-current opacity-70 hover:opacity-100 transition-opacity"
        aria-label="Dismiss"
      >
        <XMarkIcon className="w-5 h-5" />
      </button>
    </div>
  );
}
