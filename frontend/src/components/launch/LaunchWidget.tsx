"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  AnimatePresence,
  motion,
  useDragControls,
  useMotionValue,
  type MotionValue,
} from "motion/react";
import { Maximize2, X, ChevronUp } from "lucide-react";

import { api } from "@/lib/api";
import { useSWR } from "@/lib/swr";
import type { LaunchDashboardData, Token } from "@/lib/types";
import { useLaunch } from "./LaunchContext";
import { useLaunchDashboard } from "@/lib/useLaunchDashboard";
import { MintPicker } from "./MintPicker";
import { LaunchDashboard } from "./LaunchDashboard";
import { TokenAvatar } from "./TokenAvatar";
import { Sensitive } from "@/components/privacy/Sensitive";

type WidgetState = "pill" | "mini" | "hidden";

const STORAGE_STATE = "offivex.launch-widget.state.v1";
const STORAGE_POS = "offivex.launch-widget.pos.v1";

/**
 * Floating Discord-style widget that follows the user across every
 * authenticated page. Three states:
 *
 *   - `pill`   : 280×60 px badge bottom-right, shows $SYM + bonding %.
 *                Click to expand to `mini`.
 *   - `mini`   : 420×620 px expanded mini-dashboard. Shares the SWR cache
 *                key with the /launches/[mint] page so opening both is one
 *                network call. Has buttons to expand to full page + close.
 *   - `hidden` : invisible. A tiny restore tab appears bottom-right to bring
 *                it back.
 *
 * Mounts inside AuthGate (only for authenticated, non-marketing pages).
 * Auto-hides itself on /launches/[mint] to avoid duplication with the
 * full-page dashboard.
 */
