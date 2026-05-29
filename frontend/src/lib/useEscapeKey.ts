import { useEffect } from "react";

/// Run `onEscape` whenever the user presses the Escape key while `active` is
/// true. Intended for closing modals / dialogs.
///
/// Audit P4 UX-9 — previously each modal duplicated its own `keydown` listener
/// (or simply didn't have one, requiring an explicit click on the backdrop or
/// Cancel button). This hook gives every modal the standard escape-to-dismiss
/// behavior with one line.
///
/// ```tsx
/// useEscapeKey(open, () => setOpen(false));
/// ```
export function useEscapeKey(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [active, onEscape]);
}
