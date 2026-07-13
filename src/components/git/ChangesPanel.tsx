import { ReactNode, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowDown,
  ArrowDownWideNarrow,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  List,
  ListTree,
  MoreVertical,
  Search,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TruncateStartPath } from "@/components/common/TruncateStartPath";
import { cn } from "@/lib/utils";

import { useRepoStore } from "@/store/useRepoStore";

import { gitService } from "@/services/git";

import { toUserMessage } from "@/types/error";
import { GitStatusEntry } from "@/types/git";
import { formatFileSize } from "@/utils/formatFileSize";
import {
  gitStatusLetterClass,
  normalizeGitStatusLetter,
} from "@/utils/gitStatusStyle";

/** 稳定空数组：避免 selector 每次返回新 [] 触发 useSyncExternalStore 无限重渲染 */
const EMPTY_ENTRIES: GitStatusEntry[] = [];

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

  return (
    <li>
      <div
        role="option"
        aria-selected={selected}
        tabIndex={0}
        className={cn(
          "group flex h-7 cursor-pointer items-center gap-1 rounded-md px-1.5 transition-colors",
          selected ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
        )}
        onClick={() => onSelect(entry.path, side)}
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
          path={
            entry.renamedFrom
              ? `${entry.renamedFrom} → ${entry.path}`
              : entry.path
          }
          title={
            entry.renamedFrom
              ? `${entry.renamedFrom} → ${entry.path}`
              : entry.path
          }
        />
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
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
  side: "index" | "worktree";
  selectedPath: string | null;
  onSelectEntry: (path: string, side: "index" | "worktree") => void;
  onToggleEntry: (path: string) => void;
  disabled: boolean;
  toggleLabelFor: (path: string) => string;
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
  side,
  selectedPath,
  onSelectEntry,
  onToggleEntry,
  disabled,
  toggleLabelFor,
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
          />
        ))}
      </ul>
    ) : null;

  return (
    <section className="border-border flex min-h-0 flex-1 flex-col overflow-hidden border-b last:border-b-0">
      <div className="flex h-7 shrink-0 items-center justify-between gap-1 px-1.5">
        <h3 className="text-muted-foreground min-w-0 truncate text-[11px] font-medium">
          {title}
        </h3>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 shrink-0 [&_svg]:size-3"
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

      <div className="min-h-0 flex-1 overflow-auto px-0.5 pb-1">
        {showDefaultGroup ? (
          <>
            <div className="hover:bg-accent/60 group flex h-7 items-center rounded-md">
              <button
                type="button"
                className="text-muted-foreground flex h-7 min-w-0 flex-1 cursor-pointer items-center gap-1 rounded-md px-1.5 text-left text-xs"
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
                    className="mr-0.5 size-6 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-0 group-hover:disabled:opacity-50 [&_svg]:size-3"
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
      </div>
    </section>
  );
}

/** 中栏：变更（含 Default）/ 待提交（扁平列表） */
export function ChangesPanel() {
  const { t } = useTranslation();
  const entries = useRepoStore((state) => state.status?.entries ?? EMPTY_ENTRIES);
  const loading = useRepoStore((state) => state.loading);
  const selectedChange = useRepoStore((state) => state.selectedChange);
  const selectChange = useRepoStore((state) => state.selectChange);
  const stage = useRepoStore((state) => state.stage);
  const unstage = useRepoStore((state) => state.unstage);
  const stageAll = useRepoStore((state) => state.stageAll);
  const unstageAll = useRepoStore((state) => state.unstageAll);

  const [view, setView] = useState<"list" | "tree">("list");
  const [unstagedGroupOpen, setUnstagedGroupOpen] = useState(true);
  const [mutating, setMutating] = useState(false);

  const unstagedEntries = entries.filter(isUnstagedEntry);
  const stagedEntries = entries.filter(isStagedEntry);
  const busy = loading || mutating;

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

  /** 树形视图尚未实现，点击时仅提示，不切换视图 */
  function handleTreeViewClick(): void {
    toast.message(t("repo.treeComingSoon"));
  }

  function handleSoon(action: string): void {
    toast.message(t("repo.syncComingSoon", { action }));
  }

  const groupLabel = t("repo.groupDefault");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-border relative flex h-10 shrink-0 items-center border-b px-2">
        {/* 左侧：排序 */}
        <div className="flex shrink-0 items-center">
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground size-7"
                aria-label={t("repo.historySort")}
                onClick={() => handleSoon(t("repo.historySort"))}
              >
                <ArrowDownWideNarrow className="size-3.5" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("repo.historySort")}</TooltipContent>
          </Tooltip>
        </div>

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
              "h-7 gap-1 px-2 text-xs transition-colors",
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
            className="text-muted-foreground h-7 gap-1 px-2 text-xs opacity-70"
            aria-disabled="true"
            onClick={handleTreeViewClick}
          >
            <ListTree className="size-3.5" aria-hidden="true" />
            {t("repo.viewTree")}
          </Button>
        </div>

        {/* 右侧：搜索 / 更多 */}
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground size-7"
                aria-label={t("repo.changesSearch")}
                onClick={() => handleSoon(t("repo.changesSearch"))}
              >
                <Search className="size-3.5" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("repo.changesSearch")}</TooltipContent>
          </Tooltip>
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground size-7"
                aria-label={t("repo.historyMore")}
                onClick={() => handleSoon(t("repo.historyMore"))}
              >
                <MoreVertical className="size-3.5" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("repo.historyMore")}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
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
          side="worktree"
          selectedPath={unstagedSelectedPath}
          onSelectEntry={(path, side) => selectChange({ path, side })}
          onToggleEntry={(path) => void handleStage(path)}
          disabled={busy}
          toggleLabelFor={(path) => t("repo.stageFile", { path })}
        />

        <ChangeGroup
          title={t("repo.stagedCount", { count: stagedEntries.length })}
          actionIcon={<ArrowUp aria-hidden="true" />}
          actionLabel={t("repo.unstageAll")}
          onAction={() => void handleUnstageAll()}
          actionDisabled={busy}
          entries={stagedEntries}
          side="index"
          selectedPath={stagedSelectedPath}
          onSelectEntry={(path, side) => selectChange({ path, side })}
          onToggleEntry={(path) => void handleUnstage(path)}
          disabled={busy}
          toggleLabelFor={(path) => t("repo.unstageFile", { path })}
        />
      </div>
    </div>
  );
}
