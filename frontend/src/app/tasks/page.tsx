"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Play, Rocket, Coins, Flame } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import { useSWR } from "@/lib/swr";
import { useToast } from "@/components/ui/ToastProvider";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface TaskRow {
  id: string;
  task_type: string;
  status: string;
  config_blob: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

/**
 * Launch task templates — Kinesis-style "Mint Task / Bundle Task /
 * Pump-Fun Task". The user saves a launch configuration here, then
 * re-executes it on demand. Execute = fetch the blob server-side, store
 * it in sessionStorage, then navigate to the matching launch page so it
 * can re-fill the form and ship.
 */
export default function TasksPage() {
  const router = useRouter();
  const toast = useToast();
  const swr = useSWR<TaskRow[]>("tasks.list", () =>
    api.tasks.list().then((r) => r.data),
  );
  const [pendingExecute, setPendingExecute] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TaskRow | null>(null);

  const handleExecute = async (task: TaskRow) => {
    if (pendingExecute) return;
    setPendingExecute(task.id);
    try {
      const res = await api.tasks.execute(task.id);
      // Stash the blob in sessionStorage with a one-shot key — the target
      // page reads + clears it on mount, then re-fills its form. Avoids a
      // URL query string that would leak the launch config into history.
      const key = `offivex.task-prefill.${res.data.task_type}`;
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(
          key,
          JSON.stringify(res.data.config_blob),
        );
      }
      const route =
        res.data.task_type === "mint_template"
          ? "/mint"
          : res.data.task_type === "bundle_template"
            ? "/bundle"
            : "/pump-fun";
      toast.info(`Loading template into ${route}…`, 4000);
      router.push(route);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      toast.error(`Execute failed: ${msg}`, 7000);
    } finally {
      setPendingExecute(null);
    }
  };

  // Re-entrance guard so a fast double-click on the Confirm button in the
  // ConfirmDialog fires only one DELETE. Without this, the second click
  // races to delete a row that no longer exists and surfaces a confusing
  // "Delete failed: ..." toast right after the success one.
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (task: TaskRow) => {
    if (deleting) return;
    setDeleting(true);
    try {
      await api.tasks.delete(task.id);
      toast.success("Template deleted", 3000);
      void swr.mutate();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      toast.error(`Delete failed: ${msg}`, 5000);
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  };

  const tasks = swr.data ?? [];
  const groupedByType = {
    mint_template: tasks.filter((t) => t.task_type === "mint_template"),
    bundle_template: tasks.filter((t) => t.task_type === "bundle_template"),
    pump_fun_template: tasks.filter((t) => t.task_type === "pump_fun_template"),
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {confirmDelete && (
        <ConfirmDialog
          title="Delete template?"
          message={`This removes the saved template "${(confirmDelete.config_blob.__label as string) ?? confirmDelete.id.slice(0, 8)}". The on-chain history of past executions is unaffected.`}
          confirmText="Delete"
          variant="warning"
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      <header className="mb-6">
        <div className="text-[11px] uppercase tracking-[0.22em] text-offivex-purple-light mb-2">
          Tasks
        </div>
        <h1 className="font-display text-3xl md:text-4xl font-bold text-gray-100 mb-1">
          Launch templates
        </h1>
        <p className="text-sm text-offivex-text-secondary">
          Save a launch configuration once, replay it with a single click
          when the moment is right. Templates are local to your vault —
          nothing on-chain happens until you press Execute.
        </p>
      </header>

      {swr.isLoading ? (
        <div className="rounded-xl border border-white/[0.06] bg-offivex-bg-surface p-8 animate-pulse">
          Loading…
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-5">
          <TaskGroup
            title="Mint templates"
            icon={Coins}
            rows={groupedByType.mint_template}
            onExecute={handleExecute}
            onAskDelete={setConfirmDelete}
            pendingExecute={pendingExecute}
            originPath="/mint"
          />
          <TaskGroup
            title="Bundle templates"
            icon={Rocket}
            rows={groupedByType.bundle_template}
            onExecute={handleExecute}
            onAskDelete={setConfirmDelete}
            pendingExecute={pendingExecute}
            originPath="/bundle"
          />
          <TaskGroup
            title="Pump.fun templates"
            icon={Flame}
            rows={groupedByType.pump_fun_template}
            onExecute={handleExecute}
            onAskDelete={setConfirmDelete}
            pendingExecute={pendingExecute}
            originPath="/pump-fun"
          />
        </div>
      )}
    </div>
  );
}

function TaskGroup({
  title,
  icon: Icon,
  rows,
  onExecute,
  onAskDelete,
  pendingExecute,
  originPath,
}: {
  title: string;
  icon: React.ElementType;
  rows: TaskRow[];
  onExecute: (t: TaskRow) => void;
  onAskDelete: (t: TaskRow) => void;
  pendingExecute: string | null;
  originPath: string;
}) {
  if (rows.length === 0) {
    return (
      <section className="rounded-xl border border-white/[0.04] bg-offivex-bg-surface p-4">
        <div className="flex items-center gap-2 mb-1 text-gray-400">
          <Icon className="w-4 h-4" />
          <h2 className="text-sm font-semibold">{title}</h2>
          <span className="text-[10px] text-gray-600">empty</span>
        </div>
        <p className="text-xs text-gray-500">
          Open{" "}
          <a href={originPath} className="text-offivex-purple-light underline">
            {originPath}
          </a>
          , configure your launch, then click{" "}
          <strong className="text-gray-300">Save as Task</strong>.
        </p>
      </section>
    );
  }
  return (
    <section className="rounded-xl border border-white/[0.06] bg-offivex-bg-surface p-4">
      <div className="flex items-center gap-2 mb-3 text-gray-200">
        <Icon className="w-4 h-4 text-offivex-purple-light" />
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-[10px] text-gray-500">
          {rows.length} template{rows.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="space-y-2">
        {rows.map((t) => (
          <TaskRowCard
            key={t.id}
            task={t}
            onExecute={onExecute}
            onAskDelete={onAskDelete}
            isPending={pendingExecute === t.id}
            isAnyPending={pendingExecute !== null}
          />
        ))}
      </div>
    </section>
  );
}

function TaskRowCard({
  task,
  onExecute,
  onAskDelete,
  isPending,
  isAnyPending,
}: {
  task: TaskRow;
  onExecute: (t: TaskRow) => void;
  onAskDelete: (t: TaskRow) => void;
  isPending: boolean;
  isAnyPending: boolean;
}) {
  const label = (task.config_blob.__label as string) || taskSummary(task);
  const wasExecuted = task.status === "executed";
  const lastUsed =
    task.updated_at !== task.created_at
      ? `last used ${relativeAge(task.updated_at)}`
      : `saved ${relativeAge(task.created_at)}`;

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-white/[0.04] bg-white/[0.02]">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-gray-100 truncate">
          {label}
        </div>
        <div className="text-[10px] text-gray-500 mt-0.5 flex items-center gap-1.5">
          <span>{lastUsed}</span>
          {wasExecuted && (
            <span className="px-1 py-0.5 rounded bg-offivex-purple/15 text-offivex-purple-light text-[9px] uppercase tracking-wider">
              executed
            </span>
          )}
        </div>
      </div>
      <button
        onClick={() => onExecute(task)}
        disabled={isAnyPending}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
          isPending
            ? "bg-offivex-purple/30 text-white cursor-wait"
            : isAnyPending
              ? "bg-white/[0.04] text-gray-600 cursor-wait"
              : "bg-offivex-purple/20 text-offivex-purple-light hover:bg-offivex-purple/30"
        }`}
      >
        <Play className="w-3 h-3" />
        {isPending ? "Loading…" : "Execute"}
      </button>
      <button
        onClick={() => onAskDelete(task)}
        disabled={isAnyPending}
        className="p-1.5 rounded-md text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
        title="Delete template"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-offivex-bg-surface p-8 text-center">
      <div className="text-sm text-gray-300 mb-2">No templates yet.</div>
      <div className="text-xs text-gray-500 mb-4 max-w-md mx-auto">
        Open the Mint, Bundle, or Pump.fun page, configure your launch the
        way you want, then click <strong className="text-gray-300">Save as Task</strong>{" "}
        instead of (or in addition to) Launch Now. The template appears
        here, ready to fire on demand.
      </div>
      <div className="flex gap-2 justify-center flex-wrap">
        <a
          href="/mint"
          className="px-3 py-1.5 rounded-md bg-offivex-purple/15 hover:bg-offivex-purple/25 text-offivex-purple-light text-xs"
        >
          Open /mint
        </a>
        <a
          href="/bundle"
          className="px-3 py-1.5 rounded-md bg-offivex-purple/15 hover:bg-offivex-purple/25 text-offivex-purple-light text-xs"
        >
          Open /bundle
        </a>
        <a
          href="/pump-fun"
          className="px-3 py-1.5 rounded-md bg-offivex-purple/15 hover:bg-offivex-purple/25 text-offivex-purple-light text-xs"
        >
          Open /pump-fun
        </a>
      </div>
    </div>
  );
}

function taskSummary(task: TaskRow): string {
  const cb = task.config_blob;
  if (typeof cb.name === "string") return cb.name;
  if (typeof cb.token_name === "string") return cb.token_name;
  if (typeof cb.symbol === "string") return `$${cb.symbol}`;
  if (typeof cb.token_symbol === "string") return `$${cb.token_symbol}`;
  return `template ${task.id.slice(0, 8)}`;
}

function relativeAge(unixSec: number): string {
  const diffSec = Math.max(0, Math.round(Date.now() / 1000 - unixSec));
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`;
  if (diffSec < 86_400) return `${Math.round(diffSec / 3600)}h ago`;
  return `${Math.round(diffSec / 86_400)}d ago`;
}
