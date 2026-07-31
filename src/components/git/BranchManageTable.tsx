import { useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import dayjs from "dayjs";
import { ArrowDown, ArrowUp, Check, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { TruncateStartHoverLabel } from "@/components/common/TruncateStartHoverLabel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useScrollAreaViewport } from "@/hooks/useScrollAreaViewport";
import { cn } from "@/lib/utils";
import type { GitBranch } from "@/types/git";
import { isBranchActive } from "@/utils/branchActivity";

const ROW_HEIGHT_PX = 30;
const VIRTUAL_OVERSCAN = 16;
/**
 * 列宽：分支略收、跟踪加宽（origin/… 更长）；提交/时间按内容定宽，作者有上限，避免空白全挤在分支列。
 * 本地含跟踪；远端无跟踪。
 */
const TABLE_COLS_WITH_TRACKING =
  "grid-cols-[minmax(0,1.1fr)_minmax(0,1.5fr)_5.5rem_8.5rem_minmax(0,6rem)_4rem_2.25rem]";
const TABLE_COLS_WITHOUT_TRACKING =
  "grid-cols-[minmax(0,1.4fr)_5.5rem_8.5rem_minmax(0,7rem)_4rem_2.25rem]";

export type BranchManageSortDirection = "asc" | "desc";

interface BranchManageTableProps {
  branches: GitBranch[];
  sortDir: BranchManageSortDirection;
  onToggleSort: () => void;
  onDelete: (branch: GitBranch) => void;
  /** 正在删除的分支名（禁用该行删除） */
  deletingName?: string | null;
  /** 是否显示跟踪列；远端列表应为 false */
  showTracking?: boolean;
  highlightQuery?: string;
}

/** 紧凑分支表格：虚拟滚动 + 可切换时间排序 */
export function BranchManageTable({
  branches,
  sortDir,
  onToggleSort,
  onDelete,
  deletingName = null,
  showTracking = true,
  highlightQuery = "",
}: BranchManageTableProps) {
  const { t } = useTranslation();
  const { viewport, bindScrollArea } = useScrollAreaViewport();
  const virtualizer = useVirtualizer({
    count: branches.length,
    getScrollElement: () => viewport,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: VIRTUAL_OVERSCAN,
    getItemKey: (index) => branches[index]?.name ?? index,
  });

  const SortIcon = sortDir === "desc" ? ArrowDown : ArrowUp;
  const tableCols = showTracking ? TABLE_COLS_WITH_TRACKING : TABLE_COLS_WITHOUT_TRACKING;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={cn(
          "border-border bg-muted/30 text-muted-foreground grid shrink-0 items-center gap-2 border-b px-3 py-1.5 text-[11px] font-medium",
          tableCols,
        )}
      >
        <span>{t("branchManage.columnBranch")}</span>
        {showTracking ? <span>{t("branchManage.columnTracking")}</span> : null}
        <span>{t("branchManage.columnCommit")}</span>
        <button
          type="button"
          className="hover:text-foreground inline-flex items-center gap-0.5 text-left transition-colors"
          aria-label={
            sortDir === "desc" ? t("branchManage.sortTimeDesc") : t("branchManage.sortTimeAsc")
          }
          onClick={onToggleSort}
        >
          {t("branchManage.columnTime")}
          <SortIcon className="size-3 shrink-0" aria-hidden="true" />
        </button>
        <span>{t("branchManage.columnAuthor")}</span>
        <span>{t("branchManage.columnStatus")}</span>
        <span className="text-right">{t("branchManage.columnActions")}</span>
      </div>

      <ScrollArea ref={bindScrollArea} className="min-h-0 flex-1">
        <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const branch = branches[virtualItem.index];
            if (!branch) return null;
            // 与侧栏一致：仅本地且非当前分支可删
            const canDelete = !branch.isRemote && !branch.isCurrent;
            const deleteDisabled = !canDelete || deletingName === branch.name;
            const deleteHint = branch.isCurrent
              ? t("branchManage.deleteCurrentDisabled")
              : branch.isRemote
                ? t("branchManage.deleteRemoteDisabled")
                : t("repo.deleteBranch");
            return (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                className={cn(
                  "border-border/60 absolute top-0 left-0 grid w-full items-center gap-2 border-b px-3 text-xs",
                  tableCols,
                )}
                style={{
                  // 用 top 而非 translateY：后者会让行内 Tooltip/浮层锚点算到列表顶部（错位）
                  height: `${virtualItem.size}px`,
                  top: `${virtualItem.start}px`,
                }}
              >
                <BranchNameCell branch={branch} highlightQuery={highlightQuery} />
                {showTracking ? (
                  <TrackingCell
                    upstream={branch.upstream}
                    emptyLabel={t("branchManage.noTracking")}
                    highlightQuery={highlightQuery}
                  />
                ) : null}
                <span className="text-muted-foreground truncate font-mono text-[11px]">
                  {branch.tipShortId.trim() || t("branchManage.noCommit")}
                </span>
                <span className="text-muted-foreground truncate text-[11px] tabular-nums">
                  {formatBranchTime(branch.tipAuthoredAt)}
                </span>
                <span className="truncate text-[11px]">
                  {branch.tipAuthorName.trim() || (
                    <span className="text-muted-foreground">{t("branchManage.noCommit")}</span>
                  )}
                </span>
                <BranchStatusCell branch={branch} />
                <div className="flex items-center justify-end">
                  <Tooltip delayDuration={300}>
                    <TooltipTrigger asChild>
                      {/* disabled 按钮外包一层，保证悬停仍能出 Tooltip */}
                      <span className="inline-flex">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive size-6 [&_svg]:size-3.5"
                          aria-label={deleteHint}
                          disabled={deleteDisabled}
                          onClick={() => onDelete(branch)}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{deleteHint}</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

/** 跟踪：前省略，悬停 Tooltip 展开全文 */
function TrackingCell({
  upstream,
  emptyLabel,
  highlightQuery = "",
}: {
  upstream: string | null | undefined;
  emptyLabel: string;
  highlightQuery?: string;
}) {
  const value = upstream?.trim() ?? "";
  if (!value) {
    return (
      <span className="text-muted-foreground block min-w-0 truncate font-mono text-[11px]">
        {emptyLabel}
      </span>
    );
  }

  return <TruncateStartHoverLabel text={value} highlightQuery={highlightQuery} />;
}

function BranchNameCell({
  branch,
  highlightQuery = "",
}: {
  branch: GitBranch;
  highlightQuery?: string;
}) {
  const { t } = useTranslation();
  return (
    <TruncateStartHoverLabel
      text={branch.name}
      highlightQuery={highlightQuery}
      textClassName="text-foreground"
      leading={
        branch.isCurrent ? (
          <Check className="text-primary size-3 shrink-0" aria-hidden="true" />
        ) : (
          <span className="size-3 shrink-0" aria-hidden="true" />
        )
      }
      trailing={
        <>
          {branch.isDefault ? (
            <Badge variant="secondary" className="h-4 shrink-0 px-1.5 text-[10px]">
              {t("branchManage.defaultBranch")}
            </Badge>
          ) : null}
          {branch.isCurrent ? (
            <span className="sr-only">{t("branchManage.currentBranch")}</span>
          ) : null}
        </>
      }
    />
  );
}

function BranchStatusCell({ branch }: { branch: GitBranch }) {
  const { t } = useTranslation();
  const status = useMemo(() => {
    const authoredAt = branch.tipAuthoredAt.trim();
    if (!authoredAt || !dayjs(authoredAt).isValid()) {
      return "unknown" as const;
    }
    return isBranchActive(authoredAt) ? ("active" as const) : ("inactive" as const);
  }, [branch.tipAuthoredAt]);

  const label =
    status === "active"
      ? t("branchManage.statusActive")
      : status === "inactive"
        ? t("branchManage.statusInactive")
        : t("branchManage.statusUnknown");

  return (
    <Badge
      variant={status === "active" ? "default" : "outline"}
      className={cn(
        "h-4 px-1.5 text-[10px]",
        status === "inactive" && "text-muted-foreground",
        status === "unknown" && "text-muted-foreground",
      )}
    >
      {label}
    </Badge>
  );
}

function formatBranchTime(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "—";
  }
  const parsed = dayjs(trimmed);
  if (!parsed.isValid()) {
    return "—";
  }
  return parsed.format("YYYY-MM-DD HH:mm");
}
