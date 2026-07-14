import { ReactNode, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowDown,
  ArrowDownWideNarrow,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  FileDiff,
  Inbox,
  List,
  ListTree,
  MoreVertical,
  RotateCw,
  Search,
} from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { ChangeTree, getChangeTreeFolderKeys } from "@/components/git/ChangeTree";
import { DiffLineStats } from "@/components/git/DiffLineStats";
import { TruncateStartPath } from "@/components/common/TruncateStartPath";
import { SplitPane } from "@/components/layout/SplitPane";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { useRepoStore } from "@/store/useRepoStore";

import { gitService } from "@/services/git";

import { toUserMessage } from "@/types/error";
import { GitStatusEntry } from "@/types/git";
import { formatFileSize } from "@/utils/formatFileSize";
import { getPathBasename } from "@/utils/getPathBasename";
import {
  gitStatusLetterClass,
  normalizeGitStatusLetter,
} from "@/utils/gitStatusStyle";

/** 稳定空数组：避免 selector 每次返回新 [] 触发 useSyncExternalStore 无限重渲染 */
const EMPTY_ENTRIES: GitStatusEntry[] = [];

type ChangeSortMode = "default" | "status" | "name";

/** 已暂存：index 侧存在实际变更（非 "." 且非未跟踪的 "?"） */
function isStagedEntry(entry: GitStatusEntry): boolean {
  return entry.indexStatus !== "." && entry.indexStatus !== "?";
}

/** 未暂存：worktree 侧为未跟踪（"?"）或存在实际变更（非 "."） */
function isUnstagedEntry(entry: GitStatusEntry): boolean {
  return entry.worktreeStatus === "?" || entry.worktreeStatus !== ".";
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
}: ChangeRowProps) {
  const label = entryLabel(entry, side);
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
  const fullPath = entry.renamedFrom
    ? `${entry.renamedFrom} → ${entry.path}`
    : entry.path;
  // 树形视图已展示父目录，叶子节点仅保留文件名，避免重复路径撑破列表。
  const displayPath =
    indentDepth == null
      ? fullPath
      : (entry.path.split("/").pop() ?? entry.path);

  return (
    <li>
      <div
        role="option"
        aria-selected={selected}
        tabIndex={0}
        className={cn(
          "group flex h-7 w-full min-w-0 cursor-pointer items-center gap-1 rounded-md px-2 transition-colors",
          selected ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
        )}
        style={
          indentDepth == null
            ? undefined
            : { paddingLeft: `${8 + indentDepth * 14}px` }
        }
        onClick={() => onSelect(entry.path, side)}
        onDoubleClick={() => {
          if (!disabled) {
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
            gitStatusLetterClass(label),
          )}
          aria-hidden="true"
        >
          {label}
        </span>
        <TruncateStartPath
          className="min-w-0 flex-1"
          path={displayPath}
          title={fullPath}
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
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  "size-6 shrink-0 focus-visible:opacity-100 disabled:opacity-0 group-hover:disabled:opacity-50 [&_svg]:size-3",
                  selected
                    ? "opacity-100"
                    : "opacity-0 group-hover:opacity-100",
                )}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggle(entry.path);
                }}
                disabled={disabled}
                aria-label={toggleLabel}
              >
                {side === "worktree" ? (
                  <ArrowDown aria-hidden="true" />
                ) : (
                  <ArrowUp aria-hidden="true" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">{toggleLabel}</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </li>
  );
}

interface ChangeGroupProps {
  title: string;
  actionIcon: ReactNode;
  actionLabel: string;
  onAction: () => void;
  actionDisabled: boolean;
  /** 仅「变更」区展示 Default 级联分组 */
  showDefaultGroup?: boolean;
  groupOpen?: boolean;
  onToggleGroup?: () => void;
  groupLabel?: string;
  entries: GitStatusEntry[];
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
}

