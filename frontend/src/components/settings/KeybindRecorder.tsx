"use client";

import { useEffect, useState } from "react";
import {
  formatKeyCode,
  getKeybinds,
  setKeybinds,
  useKeybindConfig,
  KEYBIND_DEFAULTS,
} from "@/lib/useKeybinds";

/**
 * Settings panel for the quick-sell keybinds. Lets the user remap the two
 * actions to any single keyboard key (including unmodified letters, digits,
 * function keys, punctuation) and tune the default slippage.
 *
 * Recording rules:
 *  - Click "Record new key" → next non-modifier `keydown` is captured.
 *  - Escape cancels recording.
 *  - Modifier-only events (just Shift / Ctrl / etc.) are ignored.
 *  - The two slots cannot share the same code (we surface an inline error
 *    rather than silently overwriting).
 */
export function KeybindRecorder() {
  const config = useKeybindConfig();
  const [recordingSlot, setRecordingSlot] = useState<
    "sellAll" | "sellHalf" | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!recordingSlot) return;

    // Keys reserved by the app or the browser. Binding to these would either
    // call `e.preventDefault()` on essential UI keystrokes (Tab focus
    // traversal, Space scroll, Enter submit) or shadow critical browser
    // behavior (Backspace navigation, arrow-key form/menu nav).
    const RESERVED = new Set([
      "Escape",
      "Tab",
      "Space",
      "Enter",
      "NumpadEnter",
      "Backspace",
      "Delete",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
    ]);

    const onKey = (e: KeyboardEvent) => {
      // Ignore pure modifier presses.
      if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();

      // Escape = cancel recording (cannot be bound).
      if (e.code === "Escape") {
        setRecordingSlot(null);
        return;
      }

      // Reject combos — quick-sell is single-key by contract.
      if (e.ctrlKey || e.metaKey || e.altKey) {
        setError(
          "Use a single unmodified key (Ctrl/Cmd/Alt combos are not supported)",
        );
        return;
      }

      // Reject reserved keys.
      if (RESERVED.has(e.code)) {
        setError(
          `${formatKeyCode(e.code)} is reserved by the browser or app — pick another key.`,
        );
        return;
      }

      // Reject collisions.
      const other =
        recordingSlot === "sellAll" ? config.sellHalf : config.sellAll;
      if (e.code === other) {
        setError(
          `That key is already bound to ${recordingSlot === "sellAll" ? "Sell 50%" : "Sell 100%"}`,
        );
        return;
      }

      setKeybinds({ [recordingSlot]: e.code });
      setRecordingSlot(null);
      setError(null);
    };

    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [recordingSlot, config.sellAll, config.sellHalf]);

  const reset = () => {
    setKeybinds({
      sellAll: KEYBIND_DEFAULTS.sellAll,
      sellHalf: KEYBIND_DEFAULTS.sellHalf,
      slippageBps: KEYBIND_DEFAULTS.slippageBps,
    });
    setError(null);
  };

  const onSlippageInput = (raw: string) => {
    const pct = Number(raw);
    if (!Number.isFinite(pct) || pct < 0.1 || pct > 50) return;
    setKeybinds({ slippageBps: Math.round(pct * 100) });
  };

  const slippagePct = (getKeybinds().slippageBps / 100).toFixed(1);

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-100">
            Quick-sell keybinds
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Two single-key shortcuts to exit your launched token across all
            holding wallets. Fires immediately — no confirmation modal.
          </p>
        </div>
        <button
          onClick={reset}
          className="text-xs text-gray-400 hover:text-gray-200 underline"
        >
          Reset defaults
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <KeySlot
          label="Sell 100%"
          code={config.sellAll}
          recording={recordingSlot === "sellAll"}
          onRecord={() => {
            setError(null);
            setRecordingSlot("sellAll");
          }}
          onCancel={() => setRecordingSlot(null)}
          accent="text-red-300 border-red-500/30 bg-red-500/[0.05]"
        />
        <KeySlot
          label="Sell 50%"
          code={config.sellHalf}
          recording={recordingSlot === "sellHalf"}
          onRecord={() => {
            setError(null);
            setRecordingSlot("sellHalf");
          }}
          onCancel={() => setRecordingSlot(null)}
          accent="text-amber-300 border-amber-500/30 bg-amber-500/[0.05]"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-sm text-gray-200">
            Slippage tolerance
          </label>
          <span className="text-sm font-mono text-offivex-purple-light">
            {slippagePct}%
          </span>
        </div>
        <input
          type="range"
          min="10"
          max="5000"
          step="50"
          value={config.slippageBps}
          onChange={(e) =>
            onSlippageInput((Number(e.target.value) / 100).toString())
          }
          className="w-full accent-offivex-purple"
        />
        <p className="text-xs text-gray-500 mt-1">
          Default 15% — memecoin exits often need this much to land in one
          shot. Raise to 30–50% for distressed pools, lower for stable ones.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/[0.05] p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-3 text-xs text-amber-200/90 leading-relaxed">
        Fires immediately when pressed — no confirmation modal. The active
        token is whichever launch page you&rsquo;re on (Monitor subscription,
        Mint result, Bundle result, Pump.fun launch). Falls back to your most
        recent launched token otherwise.
      </div>
    </div>
  );
}

function KeySlot({
  label,
  code,
  recording,
  onRecord,
  onCancel,
  accent,
}: {
  label: string;
  code: string;
  recording: boolean;
  onRecord: () => void;
  onCancel: () => void;
  accent: string;
}) {
  return (
    <div className={`rounded-lg border ${accent} p-3`}>
      <div className="text-[11px] uppercase tracking-[0.18em] text-gray-400 mb-2">
        {label}
      </div>
      <div className="flex items-center gap-2">
        <kbd className="px-3 py-1.5 rounded-md bg-black/40 border border-white/[0.1] text-sm font-mono text-gray-100 min-w-[3rem] text-center">
          {recording ? "…" : formatKeyCode(code)}
        </kbd>
        {recording ? (
          <button
            onClick={onCancel}
            className="text-xs px-3 py-1.5 rounded-md border border-white/[0.1] bg-white/[0.04] text-gray-300 hover:bg-white/[0.06]"
          >
            Cancel (Esc)
          </button>
        ) : (
          <button
            onClick={onRecord}
            className="text-xs px-3 py-1.5 rounded-md border border-white/[0.1] bg-white/[0.04] text-gray-300 hover:bg-white/[0.06]"
          >
            Record new key
          </button>
        )}
      </div>
      {recording && (
        <div className="text-[11px] text-gray-400 mt-2">
          Press any single key…
        </div>
      )}
    </div>
  );
}
