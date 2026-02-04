"use client";

import { createContext, useContext, useState, useCallback, useRef } from "react";
import { Toast, ToastVariant } from "./Toast";

interface ToastData {
  id: number;
  message: string;
  variant: ToastVariant;
  duration?: number;
}

interface ToastContextValue {
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
  toast: (message: string, variant?: ToastVariant, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const idRef = useRef(0);

  const addToast = useCallback(
    (message: string, variant: ToastVariant = "info", duration = 5000) => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, message, variant, duration }]);
    },
    []
  );

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const contextValue: ToastContextValue = {
    success: useCallback((message: string, duration?: number) =>
      addToast(message, "success", duration), [addToast]),
    error: useCallback((message: string, duration?: number) =>
      addToast(message, "error", duration), [addToast]),
    warning: useCallback((message: string, duration?: number) =>
      addToast(message, "warning", duration), [addToast]),
    info: useCallback((message: string, duration?: number) =>
      addToast(message, "info", duration), [addToast]),
    toast: addToast,
  };

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-3 pointer-events-none">
        <div className="flex flex-col gap-3 pointer-events-auto">
          {toasts.map((toast) => (
            <Toast
              key={toast.id}
              id={toast.id}
              message={toast.message}
              variant={toast.variant}
              duration={toast.duration}
              onDismiss={dismissToast}
            />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}