/** 变更 / 待提交分区；变更区有 Default，待提交为扁平列表 */
function ChangeGroup({
  title,
  actionIcon,
  actionLabel,
  onAction,
  actionDisabled,
  showDefaultGroup = false,
  groupOpen = true,
  onToggleGroup,
  groupLabel,
  entries,
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
}: ChangeGroupProps) {
  const isEmpty = entries.length === 0;

  const fileList =
    !isEmpty && (!showDefaultGroup || groupOpen) ? (
      <ul className="flex flex-col" role="listbox" aria-label={title}>
        {entries.map((entry) => (
          <ChangeRow
            key={`${side}-${entry.path}`}
            entry={entry}
            side={side}
            selected={selectedPath === entry.path}
            onSelect={onSelectEntry}
            onToggle={onToggleEntry}
            disabled={disabled}
            toggleLabel={toggleLabelFor(entry.path)}
            indented={showDefaultGroup}
            showLineStats={showLineStats}
          />
        ))}
      </ul>
    ) : null;

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* 分区标题：悬停高亮，操作按钮悬停才显 */}
      <div className="group/header hover:bg-accent/60 flex h-7 shrink-0 items-center justify-between gap-1 rounded-md px-2 transition-colors">
        <h3 className="text-muted-foreground min-w-0 truncate text-[11px] font-medium">
          {title}
        </h3>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "size-6 shrink-0 [&_svg]:size-3",
                "opacity-0 transition-opacity",
                "group-hover/header:opacity-100 focus-visible:opacity-100",
                "disabled:opacity-0 group-hover/header:disabled:opacity-40",
              )}
              onClick={onAction}
              disabled={actionDisabled || isEmpty}
              aria-label={actionLabel}
            >
              {actionIcon}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">{actionLabel}</TooltipContent>
        </Tooltip>
      </div>

      <div className="min-h-0 flex-1">
        {/* 右侧为滚动条预留槽位，避免盖住行尾暂存按钮 */}
        <ScrollArea className="h-full pb-1 pl-1.5 [&_[data-slot=scroll-area-viewport]>div]:!block [&_[data-slot=scroll-area-viewport]>div]:pr-3 [&_[data-slot=scroll-area-scrollbar][data-orientation=vertical]]:right-0.5">
          {view === "tree" ? (
            <ChangeTree
              entries={entries}
              rootName={rootName}
              side={side}
              expandedPaths={expandedTreePaths}
              onToggleFolder={onToggleTreeFolder}
              renderEntry={(entry, depth) => (
                <ChangeRow
                  key={`${side}-${entry.path}`}
                  entry={entry}
                  side={side}
                  selected={selectedPath === entry.path}
                  onSelect={onSelectEntry}
                  onToggle={onToggleEntry}
                  disabled={disabled}
                  toggleLabel={toggleLabelFor(entry.path)}
                  indentDepth={depth}
                  showLineStats={showLineStats}
                />
              )}
            />
          ) : isEmpty ? (
            <EmptyState
              compact
              className="min-h-30 py-6"
              icon={emptyIcon}
              title={emptyTitle}
              description={emptyDescription}
            />
          ) : showDefaultGroup ? (
            <>
              <div className="hover:bg-accent/60 group flex h-7 items-center rounded-md transition-colors">
                <button
                  type="button"
                  className="text-muted-foreground flex h-7 min-w-0 flex-1 cursor-pointer items-center gap-1 rounded-md px-2 text-left text-xs"
                  onClick={onToggleGroup}
                >
                  {groupOpen ? (
                    <ChevronDown className="size-3 shrink-0" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="size-3 shrink-0" aria-hidden="true" />
                  )}
                  <span className="truncate">{groupLabel}</span>
                </button>
                <Tooltip delayDuration={300}>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="mr-0.5 size-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-0 group-hover:disabled:opacity-50 [&_svg]:size-3"
                      onClick={onAction}
                      disabled={actionDisabled || isEmpty}
                      aria-label={actionLabel}
                    >
                      <ArrowDown aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left">{actionLabel}</TooltipContent>
                </Tooltip>
              </div>
              {fileList}
            </>
          ) : (
            fileList
          )}
        </ScrollArea>
      </div>
    </section>
  );
}

