import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  ScrollText,
  X,
  XCircle,
} from "lucide-react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
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
    <span
      className={cn(
        "border-muted-foreground/40 size-3.5 animate-pulse rounded-full border-2 border-t-transparent",
        className,
      )}
      aria-hidden
    />
  );
}

function OpLogRow({ entry }: { entry: OpLogEntry }) {
  const { t } = useTranslation();
  const expanded = useOpLogStore((state) => state.expandedIds[entry.id] ?? false);
  const toggleExpanded = useOpLogStore((state) => state.toggleExpanded);
  const [hovered, setHovered] = useState(false);

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
      toast.success(t("opLog.copied"));
    } catch {
      toast.error(t("opLog.copyFailed"));
    }
  }

  return (
    <div className="border-border/60 border-b last:border-b-0">
      <div
        className="hover:bg-muted/60 flex cursor-pointer items-center gap-1.5 px-2 py-1.5 text-xs"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
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
        <span className="truncate font-medium">{t(labelKey(entry.label))}</span>
        {hovered ? (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground shrink-0 px-1 text-[11px]"
            onClick={(event) => {
              event.stopPropagation();
              void handleCopy();
            }}
          >
            <span className="inline-flex items-center gap-0.5">
              <Copy className="size-3" aria-hidden />
              {t("opLog.copy")}
            </span>
          </button>
        ) : null}
        <span className="min-w-0 flex-1" aria-hidden />
        <span className="text-muted-foreground shrink-0 tabular-nums">
          {formatDuration(entry.elapsedMs)}
        </span>
      </div>

      {expanded && entry.lines.length > 0 ? (
        <pre className="bg-muted/30 text-muted-foreground max-h-48 overflow-auto px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
          {entry.lines.map((line) => line.text).join("\n")}
        </pre>
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
  const setPanelOpen = useOpLogStore((state) => state.setPanelOpen);
  const byRepo = useOpLogStore((state) => state.byRepo);
  const repoPath = useRepoStore((state) => state.repoPath);

  const entries = useMemo(
    () => selectRepoEntries(byRepo, repoPath),
    [byRepo, repoPath],
  );
  const latest = selectLatestEntry(entries);

  if (!panelOpen) {
    return null;
  }

  return (
    <>
      {/* 遮罩只盖到状态栏上方，状态栏始终可点 */}
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
        aria-label={t("opLog.title")}
      >
        <div className="border-border flex h-8 shrink-0 items-center gap-2 border-b px-2">
          {latest ? <StatusIcon status={latest.status} /> : null}
          <span className="min-w-0 flex-1 truncate text-xs font-medium">
            {latest ? t(labelKey(latest.label)) : t("opLog.title")}
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

        <div className="min-h-0 flex-1 overflow-y-auto">
          {entries.length === 0 ? (
            <EmptyState
              compact
              className="h-full min-h-[10rem]"
              icon={<ScrollText />}
              title={t("opLog.emptyTitle")}
              description={t("opLog.emptyDescription")}
            />
          ) : (
            entries.map((entry) => <OpLogRow key={entry.id} entry={entry} />)
          )}
        </div>
      </div>
    </>
  );
}
