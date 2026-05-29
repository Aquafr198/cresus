"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Per-device keybind configuration for the quick-sell feature. Stored in
 * localStorage so each device can have its own (laptop vs desktop). Synced
 * across tabs via the `storage` event.
 *
 * `event.code` values (e.g. "F4", "KeyT", "Digit4") are stored — not
 * `event.key` — so layouts (AZERTY, QWERTZ) map consistently.
 */
export interface KeybindConfig {
  sellAll: string;
  sellHalf: string;
  /** Default slippage applied to both keybinds. */
  slippageBps: number;
}

const STORAGE_KEY = "offivex.keybinds.v1";

export const KEYBIND_DEFAULTS: KeybindConfig = {
  sellAll: "F4",
  sellHalf: "F5",
  slippageBps: 1500,
};

/** Read the current config from localStorage, with safe fallbacks. */
export function getKeybinds(): KeybindConfig {
  if (typeof window === "undefined") return KEYBIND_DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return KEYBIND_DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<KeybindConfig>;
    return {
      sellAll: parsed.sellAll || KEYBIND_DEFAULTS.sellAll,
      sellHalf: parsed.sellHalf || KEYBIND_DEFAULTS.sellHalf,
      slippageBps:
        typeof parsed.slippageBps === "number" &&
        parsed.slippageBps >= 1 &&
        parsed.slippageBps <= 5000
          ? parsed.slippageBps
          : KEYBIND_DEFAULTS.slippageBps,
    };
  } catch {
    return KEYBIND_DEFAULTS;
  }
}

/** Persist a partial update; broadcasts via the storage event automatically. */
export function setKeybinds(patch: Partial<KeybindConfig>): KeybindConfig {
  const current = getKeybinds();
  const next: KeybindConfig = { ...current, ...patch };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    // Same-tab subscribers: localStorage's `storage` event only fires across
    // tabs, not within the writing tab. Dispatch a custom event so the
    // Settings UI can react immediately.
    window.dispatchEvent(new CustomEvent("offivex-keybinds-changed"));
  }
  return next;
}

/** Subscribe to keybind changes (across tabs + same-tab). */
export function useKeybindConfig(): KeybindConfig {
  const [config, setConfig] = useState<KeybindConfig>(() => getKeybinds());
  useEffect(() => {
    const refresh = () => setConfig(getKeybinds());
    window.addEventListener("storage", refresh);
    window.addEventListener("offivex-keybinds-changed", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("offivex-keybinds-changed", refresh);
    };
  }, []);
  return config;
}

/**
 * Determine whether a keyboard event should be ignored because the user is
 * actively typing into a form. Without this, F4 inside a text field would
 * trigger a sell.
 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

/** True when a modal is currently open on the page. */
function isModalOpen(): boolean {
  return Boolean(document.querySelector('[role="dialog"]'));
}

/**
 * Install the global keybind listener. Pass the callbacks; the hook handles
 * config reloading, focus filtering, modal blocking, and modifier-key
 * filtering (Ctrl/Cmd/Alt are blocked to avoid collisions with browser
 * shortcuts). Shift is intentionally allowed so users can bind to symbol
 * keys like "$" (= Shift+4) — `event.code` is shift-agnostic, so a bind on
 * `Digit4` will fire whether or not the user is also holding Shift.
 */
export function useQuickSellKeybinds(handlers: {
  onSellAll: () => void;
  onSellHalf: () => void;
}): void {
  const config = useKeybindConfig();
  // Keep handlers in a ref so the effect doesn't re-bind on each render.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (isModalOpen()) return;

      if (e.code === config.sellAll) {
        e.preventDefault();
        handlersRef.current.onSellAll();
      } else if (e.code === config.sellHalf) {
        e.preventDefault();
        handlersRef.current.onSellHalf();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [config.sellAll, config.sellHalf]);
}

/**
 * Format an `event.code` value for display. "KeyT" → "T", "F4" → "F4",
 * "Digit4" → "4", "Slash" → "/", etc. Falls back to the raw code if no
 * mapping applies.
 */
export function formatKeyCode(code: string): string {
  if (code.startsWith("Key") && code.length === 4) return code.slice(3);
  if (code.startsWith("Digit") && code.length === 6) return code.slice(5);
  if (code.startsWith("Numpad") && code.length === 7) return `Num${code.slice(6)}`;
  const SPECIAL: Record<string, string> = {
    Slash: "/",
    Backslash: "\\",
    Minus: "-",
    Equal: "=",
    BracketLeft: "[",
    BracketRight: "]",
    Semicolon: ";",
    Quote: "'",
    Comma: ",",
    Period: ".",
    Backquote: "`",
    Space: "Space",
    Enter: "Enter",
    Tab: "Tab",
  };
  return SPECIAL[code] || code;
}
