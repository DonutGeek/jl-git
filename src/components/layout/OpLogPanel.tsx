import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Loader2,
  ScrollText,
  X,
  XCircle,
} from "lucide-react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import {
  selectLatestEntry,
  selectRepoEntries,
  useOpLogStore,
  type OpLogEntry,
  type OpLogLabel,
} from "@/store/useOpLogStore";
import { useRepoStore } from "@/store/useRepoStore";

/** 与 StatusBar h-7 对齐，面板停在其上方 */
const STATUS_BAR_OFFSET = "1.75rem";

function labelKey(label: OpLogLabel): string {
  if (label === "commit") return "opLog.labelCommit";
  if (label === "fetch") return "opLog.labelFetch";
  if (label === "pull") return "opLog.labelPull";
  if (label === "push") return "opLog.labelPush";
  if (label === "undo") return "opLog.labelUndo";
  if (label === "checkout") return "opLog.labelCheckout";
  if (label === "createBranch") return "opLog.labelCreateBranch";
  if (label === "publish") return "opLog.labelPublish";
  if (label === "deleteBranch") return "opLog.labelDeleteBranch";
  if (label === "renameBranch") return "opLog.labelRenameBranch";
  if (label === "merge") return "opLog.labelMerge";
  return "opLog.labelUnknown";
}

function formatDuration(ms: number | undefined): string {
  if (ms == null) return "";
  return `${(ms / 1000).toFixed(3)}s`;
}

function StatusIcon({ status, className }: { status: OpLogEntry["status"]; className?: string }) {
  if (status === "success") {
    return <CheckCircle2 className={cn("text-primary size-4", className)} aria-hidden />;
  }
  if (status === "error") {
    return <XCircle className={cn("text-destructive size-4", className)} aria-hidden />;
  }
  return (
    <Loader2
      className={cn("text-muted-foreground size-4 animate-spin", className)}
      aria-hidden
    />
  );
}

