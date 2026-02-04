"use client";

import { ExclamationTriangleIcon } from "@heroicons/react/24/solid";

export interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "info";
  onConfirm: () => void;
  onCancel: () => void;
}

const variantStyles = {
  danger: {
    title: "text-red-400",
    button: "bg-red-600 hover:bg-red-500",
  },
  warning: {
    title: "text-yellow-400",
    button: "bg-yellow-600 hover:bg-yellow-500",
  },
  info: {
    title: "text-blue-400",
    button: "bg-blue-600 hover:bg-blue-500",
  },
};

export function ConfirmDialog({
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "info",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const styles = variantStyles[variant];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-96 shadow-2xl animate-slide-in">
        <div className="flex items-start gap-3 mb-4">
          <ExclamationTriangleIcon className={`w-6 h-6 flex-shrink-0 ${styles.title}`} />
          <h3 className={`text-lg font-semibold ${styles.title}`}>{title}</h3>
        </div>
        <p className="text-sm text-gray-300 mb-6 leading-relaxed">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${styles.button}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