export function LaunchWidget() {
  const pathname = usePathname();
  const router = useRouter();
  const { activeMint, activeLabel, setActive } = useLaunch();

  // Persist state across page nav so the widget remembers if user closed it.
  const [state, setStateRaw] = useState<WidgetState>("pill");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(STORAGE_STATE) as WidgetState | null;
    if (saved === "pill" || saved === "mini" || saved === "hidden") {
      setStateRaw(saved);
    }
  }, []);
  const setState = useCallback((s: WidgetState) => {
    setStateRaw(s);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_STATE, s);
    }
  }, []);

  // Auto-hide on the dedicated launch page to avoid duplication.
  const onLaunchPage =
    pathname?.startsWith("/launches/") && pathname !== "/launches";

  // Fall back to tokens[0] if no LaunchContext claim — same logic as the HUD.
  const tokensSwr = useSWR<Token[]>(
    "tokens.list",
    () => api.tokens.list().then((r) => r.data),
    { revalidateIfStale: false, revalidateOnFocus: false },
  );
  const fallbackToken = tokensSwr.data?.[0];
  const mint = activeMint || fallbackToken?.mint_address || null;
  const label =
    activeLabel ||
    tokensSwr.data?.find((t) => t.mint_address === mint)?.symbol ||
    null;
  const isLatestFallback = !activeMint && Boolean(fallbackToken);

  // Shared drag position — pill and mini render at the same offset from
  // their anchor (bottom-right). User drags once, both states remember.
  // Hooks MUST be called unconditionally (no early return above).
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(STORAGE_POS);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { x?: number; y?: number };
      if (typeof parsed.x === "number") x.set(parsed.x);
      if (typeof parsed.y === "number") y.set(parsed.y);
    } catch {
      /* corrupt entry — ignore */
    }
  }, [x, y]);
  const persistPosition = useCallback(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      STORAGE_POS,
      JSON.stringify({ x: x.get(), y: y.get() }),
    );
  }, [x, y]);

  if (onLaunchPage || !mint) {
    // Hide entirely on the launch page (page is already showing this content)
    // OR when there's no token at all (don't pollute the UI).
    return null;
  }

  const expandToPage = () => {
    setActive(mint, label);
    router.push(`/launches/${mint}`);
  };

  // AnimatePresence note: `mode="wait"` is intentionally absent. The pill
  // and the mini share `layoutId="launch-widget-card"` on their internal
  // motion.div — for the box-morph animation to run, both components must
  // briefly coexist in the tree. `mode="wait"` would serialize their mount
  // and break the morph into a fade-out/fade-in instead.
  //
  // Keys here are NOT for React reconciliation (the conditional branches
  // already give them positional identity) — they're how AnimatePresence
  // tracks each branch's presence for exit animations.
  return (
    <AnimatePresence>
      {state === "hidden" && (
        <motion.button
          key="restore"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          onClick={() => setState("pill")}
          className="fixed bottom-3 right-3 z-40 flex items-center gap-1 px-2 py-1 rounded-l-lg bg-offivex-bg-elevated border border-white/[0.08] text-[10px] uppercase tracking-wider text-gray-400 hover:text-gray-200 hover:bg-offivex-purple/15 transition-colors"
          title="Restore launch widget"
        >
          <ChevronUp className="w-3 h-3 rotate-90" />
          Launch
        </motion.button>
      )}

      {state === "pill" && (
        <PillWidget
          key="pill"
          mint={mint}
          label={label}
          isLatestFallback={isLatestFallback}
          x={x}
          y={y}
          persistPosition={persistPosition}
          onExpand={() => setState("mini")}
          onClose={() => setState("hidden")}
        />
      )}

      {state === "mini" && (
        <MiniWidget
          key="mini"
          mint={mint}
          label={label}
          isLatestFallback={isLatestFallback}
          x={x}
          y={y}
          persistPosition={persistPosition}
          onCollapse={() => setState("pill")}
          onClose={() => setState("hidden")}
          onExpandToPage={expandToPage}
        />
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pill state — small bottom-right badge
// ─────────────────────────────────────────────────────────────────────────────

function PillWidget({
  mint,
  label,
  isLatestFallback,
  x,
  y,
  persistPosition,
  onExpand,
  onClose,
}: {
  mint: string;
  label: string | null;
  isLatestFallback: boolean;
  x: MotionValue<number>;
  y: MotionValue<number>;
  persistPosition: () => void;
  onExpand: () => void;
  onClose: () => void;
}) {
  const { data } = useLaunchDashboard(mint);

  return (
    <motion.div
      layoutId="launch-widget-card"
      style={{ x, y }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
      drag
      dragMomentum={false}
      dragElastic={0.1}
      onDragEnd={persistPosition}
      className="fixed bottom-4 right-4 z-40 cursor-grab active:cursor-grabbing"
    >
      <div
        onClick={onExpand}
        className="group flex items-center gap-2 px-3 py-2 rounded-xl bg-offivex-bg-elevated border border-offivex-purple/40 shadow-lg shadow-offivex-purple/10 hover:border-offivex-purple/70 transition-colors min-w-[260px] cursor-pointer"
        title="Click to expand launch dashboard"
      >
        <TokenAvatar
          metadataUri={data?.details.metadata_uri}
          symbol={label}
          mint={mint}
          size={32}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] uppercase tracking-wider text-offivex-purple-light font-semibold">
              Armed
            </span>
            <span className="text-sm font-semibold text-gray-100 truncate">
              ${label ?? "?"}
            </span>
            {isLatestFallback && (
              <span className="text-[9px] text-gray-500">(latest)</span>
            )}
          </div>
          <div className="text-[10px] text-gray-500 truncate">
            {data?.curve ? (
              data.curve.graduated ? (
                "Graduated"
              ) : (
                <>
                  Bonding <Sensitive>{data.curve.fill_pct.toFixed(0)}%</Sensitive>
                </>
              )
            ) : (
              `${data?.holders.length ?? 0} holding · ${data?.tasks.volume.length ?? 0} bot${(data?.tasks.volume.length ?? 0) === 1 ? "" : "s"}`
            )}
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-white/[0.06]"
          title="Hide widget"
        >
          <X className="w-3 h-3 text-gray-500" />
        </button>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mini state — 420×620 floating mini-dashboard
// ─────────────────────────────────────────────────────────────────────────────

function MiniWidget({
  mint,
  label,
  isLatestFallback,
  x,
  y,
  persistPosition,
  onCollapse,
  onClose,
  onExpandToPage,
}: {
  mint: string;
  label: string | null;
  isLatestFallback: boolean;
  x: MotionValue<number>;
  y: MotionValue<number>;
  persistPosition: () => void;
  onCollapse: () => void;
  onClose: () => void;
  onExpandToPage: () => void;
}) {
  // Local mint switch inside the widget — lets the user re-target without
  // navigating away. The shared LaunchContext means the active mint also
  // updates the keybind target everywhere.
  const { setActive } = useLaunch();

  // Header-only drag. `dragListener: false` blocks the default pointer-down
  // capture on the body; instead the DragHeader manually starts a drag via
  // these controls. Without this, clicking anywhere in the body (sell button,
  // mint picker, etc.) would initiate a drag and steal the click.
  const dragControls = useDragControls();

  return (
    <motion.div
      layoutId="launch-widget-card"
      style={{ x, y }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ type: "spring", stiffness: 280, damping: 30 }}
      drag
      dragListener={false}
      dragControls={dragControls}
      dragMomentum={false}
      dragElastic={0.05}
      onDragEnd={persistPosition}
      className="fixed bottom-4 right-4 z-50 w-[420px] max-w-[calc(100vw-2rem)] h-[620px] max-h-[calc(100vh-2rem)] rounded-2xl bg-offivex-bg-elevated border border-offivex-purple/30 shadow-2xl shadow-black/40 flex flex-col overflow-hidden"
    >
      {/* Drag handle / header — manually starts a drag via dragControls so
          the body remains click-through (sell buttons etc. work). */}
      <DragHeader
        label={label}
        mint={mint}
        isLatestFallback={isLatestFallback}
        onDragStart={(e) => dragControls.start(e)}
        onChangeMint={(m) => setActive(m, null)}
        onCollapse={onCollapse}
        onClose={onClose}
        onExpandToPage={onExpandToPage}
      />

      {/* Body — reuse the same component the page renders */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <LaunchDashboard mint={mint} density="mini" />
      </div>
    </motion.div>
  );
}

function DragHeader({
  label,
  mint,
  isLatestFallback,
  onDragStart,
  onChangeMint,
  onCollapse,
  onClose,
  onExpandToPage,
}: {
  label: string | null;
  mint: string;
  isLatestFallback: boolean;
  onDragStart: (e: React.PointerEvent) => void;
  onChangeMint: (m: string) => void;
  onCollapse: () => void;
  onClose: () => void;
  onExpandToPage: () => void;
}) {
  // Stop interactive controls (buttons, picker) from initiating a drag —
  // their pointerdown fires before ours bubbles up to the title area.
  const stopDrag = (e: React.PointerEvent) => e.stopPropagation();

  return (
    <div
      onPointerDown={onDragStart}
      className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.06] bg-white/[0.02] cursor-grab active:cursor-grabbing select-none"
    >
      <div className="flex-1 min-w-0 flex items-center gap-2 pointer-events-none">
        <span className="text-[9px] uppercase tracking-wider text-offivex-purple-light font-semibold">
          Launch
        </span>
        <span className="text-xs font-semibold text-gray-100 truncate">
          ${label ?? "?"}
        </span>
        {isLatestFallback && (
          <span className="text-[9px] text-gray-500">(latest)</span>
        )}
      </div>
      <div onPointerDown={stopDrag}>
        <MintPicker current={mint} compact onPick={onChangeMint} />
      </div>
      <button
        onPointerDown={stopDrag}
        onClick={onExpandToPage}
        className="p-1 rounded hover:bg-white/[0.06] text-gray-400 hover:text-gray-200"
        title="Expand to full page"
      >
        <Maximize2 className="w-3.5 h-3.5" />
      </button>
      <button
        onPointerDown={stopDrag}
        onClick={onCollapse}
        className="p-1 rounded hover:bg-white/[0.06] text-gray-400 hover:text-gray-200"
        title="Collapse to pill"
      >
        <ChevronUp className="w-3.5 h-3.5 rotate-180" />
      </button>
      <button
        onPointerDown={stopDrag}
        onClick={onClose}
        className="p-1 rounded hover:bg-white/[0.06] text-gray-400 hover:text-gray-200"
        title="Hide widget"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// Mark imports used only for typing/inference to keep tsc happy.
export type { LaunchDashboardData };