/** 中栏：变更（含 Default）/ 待提交（扁平列表） */
export function ChangesPanel() {
  const { t } = useTranslation();
  const entries = useRepoStore((state) => state.status?.entries ?? EMPTY_ENTRIES);
  const repoPath = useRepoStore((state) => state.repoPath);
  const loading = useRepoStore((state) => state.loading);
  const selectedChange = useRepoStore((state) => state.selectedChange);
  const refreshStatus = useRepoStore((state) => state.refreshStatus);
  const selectChange = useRepoStore((state) => state.selectChange);
  const stage = useRepoStore((state) => state.stage);
  const unstage = useRepoStore((state) => state.unstage);
  const stageAll = useRepoStore((state) => state.stageAll);
  const unstageAll = useRepoStore((state) => state.unstageAll);

  const [view, setView] = useState<"list" | "tree">("list");
  const [sortMode, setSortMode] = useState<ChangeSortMode>("default");
  const [showLineStats, setShowLineStats] = useState(false);
  const [unstagedGroupOpen, setUnstagedGroupOpen] = useState(true);
  const [expandedTreePaths, setExpandedTreePaths] = useState<Set<string>>(() => new Set());
  const [mutating, setMutating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const unstagedEntries = useMemo(
    () => sortChangeEntries(entries.filter(isUnstagedEntry), sortMode, "worktree"),
    [entries, sortMode],
  );
  const stagedEntries = useMemo(
    () => sortChangeEntries(entries.filter(isStagedEntry), sortMode, "index"),
    [entries, sortMode],
  );
  const busy = loading || mutating;
  const treeFolderKeys = useMemo(
    () => [
      ...getChangeTreeFolderKeys(unstagedEntries, "worktree"),
      ...getChangeTreeFolderKeys(stagedEntries, "index"),
    ],
    [stagedEntries, unstagedEntries],
  );

  const unstagedSelectedPath =
    selectedChange?.side === "worktree" ? selectedChange.path : null;
  const stagedSelectedPath =
    selectedChange?.side === "index" ? selectedChange.path : null;

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

  async function handleRefresh(): Promise<void> {
    if (refreshing) {
      return;
    }

    setRefreshing(true);
    try {
      await refreshStatus();
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setRefreshing(false);
    }
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

  function handleSoon(action: string): void {
    toast.message(t("repo.syncComingSoon", { action }));
  }

  const groupLabel = t("repo.groupDefault");
  const rootName = getPathBasename(repoPath ?? "") || t("project.repoLabel");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-border relative flex h-8 shrink-0 items-center border-b px-2">
        {/* 左侧：排序 */}
        {view === "list" ? (
          <DropdownMenu>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "size-6",
                      sortMode === "default"
                        ? "text-muted-foreground"
                        : "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
                    )}
                    aria-label={t("repo.changesSort")}
                  >
                    <ArrowDownWideNarrow className="size-3.5" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>{t("repo.changesSort")}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="start" className="w-36">
              {([
                ["default", t("repo.changesSortDefault")],
                ["status", t("repo.changesSortStatus")],
                ["name", t("repo.changesSortName")],
              ] as const).map(([mode, label]) => (
                <DropdownMenuItem key={mode} onSelect={() => setSortMode(mode)}>
                  <span className="flex-1">{label}</span>
                  {sortMode === mode ? <Check className="size-3.5" aria-hidden="true" /> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        {/* 中间：列表 / 树形居中，略缩小 */}
        <div
          className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-0.5"
          role="group"
          aria-label={t("repo.changesViewMode")}
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "h-6 gap-1 px-2 text-xs transition-colors",
              view === "list"
                ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                : "text-muted-foreground",
            )}
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            <List className="size-3.5" aria-hidden="true" />
            {t("repo.viewList")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "h-6 gap-1 px-2 text-xs transition-colors",
              view === "tree"
                ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                : "text-muted-foreground",
            )}
            aria-pressed={view === "tree"}
            onClick={showTreeView}
          >
            <ListTree className="size-3.5" aria-hidden="true" />
            {t("repo.viewTree")}
          </Button>
        </div>

        {/* 右侧：树形展开控制 / 搜索 / 更多 */}
        <div
          className={cn(
            "ml-auto flex shrink-0 items-center gap-0.5",
            view === "tree" && "-translate-x-1",
          )}
        >
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground size-6"
                aria-label={t("repo.refreshChanges")}
                onClick={() => void handleRefresh()}
                disabled={refreshing}
              >
                <RotateCw
                  className={cn("size-3.5", refreshing && "animate-spin")}
                  aria-hidden="true"
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("repo.refreshChanges")}</TooltipContent>
          </Tooltip>
          {view === "tree" ? (
            <>
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground size-6"
                    aria-label={t("repo.expandAll")}
                    onClick={expandAllTrees}
                    disabled={treeFolderKeys.length === 0}
                  >
                    <ChevronsUpDown className="size-3.5" aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("repo.expandAll")}</TooltipContent>
              </Tooltip>
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground size-6"
                    aria-label={t("repo.collapseAll")}
                    onClick={collapseAllTrees}
                    disabled={treeFolderKeys.length === 0}
                  >
                    <ChevronsDownUp className="size-3.5" aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("repo.collapseAll")}</TooltipContent>
              </Tooltip>
            </>
          ) : null}
          {view === "list" ? (
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground size-6"
                  aria-label={t("repo.changesSearch")}
                  onClick={() => handleSoon(t("repo.changesSearch"))}
                >
                  <Search className="size-3.5" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("repo.changesSearch")}</TooltipContent>
            </Tooltip>
          ) : null}
          <DropdownMenu>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground size-6 data-[state=open]:bg-accent"
                    aria-label={t("repo.historyMore")}
                  >
                    <MoreVertical className="size-3.5" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>{t("repo.historyMore")}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="min-w-[11rem]">
              <DropdownMenuCheckboxItem
                checked={showLineStats}
                onCheckedChange={(checked) => setShowLineStats(checked === true)}
              >
                {t("repo.commitShowLineStats")}
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <SplitPane
          orientation="vertical"
          defaultRatio={55}
          minFirstPx={120}
          minSecondPx={120}
          storageKey="jlgit:split:changes-staged"
          first={
            <ChangeGroup
              title={t("repo.changesCount", { count: unstagedEntries.length })}
              actionIcon={<ArrowDown aria-hidden="true" />}
              actionLabel={t("repo.stageAll")}
              onAction={() => void handleStageAll()}
              actionDisabled={busy}
              showDefaultGroup
              groupOpen={unstagedGroupOpen}
              onToggleGroup={() => setUnstagedGroupOpen((prev) => !prev)}
              groupLabel={groupLabel}
              entries={unstagedEntries}
              rootName={rootName}
              side="worktree"
              selectedPath={unstagedSelectedPath}
              onSelectEntry={(path, side) => {
                // 再次点击当前项则取消选中
                if (
                  selectedChange?.path === path &&
                  selectedChange.side === side
                ) {
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
            />
          }
          second={
            <ChangeGroup
              title={t("repo.stagedCount", { count: stagedEntries.length })}
              actionIcon={<ArrowUp aria-hidden="true" />}
              actionLabel={t("repo.unstageAll")}
              onAction={() => void handleUnstageAll()}
              actionDisabled={busy}
              entries={stagedEntries}
              rootName={rootName}
              side="index"
              selectedPath={stagedSelectedPath}
              onSelectEntry={(path, side) => {
                if (
                  selectedChange?.path === path &&
                  selectedChange.side === side
                ) {
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
            />
          }
        />
      </div>
    </div>
  );
}
