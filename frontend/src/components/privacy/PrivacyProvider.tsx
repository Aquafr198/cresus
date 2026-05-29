"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

/**
 * Privacy Mode — global toggle that blurs every UI element marked with
 * `<Sensitive>...</Sensitive>`. Designed for launchers who need to stream,
 * record, or screenshare their dashboard without leaking balances,
 * mint addresses, signatures, etc.
 *
 * Implementation is intentionally CSS-driven: the provider only writes
 * `data-privacy-mode="on"` on <body>. The actual blur is handled by a
 * single CSS rule in globals.css matching that attribute against
 * `[data-sensitive="true"]` descendants. Toggling is O(1) — no React
 * re-render across the tree.
 *
 * State persists in localStorage (per-device) so a user who streams from
 * their desktop doesn't accidentally turn privacy ON on their mobile.
 */
const STORAGE_KEY = "offivex.privacy-mode.v1";
const BODY_ATTR = "data-privacy-mode";

interface PrivacyContextValue {
  enabled: boolean;
  toggle: () => void;
  setEnabled: (v: boolean) => void;
}

const PrivacyContext = createContext<PrivacyContextValue>({
  enabled: false,
  toggle: () => {},
  setEnabled: () => {},
});

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  // Synchronous read of localStorage in the lazy initializer — must NOT
  // wait for a useEffect to apply, or we get a Flash Of Unmasked Content
  // on every reload (the entire dashboard would be readable for one
  // frame before the effect kicks in, defeating the whole point on a
  // live stream). SSR-safe because the initializer guards `window`.
  const [enabled, setEnabledRaw] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  });

  // Sync to body attribute + localStorage on every change. Cleanup
  // removes the attribute if the provider ever unmounts (logout) so a
  // stale "on" doesn't outlive its context.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (enabled) {
      document.body.setAttribute(BODY_ATTR, "on");
    } else {
      document.body.removeAttribute(BODY_ATTR);
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
    }
    return () => {
      if (typeof document !== "undefined") {
        document.body.removeAttribute(BODY_ATTR);
      }
    };
  }, [enabled]);

  const setEnabled = useCallback((v: boolean) => setEnabledRaw(v), []);
  const toggle = useCallback(() => setEnabledRaw((v) => !v), []);

  return (
    <PrivacyContext.Provider value={{ enabled, toggle, setEnabled }}>
      {children}
    </PrivacyContext.Provider>
  );
}

export function usePrivacyMode(): PrivacyContextValue {
  return useContext(PrivacyContext);
}
