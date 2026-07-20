import { useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import dayjs from "dayjs";
import { ArrowDown, ArrowUp, Check, Copy, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useScrollAreaViewport } from "@/hooks/useScrollAreaViewport";
import { cn } from "@/lib/utils";
import type { GitBranch } from "@/types/git";
import { isBranchActive } from "@/utils/branchActivity";

const ROW_HEIGHT_PX = 30;
const VIRTUAL_OVERSCAN = 16;
/** 列：分支 / 跟踪 / 提交 / 时间 / 作者 / 状态 / 操作（复制+删除） */
const TABLE_COLS =
  "grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_72px_minmax(0,1fr)_minmax(0,1fr)_72px_64px]";

export type BranchManageSortDirection = "asc" | "desc";

interface BranchManageTableProps {
  branches: GitBranch[];
  sortDir: BranchManageSortDirection;
  onToggleSort: () => void;
  onCopyName: (branch: GitBranch) => void;
  onDelete: (branch: GitBranch) => void;
  /** 正在删除的分支名（禁用该行删除） */
  deletingName?: string | null;
}

/** 紧凑分支表格：虚拟滚动 + 可切换时间排序 */
export function BranchManageTable({
  branches,
  sortDir,
  onToggleSort,
  onCopyName,
  onDelete,
  deletingName = null,
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={cn(
          "border-border bg-muted/30 text-muted-foreground grid shrink-0 items-center gap-2 border-b px-3 py-1.5 text-[11px] font-medium",
          TABLE_COLS,
        )}
      >
        <span>{t("branchManage.columnBranch")}</span>
        <span>{t("branchManage.columnTracking")}</span>
        <span>{t("branchManage.columnCommit")}</span>
        <button
          type="button"
          className="hover:text-foreground inline-flex items-center gap-0.5 text-left transition-colors"
          aria-label={sortDir === "desc" ? t("branchManage.sortTimeDesc") : t("branchManage.sortTimeAsc")}
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
        <div
          className="relative w-full"
          style={{ height: `${virtualizer.getTotalSize()}px` }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const branch = branches[virtualItem.index];
            if (!branch) return null;
            // 与侧栏一致：仅本地且非当前分支可删
            const canDelete = !branch.isRemote && !branch.isCurrent;
            const deleteDisabled =
              !canDelete || deletingName === branch.name;
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
                  TABLE_COLS,
                )}
                style={{
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <BranchNameCell branch={branch} />
                <span
                  className="text-muted-foreground truncate font-mono text-[11px]"
                  title={branch.upstream ?? undefined}
                >
                  {branch.upstream?.trim() || t("branchManage.noTracking")}
                </span>
                <span className="text-muted-foreground truncate font-mono text-[11px]">
                  {branch.tipShortId.trim() || t("branchManage.noCommit")}
                </span>
                <span className="text-muted-foreground truncate text-[11px]">
                  {formatBranchTime(branch.tipAuthoredAt)}
                </span>
                <span className="text-muted-foreground truncate text-[11px]">
                  {branch.tipAuthorName.trim() || t("branchManage.noCommit")}
                </span>
                <BranchStatusCell branch={branch} />
                <div className="flex items-center justify-end gap-0.5">
                  <Tooltip delayDuration={300}>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground size-6 [&_svg]:size-3.5"
                        aria-label={t("branchManage.copyBranchName")}
                        onClick={() => onCopyName(branch)}
                      >
                        <Copy aria-hidden="true" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t("branchManage.copyBranchName")}</TooltipContent>
                  </Tooltip>
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

function BranchNameCell({ branch }: { branch: GitBranch }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {branch.isCurrent ? (
        <Check className="text-primary size-3 shrink-0" aria-hidden="true" />
      ) : (
        <span className="size-3 shrink-0" aria-hidden="true" />
      )}
      <span className="truncate font-mono" title={branch.name}>
        {branch.name}
      </span>
      {branch.isDefault ? (
        <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
          {t("branchManage.defaultBranch")}
        </Badge>
      ) : null}
      {branch.isCurrent ? (
        <span className="sr-only">{t("branchManage.currentBranch")}</span>
      ) : null}
    </div>
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