function OpLogRow({ entry }: { entry: OpLogEntry }) {
  const { t } = useTranslation();
  const expanded = useOpLogStore((state) => state.expandedIds[entry.id] ?? false);
  const toggleExpanded = useOpLogStore((state) => state.toggleExpanded);
  const detailScrollRef = useRef<HTMLDivElement>(null);

  // 展开且有新行时滚到底（ScrollArea viewport）
  useEffect(() => {
    if (!expanded || !detailScrollRef.current) {
      return;
    }
    const viewport = detailScrollRef.current.querySelector(
      "[data-radix-scroll-area-viewport]",
    );
    if (viewport instanceof HTMLElement) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [expanded, entry.lines.length, entry.activeCmd, entry.status]);

  async function handleCopy(): Promise<void> {
    const text = [
      `${t(labelKey(entry.label))} · ${entry.status}`,
      ...entry.lines.map((line) => line.text),
      entry.error ? `ERROR: ${entry.error}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await writeText(text);
    } catch {
      toast.error(t("opLog.copyFailed"));
      return;
    }
    toast.success(t("opLog.copied"));
  }

  const detailText = entry.lines.map((line) => line.text).join("\n");
  const hasDetail = detailText.length > 0 || Boolean(entry.error);

  return (
    <div className="border-border/60 border-b last:border-b-0">
      <div
        className="hover:bg-muted/60 group flex cursor-pointer items-center gap-1.5 px-2 py-1.5 text-xs"
        onClick={() => toggleExpanded(entry.id)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggleExpanded(entry.id);
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
        ) : (
          <ChevronRight className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
        )}
        <StatusIcon status={entry.status} className="shrink-0" />
        <span className="shrink-0 font-medium">{t(labelKey(entry.label))}</span>
        {/* 紧贴标题；悬停高亮 */}
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground hover:bg-accent ml-1 inline-flex shrink-0 cursor-pointer items-center gap-0.5 rounded-sm px-1 py-0.5 text-[11px] opacity-60 transition-colors group-hover:opacity-100 hover:opacity-100"
          aria-label={t("opLog.copy")}
          onClick={(event) => {
            event.stopPropagation();
            void handleCopy();
          }}
        >
          <Copy className="size-3" aria-hidden />
          {t("opLog.copy")}
        </button>
        {entry.status === "running" && entry.activeCmd ? (
          <span
            className="text-muted-foreground min-w-0 flex-1 truncate font-mono text-[11px]"
            title={entry.activeCmd}
          >
            {entry.activeCmd}
          </span>
        ) : (
          <span className="min-w-0 flex-1" aria-hidden />
        )}
        <span className="text-muted-foreground shrink-0 tabular-nums">
          {entry.status === "running"
            ? t("opLog.running")
            : formatDuration(entry.elapsedMs)}
        </span>
      </div>

      {expanded && hasDetail ? (
        <ScrollArea
          ref={detailScrollRef}
          type="always"
          className="bg-muted/30 max-h-56"
        >
          <pre className="text-muted-foreground px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
            {detailText}
            {entry.error && !detailText.includes(entry.error) ? (
              <>
                {detailText ? "\n" : null}
                <span className="text-destructive">ERROR: {entry.error}</span>
              </>
            ) : null}
            {entry.status === "running" ? (
              <span className="text-foreground/80 mt-1 block animate-pulse">
                {t("opLog.runningHint")}
              </span>
            ) : null}
          </pre>
        </ScrollArea>
      ) : null}
    </div>
  );
}

/**
 * 底部操作日志：fixed 覆盖主区，不进 flex 流。
 * 关闭时完全卸载，避免 Sheet portal 残留挡住状态栏。
 */
export function OpLogPanel() {
  const { t } = useTranslation();
  const panelOpen = useOpLogStore((state) => state.panelOpen);
  const pendingReveal = useOpLogStore((state) => state.pendingReveal);
  const setPanelOpen = useOpLogStore((state) => state.setPanelOpen);
  const byRepo = useOpLogStore((state) => state.byRepo);
  const repoPath = useRepoStore((state) => state.repoPath);
  const listScrollRef = useRef<HTMLDivElement>(null);

  const entries = useMemo(
    () => selectRepoEntries(byRepo, repoPath),
    [byRepo, repoPath],
  );
  const latest = selectLatestEntry(entries);
  const isRunning = latest?.status === "running" || pendingReveal;

  // 最新在底部：列表变化时滚到底
  useEffect(() => {
    if (!panelOpen || !listScrollRef.current) {
      return;
    }
    const viewport = listScrollRef.current.querySelector(
      "[data-radix-scroll-area-viewport]",
    );
    if (viewport instanceof HTMLElement) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [panelOpen, entries.length, latest?.id, latest?.status, latest?.lines.length]);

  if (!panelOpen) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        className="fixed inset-x-0 top-0 z-40 bg-black/20"
        style={{ bottom: STATUS_BAR_OFFSET }}
        aria-label={t("opLog.close")}
        onClick={() => setPanelOpen(false)}
      />

      <div
        className="border-border bg-background animate-in slide-in-from-bottom-2 fade-in-0 fixed inset-x-0 z-50 flex h-[min(40vh,20rem)] flex-col border-t duration-200"
        style={{ bottom: STATUS_BAR_OFFSET }}
        role="dialog"
        aria-modal="true"
        aria-busy={isRunning}
        aria-label={t("opLog.title")}
      >
        {/* 标题区不展示 loading；进度只在子日志行内体现 */}
        <div className="border-border flex h-8 shrink-0 items-center gap-2 border-b px-2">
          <ScrollText className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-xs font-medium">
            {t("opLog.title")}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6"
            aria-label={t("opLog.close")}
            onClick={() => setPanelOpen(false)}
          >
            <X className="size-3.5" aria-hidden />
          </Button>
        </div>

        <div className="min-h-0 flex-1">
          <ScrollArea ref={listScrollRef} className="h-full">
            {entries.length === 0 ? (
              <EmptyState
                compact
                className="h-full min-h-[10rem]"
                icon={
                  pendingReveal ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <ScrollText />
                  )
                }
                title={
                  pendingReveal ? t("opLog.preparingTitle") : t("opLog.emptyTitle")
                }
                description={
                  pendingReveal
                    ? t("opLog.preparingDescription")
                    : t("opLog.emptyDescription")
                }
              />
            ) : (
              entries.map((entry) => <OpLogRow key={entry.id} entry={entry} />)
            )}
          </ScrollArea>
        </div>
      </div>
    </>
  );
}
