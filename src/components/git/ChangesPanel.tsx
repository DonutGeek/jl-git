import type { ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  FileDiff,
  Inbox,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { AppAlertDialogContent } from "@/components/common/AppDialogContent";
import { ButtonLoadingContent } from "@/components/common/ButtonLoadingContent";
import { EmptyState } from "@/components/common/EmptyState";
import { TruncateStartPath } from "@/components/common/TruncateStartPath";
import { ChangeFileContextMenu } from "@/components/git/ChangeFileContextMenu";
import { ChangeTreeFolderRow } from "@/components/git/ChangeTree";
import {
  ChangeGroupChrome,
  ChangesPanelChrome,
  type ChangeListGroupMode,
  type ChangeSortMode,
} from "@/components/git/ChangesPanelChrome";
import { DiffLineStats } from "@/components/git/DiffLineStats";
import { MaterialFileIcon } from "@/components/git/MaterialFileIcon";
import { RepoLoadingIndicator } from "@/components/layout/RepoLoadingIndicator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useScrollAreaViewport } from "@/hooks/useScrollAreaViewport";
import { cn } from "@/lib/utils";

import { useRepoStore } from "@/store/useRepoStore";

import { gitService } from "@/services/git";

import { toUserMessage } from "@/types/error";
import type { GitStatusEntry } from "@/types/git";
import {
  buildChangeTree,
  flattenChangeTreeRows,
  getChangeTreeFolderKeys,
  type ChangeTreeNode,
  type ChangeTreeVisibleRow,
} from "@/utils/changeTree";
import { filterChangeEntries } from "@/utils/filterChangeEntries";
import { formatFileSize } from "@/utils/formatFileSize";
import { getPathBasename } from "@/utils/getPathBasename";
import {
  isConflictEntry as isConflictChangeEntry,
  isStagedChangeEntry,
  isUnstagedChangeEntry,
} from "@/utils/gitConflict";
import { gitStatusLetterClass, normalizeGitStatusLetter } from "@/utils/gitStatusStyle";

/** 稳定空数组：避免 selector 每次返回新 [] 触发 useSyncExternalStore 无限重渲染 */
const EMPTY_ENTRIES: GitStatusEntry[] = [];
/** 变更行槽位高度：28px 内容 + 2px 上下间隙 */
const CHANGE_ROW_HEIGHT_PX = 30;
const CHANGE_VIRTUAL_OVERSCAN = 10;

/** 按增/改/删/重命名分类（与常见 Git 客户端一致） */
type ChangeStatusCategory = "conflict" | "added" | "modified" | "deleted" | "renamed";

/** 状态分类折叠集合的稳定空值 */
const EMPTY_STATUS_COLLAPSED: ReadonlySet<ChangeStatusCategory> = new Set();
/** 日期分组折叠集合的稳定空值 */
const EMPTY_DATE_COLLAPSED: ReadonlySet<string> = new Set();
/** 无 mtime 时的日期分组键 */
const UNKNOWN_MODIFIED_DATE_KEY = "__unknown__";

const CHANGE_STATUS_CATEGORY_ORDER: readonly ChangeStatusCategory[] = [
  "conflict",
  "added",
  "modified",
  "deleted",
  "renamed",
] as const;

type ChangeListVisibleRow =
  | { kind: "status-header"; category: ChangeStatusCategory; count: number; open: boolean }
  | { kind: "date-header"; dateKey: string; count: number; open: boolean }
  | { kind: "file"; entry: GitStatusEntry };

type ChangeVisibleRow = ChangeListVisibleRow | ChangeTreeVisibleRow;

function isConflictEntry(entry: GitStatusEntry): boolean {
  return isConflictChangeEntry(entry);
}

function classifyChangeStatus(
  entry: GitStatusEntry,
  side: "index" | "worktree",
): ChangeStatusCategory {
  if (isConflictEntry(entry)) {
    return "conflict";
  }
  const letter = side === "index" ? entry.indexStatus : entry.worktreeStatus;
  if (letter === "?" || letter === "A") {
    return "added";
  }
  if (letter === "D") {
    return "deleted";
  }
  if (letter === "R" || letter === "C") {
    return "renamed";
  }
  return "modified";
}

/** 列表：按冲突 / 新增 / 修改 / 删除 / 重命名分组（含 0 计数空组） */
function flattenChangeStatusGroupRows(
  entries: GitStatusEntry[],
  side: "index" | "worktree",
  collapsedCategories: ReadonlySet<ChangeStatusCategory>,
): ChangeListVisibleRow[] {
  const buckets: Record<ChangeStatusCategory, GitStatusEntry[]> = {
    conflict: [],
    added: [],
    modified: [],
    deleted: [],
    renamed: [],
  };
  for (const entry of entries) {
    buckets[classifyChangeStatus(entry, side)].push(entry);
  }

  const rows: ChangeListVisibleRow[] = [];
  for (const category of CHANGE_STATUS_CATEGORY_ORDER) {
    const groupEntries = buckets[category];
    const open = !collapsedCategories.has(category);
    rows.push({
      kind: "status-header",
      category,
      count: groupEntries.length,
      open,
    });
    if (open) {
      for (const entry of groupEntries) {
        rows.push({ kind: "file", entry });
      }
    }
  }
  return rows;
}

/** 本地日历日 YYYY-MM-DD；无 mtime 归入未知组 */
function changeModifiedDateKey(entry: GitStatusEntry): string {
  const ms = entry.modifiedAt;
  if (ms == null || !Number.isFinite(ms)) {
    return UNKNOWN_MODIFIED_DATE_KEY;
  }
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) {
    return UNKNOWN_MODIFIED_DATE_KEY;
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** 列表：按修改日期分组（新→旧；未知日期置底） */
function flattenChangeDateGroupRows(
  entries: GitStatusEntry[],
  collapsedDates: ReadonlySet<string>,
): ChangeListVisibleRow[] {
  const buckets = new Map<string, GitStatusEntry[]>();
  for (const entry of entries) {
    const key = changeModifiedDateKey(entry);
    const list = buckets.get(key);
    if (list) {
      list.push(entry);
    } else {
      buckets.set(key, [entry]);
    }
  }

  const dateKeys = [...buckets.keys()].sort((a, b) => {
    if (a === UNKNOWN_MODIFIED_DATE_KEY) {
      return 1;
    }
    if (b === UNKNOWN_MODIFIED_DATE_KEY) {
      return -1;
    }
    return b.localeCompare(a);
  });

  const rows: ChangeListVisibleRow[] = [];
  for (const dateKey of dateKeys) {
    const groupEntries = buckets.get(dateKey) ?? [];
    const open = !collapsedDates.has(dateKey);
    rows.push({
      kind: "date-header",
      dateKey,
      count: groupEntries.length,
      open,
    });
    if (open) {
      for (const entry of groupEntries) {
        rows.push({ kind: "file", entry });
      }
    }
  }
  return rows;
}

/** 已暂存：含默认待提交的冲突；demoted 冲突不算 */
function isStagedEntry(entry: GitStatusEntry, demotedConflictPaths: ReadonlySet<string>): boolean {
  return isStagedChangeEntry(entry, demotedConflictPaths);
}

/** 未暂存：含被放回变更的冲突 */
function isUnstagedEntry(
  entry: GitStatusEntry,
  demotedConflictPaths: ReadonlySet<string>,
): boolean {
  return isUnstagedChangeEntry(entry, demotedConflictPaths);
}

function entryLabel(entry: GitStatusEntry, side: "index" | "worktree"): string {
  const status = side === "index" ? entry.indexStatus : entry.worktreeStatus;
  return normalizeGitStatusLetter(status);
}

function sortChangeEntries(
  entries: GitStatusEntry[],
  mode: ChangeSortMode,
  side: "index" | "worktree",
): GitStatusEntry[] {
  if (mode === "default") {
    return entries;
  }

  return [...entries].sort((left, right) => {
    if (mode === "status") {
      const statusOrder = entryLabel(left, side).localeCompare(entryLabel(right, side));
      if (statusOrder !== 0) {
        return statusOrder;
      }
    }

    return left.path.localeCompare(right.path, undefined, { numeric: true, sensitivity: "base" });
  });
}

interface ChangeRowProps {
  entry: GitStatusEntry;
  side: "index" | "worktree";
  selected: boolean;
  onSelect: (path: string, side: "index" | "worktree") => void;
  onToggle: (path: string) => void;
  disabled: boolean;
  toggleLabel: string;
  /** 挂在 Default 下时缩进一级 */
  indented?: boolean;
  /** 树形视图中按层级缩进 */
  indentDepth?: number;
  /** 显示增加 / 减少行数 */
  showLineStats?: boolean;
  highlightQuery?: string;
}

function ChangeRow({
  entry,
  side,
  selected,
  onSelect,
  onToggle,
  disabled,
  toggleLabel,
  indented = false,
  indentDepth,
  showLineStats = false,
  highlightQuery = "",
}: ChangeRowProps) {
  const { t } = useTranslation();
  const label = entryLabel(entry, side);
  const conflictLocked = isConflictEntry(entry);
  const repoPath = useRepoStore((state) => state.repoPath);
  const [hovered, setHovered] = useState(false);
  const [sizeLabel, setSizeLabel] = useState<string | null>(null);
  const sizeRequestedRef = useRef(false);

  async function loadSize(): Promise<void> {
    if (sizeRequestedRef.current || !repoPath) {
      return;
    }
    sizeRequestedRef.current = true;
    try {
      const result = await gitService.getFileSize(repoPath, entry.path);
      if (result.size != null) {
        setSizeLabel(formatFileSize(result.size));
      }
    } catch {
      // 悬停展示失败时静默，允许下次再试
      sizeRequestedRef.current = false;
    }
  }

  const showSize = (hovered || selected) && sizeLabel != null;
  const additions = side === "index" ? entry.indexAdditions : entry.worktreeAdditions;
  const deletions = side === "index" ? entry.indexDeletions : entry.worktreeDeletions;
  const fullPath = entry.renamedFrom ? `${entry.renamedFrom} → ${entry.path}` : entry.path;
  // 树形视图已展示父目录，叶子节点仅保留文件名，避免重复路径撑破列表。
  const displayPath = indentDepth == null ? fullPath : (entry.path.split("/").pop() ?? entry.path);

  const row = (
    <div
      role="option"
      aria-selected={selected}
      tabIndex={0}
      className={cn(
        "group flex h-7 w-full min-w-0 cursor-pointer items-center gap-1 rounded-md px-2 transition-colors",
        // 选中用 ! 压过右键悬停高亮，避免右键当前行时被 /60 盖掉
        selected ? "!bg-accent text-accent-foreground" : "hover:bg-accent/60",
      )}
      style={indentDepth == null ? undefined : { paddingLeft: `${8 + indentDepth * 14}px` }}
      onClick={() => onSelect(entry.path, side)}
      onDoubleClick={() => {
        if (!disabled && !conflictLocked) {
          onToggle(entry.path);
        }
      }}
      onMouseEnter={() => {
        setHovered(true);
        void loadSize();
      }}
      onMouseLeave={() => {
        setHovered(false);
      }}
      onFocus={() => {
        void loadSize();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(entry.path, side);
        }
      }}
    >
      {indented ? <span className="size-3 shrink-0" aria-hidden="true" /> : null}
      <span
        className={cn(
          "w-3.5 shrink-0 text-center font-mono text-[11px] leading-none font-semibold",
          gitStatusLetterClass(side === "index" ? entry.indexStatus : entry.worktreeStatus, {
            conflict: isConflictEntry(entry),
          }),
        )}
        aria-hidden="true"
      >
        {label}
      </span>
      {isConflictEntry(entry) ? (
        <TriangleAlert className="text-destructive size-3.5 shrink-0" aria-hidden="true" />
      ) : null}
      <MaterialFileIcon name={entry.path} isDir={false} className="size-3.5 shrink-0" />
      <TruncateStartPath
        className="min-w-0 flex-1"
        path={displayPath}
        title={fullPath}
        highlightQuery={highlightQuery}
      />

      <div className="ml-auto flex shrink-0 items-center gap-0.5 pr-0.5">
        {showLineStats ? (
          <DiffLineStats additions={additions} deletions={deletions} className="ml-0" />
        ) : null}
        {showSize ? (
          <span className="text-muted-foreground px-0.5 font-mono text-[10px] tabular-nums">
            {sizeLabel}
          </span>
        ) : null}
        {/* 与原版相同：仅 hover/选中时出现。冲突时仍 disabled，但需盖掉 Button 默认 disabled:opacity-50，否则未 hover 也会露出 */}
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "size-6 shrink-0 focus-visible:opacity-100 [&_svg]:size-3",
                conflictLocked
                  ? cn(
                      "text-muted-foreground",
                      selected
                        ? "opacity-40 disabled:opacity-40"
                        : "opacity-0 disabled:opacity-0 group-hover:opacity-40 group-hover:disabled:opacity-40",
                    )
                  : [
                      "disabled:opacity-0 group-hover:disabled:opacity-50",
                      selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                    ],
              )}
              onClick={(event) => {
                event.stopPropagation();
                if (!conflictLocked) {
                  onToggle(entry.path);
                }
              }}
              disabled={disabled || conflictLocked}
              aria-label={conflictLocked ? t("repo.conflictStageLocked") : toggleLabel}
            >
              {side === "worktree" ? (
                <ArrowDown aria-hidden="true" />
              ) : (
                <ArrowUp aria-hidden="true" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">
            {conflictLocked ? t("repo.conflictStageLocked") : toggleLabel}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );

  if (!repoPath) {
    return row;
  }

  return (
    <ChangeFileContextMenu entry={entry} side={side} repoPath={repoPath} disabled={disabled}>
      {row}
    </ChangeFileContextMenu>
  );
}

interface ChangeGroupProps {
  ariaLabel: string;
  /** 按增/改/删/重命名分类（列表模式） */
  groupByStatus?: boolean;
  collapsedStatusCategories?: ReadonlySet<ChangeStatusCategory>;
  onToggleStatusCategory?: (category: ChangeStatusCategory) => void;
  statusCategoryLabel?: (category: ChangeStatusCategory, count: number) => string;
  /** 按修改日期分类（列表模式；与 status 互斥） */
  groupByDate?: boolean;
  collapsedDateKeys?: ReadonlySet<string>;
  onToggleDateKey?: (dateKey: string) => void;
  dateGroupLabel?: (dateKey: string, count: number) => string;
  entries: GitStatusEntry[];
  changeTree: ChangeTreeNode[];
  rootName: string;
  side: "index" | "worktree";
  selectedPath: string | null;
  onSelectEntry: (path: string, side: "index" | "worktree") => void;
  onToggleEntry: (path: string) => void;
  disabled: boolean;
  toggleLabelFor: (path: string) => string;
  emptyIcon: ReactNode;
  emptyTitle: string;
  emptyDescription?: string;
  view: "list" | "tree";
  expandedTreePaths: ReadonlySet<string>;
  onToggleTreeFolder: (key: string) => void;
  showLineStats?: boolean;
  highlightQuery?: string;
}

function changeRowKey(row: ChangeVisibleRow, index: number): string {
  switch (row.kind) {
    case "status-header":
      return `status:${row.category}`;
    case "date-header":
      return `date:${row.dateKey}`;
    case "root":
    case "directory":
      return row.key;
    case "file":
      return "key" in row ? row.key : `file:${row.entry.path}`;
    default:
      return String(index);
  }
}

/** 变更 / 待提交分区 */
function ChangeGroup({
  ariaLabel,
  groupByStatus = false,
  collapsedStatusCategories,
  onToggleStatusCategory,
  statusCategoryLabel,
  groupByDate = false,
  collapsedDateKeys,
  onToggleDateKey,
  dateGroupLabel,
  entries,
  changeTree,
  rootName,
  side,
  selectedPath,
  onSelectEntry,
  onToggleEntry,
  disabled,
  toggleLabelFor,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  view,
  expandedTreePaths,
  onToggleTreeFolder,
  showLineStats = false,
  highlightQuery = "",
}: ChangeGroupProps) {
  const isEmpty = entries.length === 0;
  const { viewport, bindScrollArea } = useScrollAreaViewport();
  const collapsed = collapsedStatusCategories ?? EMPTY_STATUS_COLLAPSED;
  const collapsedDates = collapsedDateKeys ?? EMPTY_DATE_COLLAPSED;

  const visibleRows = useMemo((): ChangeVisibleRow[] => {
    if (view === "tree") {
      return flattenChangeTreeRows(changeTree, rootName, side, expandedTreePaths);
    }
    if (groupByStatus) {
      if (isEmpty) {
        return [];
      }
      return flattenChangeStatusGroupRows(entries, side, collapsed);
    }
    if (groupByDate) {
      if (isEmpty) {
        return [];
      }
      return flattenChangeDateGroupRows(entries, collapsedDates);
    }
    return entries.map((entry) => ({ kind: "file" as const, entry }));
  }, [
    collapsed,
    collapsedDates,
    changeTree,
    entries,
    expandedTreePaths,
    groupByDate,
    groupByStatus,
    isEmpty,
    rootName,
    side,
    view,
  ]);

  const virtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => viewport,
    estimateSize: () => CHANGE_ROW_HEIGHT_PX,
    overscan: CHANGE_VIRTUAL_OVERSCAN,
    getItemKey: (index) => changeRowKey(visibleRows[index], index),
  });

  const showBareEmpty = view === "list" && isEmpty;

  function renderRow(row: ChangeVisibleRow): ReactNode {
    if (row.kind === "status-header") {
      return (
        <div className="hover:bg-accent/60 flex h-7 items-center rounded-md transition-colors">
          <button
            type="button"
            className="text-muted-foreground flex h-7 min-w-0 flex-1 cursor-pointer items-center gap-1 rounded-md px-2 text-left text-xs"
            onClick={() => onToggleStatusCategory?.(row.category)}
          >
            {row.open ? (
              <ChevronDown className="size-3 shrink-0" aria-hidden="true" />
            ) : (
              <ChevronRight className="size-3 shrink-0" aria-hidden="true" />
            )}
            <span className="truncate">
              {statusCategoryLabel?.(row.category, row.count) ?? `${row.category} (${row.count})`}
            </span>
          </button>
        </div>
      );
    }

    if (row.kind === "date-header") {
      return (
        <div className="hover:bg-accent/60 flex h-7 items-center rounded-md transition-colors">
          <button
            type="button"
            className="text-muted-foreground flex h-7 min-w-0 flex-1 cursor-pointer items-center gap-1 rounded-md px-2 text-left text-xs"
            onClick={() => onToggleDateKey?.(row.dateKey)}
          >
            {row.open ? (
              <ChevronDown className="size-3 shrink-0" aria-hidden="true" />
            ) : (
              <ChevronRight className="size-3 shrink-0" aria-hidden="true" />
            )}
            <span className="truncate">
              {dateGroupLabel?.(row.dateKey, row.count) ?? `${row.dateKey} (${row.count})`}
            </span>
          </button>
        </div>
      );
    }

    if (row.kind === "root" || row.kind === "directory") {
      return (
        <ChangeTreeFolderRow
          name={row.name}
          open={row.open}
          depth={row.kind === "directory" ? row.depth : undefined}
          onToggle={() => onToggleTreeFolder(row.key)}
          highlightQuery={highlightQuery}
        />
      );
    }

    return (
      <ChangeRow
        entry={row.entry}
        side={side}
        selected={selectedPath === row.entry.path}
        onSelect={onSelectEntry}
        onToggle={onToggleEntry}
        disabled={disabled}
        toggleLabel={toggleLabelFor(row.entry.path)}
        indented={view === "list" && (groupByStatus || groupByDate)}
        indentDepth={view === "tree" && "depth" in row ? row.depth : undefined}
        showLineStats={showLineStats}
        highlightQuery={highlightQuery}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-hidden">
        {/* 与分组标题统一 8px 外侧间隙，滚动条叠在右侧 padding */}
        <ScrollArea
          ref={bindScrollArea}
          className={cn(
            "h-full min-w-0 px-2 pb-1",
            "[&_[data-slot=scroll-area-viewport]>div]:!block [&_[data-slot=scroll-area-viewport]>div]:!min-w-0 [&_[data-slot=scroll-area-viewport]>div]:w-full",
            "[&_[data-slot=scroll-area-scrollbar][data-orientation=vertical]]:absolute [&_[data-slot=scroll-area-scrollbar][data-orientation=vertical]]:right-0.5",
          )}
        >
          {showBareEmpty ? (
            <EmptyState
              compact
              className="min-h-30 py-6"
              icon={emptyIcon}
              title={emptyTitle}
              description={emptyDescription}
            />
          ) : (
            <div
              className="relative w-full"
              style={{ height: `${virtualizer.getTotalSize()}px` }}
              role={view === "tree" ? "tree" : "listbox"}
              aria-label={ariaLabel}
            >
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const row = visibleRows[virtualItem.index];
                if (!row) {
                  return null;
                }
                return (
                  <div
                    key={virtualItem.key}
                    data-index={virtualItem.index}
                    className="absolute top-0 left-0 w-full py-px"
                    style={{
                      height: `${virtualItem.size}px`,
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    {renderRow(row)}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}

/** 中栏：变更 / 待提交 */
export function ChangesPanel() {
  const { t } = useTranslation();
  const status = useRepoStore((state) => state.status);
  const entries = status?.entries ?? EMPTY_ENTRIES;
  const repoPath = useRepoStore((state) => state.repoPath);
  const loading = useRepoStore((state) => state.loading);
  const selectedChange = useRepoStore((state) => state.selectedChange);
  const conflictCount = useRepoStore((state) => state.repoState?.conflictCount ?? 0);
  const demotedConflictPaths = useRepoStore((state) => state.demotedConflictPaths);
  const selectChange = useRepoStore((state) => state.selectChange);
  const stage = useRepoStore((state) => state.stage);
  const unstage = useRepoStore((state) => state.unstage);
  const stageAll = useRepoStore((state) => state.stageAll);
  const unstageAll = useRepoStore((state) => state.unstageAll);
  const discard = useRepoStore((state) => state.discard);

  const [view, setView] = useState<"list" | "tree">("list");
  const [sortMode, setSortMode] = useState<ChangeSortMode>("default");
  const [showLineStats, setShowLineStats] = useState(false);
  /** 列表分组：Default / 状态 / 日期（状态与日期互斥） */
  const [listGroupMode, setListGroupMode] = useState<ChangeListGroupMode>("default");
  const [collapsedStatusCategories, setCollapsedStatusCategories] = useState(
    () => new Set<ChangeStatusCategory>(),
  );
  const [collapsedDateKeys, setCollapsedDateKeys] = useState(() => new Set<string>());
  const [expandedTreePaths, setExpandedTreePaths] = useState<Set<string>>(() => new Set());
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mutating, setMutating] = useState(false);
  const [discardAllOpen, setDiscardAllOpen] = useState(false);

  const activeSearchQuery = searchOpen ? searchQuery : "";
  const demotedSet = useMemo(() => new Set(demotedConflictPaths), [demotedConflictPaths]);
  const unstagedEntries = useMemo(
    () =>
      sortChangeEntries(
        filterChangeEntries(
          entries.filter((entry) => isUnstagedEntry(entry, demotedSet)),
          activeSearchQuery,
        ),
        sortMode,
        "worktree",
      ),
    [activeSearchQuery, demotedSet, entries, sortMode],
  );
  const stagedEntries = useMemo(
    () =>
      sortChangeEntries(
        filterChangeEntries(
          entries.filter((entry) => isStagedEntry(entry, demotedSet)),
          activeSearchQuery,
        ),
        sortMode,
        "index",
      ),
    [activeSearchQuery, demotedSet, entries, sortMode],
  );
  const busy = loading || mutating;
  const hasConflict = entries.some(isConflictEntry);
  /** 仅在首屏/切仓尚未取得 status 时显示加载；干净仓推送不应覆盖为空加载态。 */
  const showGroupLoading = loading && status === null;
  const unstagedTree = useMemo(() => buildChangeTree(unstagedEntries), [unstagedEntries]);
  const stagedTree = useMemo(() => buildChangeTree(stagedEntries), [stagedEntries]);
  const treeFolderKeys = useMemo(
    () => [
      ...getChangeTreeFolderKeys(unstagedTree, "worktree"),
      ...getChangeTreeFolderKeys(stagedTree, "index"),
    ],
    [stagedTree, unstagedTree],
  );

  const unstagedSelectedPath = selectedChange?.side === "worktree" ? selectedChange.path : null;
  const stagedSelectedPath = selectedChange?.side === "index" ? selectedChange.path : null;

  async function runMutation(action: () => Promise<void>): Promise<void> {
    if (mutating) {
      return;
    }
    setMutating(true);
    try {
      await action();
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setMutating(false);
    }
  }

  async function handleStage(path: string): Promise<void> {
    await runMutation(() => stage([path]));
  }

  async function handleUnstage(path: string): Promise<void> {
    await runMutation(() => unstage([path]));
  }

  async function handleStageAll(): Promise<void> {
    await runMutation(() => stageAll());
  }

  async function handleUnstageAll(): Promise<void> {
    await runMutation(() => unstageAll());
  }

  async function handleDiscardAll(): Promise<void> {
    const paths = [...new Set(entries.map((entry) => entry.path))];
    if (paths.length === 0 || hasConflict) {
      return;
    }
    await runMutation(async () => {
      await discard(paths);
      toast.success(t("repo.discardAllSuccess", { count: paths.length }));
      setDiscardAllOpen(false);
    });
  }

  function showTreeView(): void {
    setSortMode("default");
    setView("tree");
    setExpandedTreePaths(new Set(treeFolderKeys));
  }

  function toggleTreeFolder(key: string): void {
    setExpandedTreePaths((previous) => {
      const next = new Set(previous);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function expandAllTrees(): void {
    setExpandedTreePaths(new Set(treeFolderKeys));
  }

  function collapseAllTrees(): void {
    setExpandedTreePaths(new Set());
  }

  function toggleStatusCategory(category: ChangeStatusCategory): void {
    setCollapsedStatusCategories((previous) => {
      const next = new Set(previous);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }

  function toggleDateKey(dateKey: string): void {
    setCollapsedDateKeys((previous) => {
      const next = new Set(previous);
      if (next.has(dateKey)) {
        next.delete(dateKey);
      } else {
        next.add(dateKey);
      }
      return next;
    });
  }

  function statusCategoryLabel(category: ChangeStatusCategory, count: number): string {
    const labels: Record<ChangeStatusCategory, string> = {
      conflict: t("repo.changesGroupConflict"),
      added: t("repo.changesGroupAdded"),
      modified: t("repo.changesGroupModified"),
      deleted: t("repo.changesGroupDeleted"),
      renamed: t("repo.changesGroupRenamed"),
    };
    return `${labels[category]} (${count})`;
  }

  function dateGroupLabel(dateKey: string, count: number): string {
    const label =
      dateKey === UNKNOWN_MODIFIED_DATE_KEY ? t("repo.changesGroupUnknownDate") : dateKey;
    return `${label} (${count})`;
  }

  function toggleSearch(): void {
    if (searchOpen) {
      setSearchOpen(false);
      setSearchQuery("");
      return;
    }
    setSearchOpen(true);
  }

  const rootName = getPathBasename(repoPath ?? "") || t("project.repoLabel");
  const listGroupByStatus = view === "list" && listGroupMode === "status";
  const listGroupByDate = view === "list" && listGroupMode === "date";
  return (
    <>
      <ChangesPanelChrome
        view={view}
        sortMode={sortMode}
        searchOpen={searchOpen}
        searchQuery={searchQuery}
        showLineStats={showLineStats}
        listGroupMode={listGroupMode}
        treeActionsDisabled={treeFolderKeys.length === 0}
        onViewChange={(nextView) => {
          if (nextView === "tree") {
            showTreeView();
            return;
          }
          setView("list");
        }}
        onSortModeChange={setSortMode}
        onExpandAll={expandAllTrees}
        onCollapseAll={collapseAllTrees}
        onToggleSearch={toggleSearch}
        onSearchQueryChange={setSearchQuery}
        onSearchEscape={() => {
          setSearchOpen(false);
          setSearchQuery("");
        }}
        onShowLineStatsChange={setShowLineStats}
        onListGroupModeChange={setListGroupMode}
        unstaged={
          <ChangeGroupChrome
            title={t("repo.changesCount", { count: unstagedEntries.length })}
            action={<ArrowDown aria-hidden="true" />}
            actionLabel={t("repo.stageAll")}
            onAction={() => void handleStageAll()}
            actionDisabled={busy || unstagedEntries.length === 0}
            contextMenu={
              <>
                <ContextMenuItem
                  disabled={busy || unstagedEntries.length === 0}
                  onSelect={() => void handleStageAll()}
                >
                  <ArrowDown aria-hidden="true" />
                  {t("repo.stageAll")}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  variant="destructive"
                  disabled={busy || entries.length === 0 || hasConflict}
                  onSelect={() => setDiscardAllOpen(true)}
                >
                  <RotateCcw aria-hidden="true" />
                  {t("repo.discardAllChanges")}
                </ContextMenuItem>
              </>
            }
          >
            {showGroupLoading ? (
              <RepoLoadingIndicator area="unstaged" label={t("common.loading")} />
            ) : (
              <ChangeGroup
                ariaLabel={t("repo.changesCount", { count: unstagedEntries.length })}
                groupByStatus={listGroupByStatus}
                collapsedStatusCategories={collapsedStatusCategories}
                onToggleStatusCategory={toggleStatusCategory}
                statusCategoryLabel={statusCategoryLabel}
                groupByDate={listGroupByDate}
                collapsedDateKeys={collapsedDateKeys}
                onToggleDateKey={toggleDateKey}
                dateGroupLabel={dateGroupLabel}
                entries={unstagedEntries}
                changeTree={unstagedTree}
                rootName={rootName}
                side="worktree"
                selectedPath={unstagedSelectedPath}
                onSelectEntry={(path, side) => {
                  // 再次点击当前项则取消选中
                  if (selectedChange?.path === path && selectedChange.side === side) {
                    selectChange(null);
                    return;
                  }
                  selectChange({ path, side });
                }}
                onToggleEntry={(path) => void handleStage(path)}
                disabled={busy}
                toggleLabelFor={(path) => t("repo.stageFile", { path })}
                emptyIcon={<FileDiff />}
                emptyTitle={t("repo.changesEmpty")}
                emptyDescription={t("repo.changesEmptyHint")}
                view={view}
                expandedTreePaths={expandedTreePaths}
                onToggleTreeFolder={toggleTreeFolder}
                showLineStats={showLineStats}
                highlightQuery={activeSearchQuery}
              />
            )}
          </ChangeGroupChrome>
        }
        staged={
          <ChangeGroupChrome
            title={t("repo.stagedCount", { count: stagedEntries.length })}
            titleSlot={
              conflictCount > 0 ? (
                <Badge
                  variant="outline"
                  role="status"
                  className="border-destructive/40 bg-destructive/10 text-destructive gap-1 rounded-md px-1.5 py-0 text-[11px] font-medium [&>svg]:size-3"
                >
                  <TriangleAlert aria-hidden="true" />
                  {t("repo.conflictBanner", { count: conflictCount })}
                </Badge>
              ) : undefined
            }
            action={<ArrowUp aria-hidden="true" />}
            actionLabel={t("repo.unstageAll")}
            onAction={() => void handleUnstageAll()}
            actionDisabled={
              busy ||
              stagedEntries.length === 0 ||
              stagedEntries.every((entry) => isConflictEntry(entry))
            }
            contextMenu={
              <ContextMenuItem
                disabled={
                  busy ||
                  stagedEntries.length === 0 ||
                  stagedEntries.every((entry) => isConflictEntry(entry))
                }
                onSelect={() => void handleUnstageAll()}
              >
                <ArrowUp aria-hidden="true" />
                {t("repo.unstageAll")}
              </ContextMenuItem>
            }
          >
            {showGroupLoading ? (
              <RepoLoadingIndicator area="staged" label={t("common.loading")} />
            ) : (
              <ChangeGroup
                ariaLabel={t("repo.stagedCount", { count: stagedEntries.length })}
                groupByStatus={listGroupByStatus}
                collapsedStatusCategories={collapsedStatusCategories}
                onToggleStatusCategory={toggleStatusCategory}
                statusCategoryLabel={statusCategoryLabel}
                groupByDate={listGroupByDate}
                collapsedDateKeys={collapsedDateKeys}
                onToggleDateKey={toggleDateKey}
                dateGroupLabel={dateGroupLabel}
                entries={stagedEntries}
                changeTree={stagedTree}
                rootName={rootName}
                side="index"
                selectedPath={stagedSelectedPath}
                onSelectEntry={(path, side) => {
                  if (selectedChange?.path === path && selectedChange.side === side) {
                    selectChange(null);
                    return;
                  }
                  selectChange({ path, side });
                }}
                onToggleEntry={(path) => void handleUnstage(path)}
                disabled={busy}
                toggleLabelFor={(path) => t("repo.unstageFile", { path })}
                emptyIcon={<Inbox />}
                emptyTitle={t("repo.stagedEmpty")}
                emptyDescription={t("repo.stagedEmptyHint")}
                view={view}
                expandedTreePaths={expandedTreePaths}
                onToggleTreeFolder={toggleTreeFolder}
                showLineStats={showLineStats}
                highlightQuery={activeSearchQuery}
              />
            )}
          </ChangeGroupChrome>
        }
      />

      <AlertDialog open={discardAllOpen} onOpenChange={setDiscardAllOpen}>
        <AppAlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("repo.discardAllChangesTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("repo.discardAllChangesDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy || entries.length === 0 || hasConflict}
              onClick={(event) => {
                event.preventDefault();
                void handleDiscardAll();
              }}
            >
              <ButtonLoadingContent loading={busy} loadingLabel={t("common.loading")}>
                {t("repo.discardAllChanges")}
              </ButtonLoadingContent>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AppAlertDialogContent>
      </AlertDialog>
    </>
  );
}
