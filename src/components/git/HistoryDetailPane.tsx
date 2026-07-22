import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import {
  Camera,
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  EllipsisVertical,
  FileDiff,
  GitCommitHorizontal,
  List,
  ListTree,
  Search,
  User,
} from "lucide-react";
import { toast } from "sonner";

import { CommitFileTree, getCommitFileTreeFolderPaths } from "@/components/git/CommitFileTree";
import { DiffLineStats } from "@/components/git/DiffLineStats";
import { CopyableGitRefTag } from "@/components/git/GitRefTag";
import { MaterialFileIcon } from "@/components/git/MaterialFileIcon";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { GitChangedFile, GitCommitParentDiff, GitCommitSummary } from "@/types/git";
import { copyToClipboard } from "@/utils/clipboard";
import { getPathBasename } from "@/utils/getPathBasename";
import { gitStatusLetterClass } from "@/utils/gitStatusStyle";

/** 提交「显示大小」：对齐参考端，如 394.2KB（KB 及以上保留 1 位小数） */
function formatChangeSizeBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "0B";
  }
  if (bytes < 1024) {
    return `${bytes}B`;
  }
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)}${units[unitIndex]}`;
}

function summarizeFiles(files: GitChangedFile[]): {
  total: number;
  added: number;
  modified: number;
  deleted: number;
} {
  let added = 0;
  let modified = 0;
  let deleted = 0;
  for (const file of files) {
    if (file.status === "A") {
      added += 1;
    } else if (file.status === "D") {
      deleted += 1;
    } else {
      modified += 1;
    }
  }
  return { total: files.length, added, modified, deleted };
}

/** 文件统计：省略为 0 的项，避免「0 新增」与行数 +N 并排造成误解 */
function formatFileStatsParts(
  t: (key: string, options?: Record<string, number>) => string,
  summary: { total: number; added: number; modified: number; deleted: number },
): string {
  const parts = [t("repo.commitStatTotal", { count: summary.total })];
  if (summary.added > 0) {
    parts.push(t("repo.commitStatAdded", { count: summary.added }));
  }
  if (summary.modified > 0) {
    parts.push(t("repo.commitStatModified", { count: summary.modified }));
  }
  if (summary.deleted > 0) {
    parts.push(t("repo.commitStatDeleted", { count: summary.deleted }));
  }
  return parts.join(" · ");
}

/**
 * 列表摆放：优先按状态（与变更面板 / 参考端一致）
 * A → M/T → D → R/C → 无状态；同状态再按路径
 */
function changedFileSortRank(status: string): number {
  const letter = status.trim().charAt(0).toUpperCase();
  switch (letter) {
    case "A":
      return 0;
    case "M":
    case "T":
      return 1;
    case "D":
      return 2;
    case "R":
    case "C":
      return 3;
    default:
      return 9;
  }
}

function compareChangedFiles(a: GitChangedFile, b: GitChangedFile): number {
  const rank = changedFileSortRank(a.status) - changedFileSortRank(b.status);
  if (rank !== 0) {
    return rank;
  }
  return a.path.localeCompare(b.path);
}

function sortChangedFiles(files: GitChangedFile[]): GitChangedFile[] {
  return [...files].sort(compareChangedFiles);
}

/** 详情顶栏短 hash：固定 7 位（%h 会随 core.abbrev 变长） */
const COMMIT_DETAIL_HASH_LEN = 7;

type CommitFilesView = "list" | "tree";

/** 顶栏「全部展开 / 全部折叠」广播到各 parent 文件区 */
interface TreeExpandSignal {
  type: "all" | "none";
  nonce: number;
}

interface CommitFilesToolbarProps {
  view: CommitFilesView;
  showAllFiles: boolean;
  allFilesLoading: boolean;
  showLineStats: boolean;
  /** 任一区域仍有可展开目录时启用「全部展开」 */
  canExpandTree: boolean;
  onShowList: () => void;
  onShowTree: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onToggleShowAllFiles: () => void;
  onShowLineStatsChange: (checked: boolean) => void;
}

/** 列表/树形等控件：合并提交时只渲染一份，同时控制所有 parent 区域 */
function CommitFilesToolbar({
  view,
  showAllFiles,
  allFilesLoading,
  showLineStats,
  canExpandTree,
  onShowList,
  onShowTree,
  onExpandAll,
  onCollapseAll,
  onToggleShowAllFiles,
  onShowLineStatsChange,
}: CommitFilesToolbarProps) {
  const { t } = useTranslation();

  return (
    <div className="flex shrink-0 items-center gap-1 px-2 py-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          "h-6 gap-1 px-1.5 text-xs transition-colors",
          showAllFiles && "disabled:pointer-events-auto",
          view === "list" && !showAllFiles
            ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
            : "text-muted-foreground",
        )}
        aria-pressed={view === "list" && !showAllFiles}
        disabled={showAllFiles}
        onClick={onShowList}
      >
        <List className="size-3.5" aria-hidden="true" />
        {t("repo.viewList")}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          "h-6 gap-1 px-1.5 text-xs transition-colors",
          view === "tree"
            ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
            : "text-muted-foreground",
        )}
        aria-pressed={view === "tree"}
        onClick={onShowTree}
      >
        <ListTree className="size-3.5" aria-hidden="true" />
        {t("repo.viewTree")}
      </Button>

      <div className="ml-auto flex items-center gap-0.5">
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
                  onClick={onExpandAll}
                  disabled={!canExpandTree}
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
                  onClick={onCollapseAll}
                  disabled={!canExpandTree}
                >
                  <ChevronsDownUp className="size-3.5" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("repo.collapseAll")}</TooltipContent>
            </Tooltip>
          </>
        ) : null}
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "size-6",
                showAllFiles
                  ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                  : "text-muted-foreground",
              )}
              aria-label={
                showAllFiles ? t("repo.commitShowChangedFiles") : t("repo.commitShowAllFiles")
              }
              aria-pressed={showAllFiles}
              disabled={allFilesLoading}
              onClick={onToggleShowAllFiles}
            >
              {allFilesLoading ? (
                <Spinner className="size-3.5" />
              ) : (
                <Camera className="size-3.5" aria-hidden="true" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {showAllFiles ? t("repo.commitShowChangedFiles") : t("repo.commitShowAllFiles")}
          </TooltipContent>
        </Tooltip>
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
                  <EllipsisVertical className="size-3.5" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>{t("repo.historyMore")}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="min-w-[11rem]">
            <DropdownMenuCheckboxItem
              checked={showLineStats}
              onCheckedChange={(checked) => onShowLineStatsChange(checked === true)}
            >
              {t("repo.commitShowLineStats")}
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

interface ParentDiffSectionProps {
  diff: GitCommitParentDiff;
  index: number;
  parentCount: number;
  rootName: string;
  commitId: string;
  view: CommitFilesView;
  showAllFiles: boolean;
  allFiles: GitChangedFile[] | null;
  allFilesLoading: boolean;
  /** ls-tree 是否因硬顶截断 */
  allFilesTruncated: boolean;
  showLineStats: boolean;
  treeExpandSignal: TreeExpandSignal | null;
  /** 向父级汇报本区树是否仍有可展开目录 */
  onTreeExpandabilityChange: (sectionKey: string, canExpand: boolean) => void;
}

function ParentDiffSection({
  diff,
  index,
  parentCount,
  rootName,
  commitId,
  view,
  showAllFiles,
  allFiles,
  allFilesLoading,
  allFilesTruncated,
  showLineStats,
  treeExpandSignal,
  onTreeExpandabilityChange,
}: ParentDiffSectionProps) {
  const { t } = useTranslation();
  const selectedCommitFile = useRepoStore((state) => state.selectedCommitFile);
  const selectCommitFile = useRepoStore((state) => state.selectCommitFile);
  const [filter, setFilter] = useState("");
  const [expandedTreePaths, setExpandedTreePaths] = useState<Set<string>>(new Set());
  const sectionKey = diff.parentId || `root-${index}`;

  // 切换提交时清空本区筛选与展开态
  useEffect(() => {
    setFilter("");
    setExpandedTreePaths(new Set());
  }, [commitId]);

  /** 改动路径 → 完整改动信息，用于全量树中凸显状态与行数 */
  const changedFileByPath = useMemo(() => {
    const map = new Map<string, GitChangedFile>();
    for (const file of diff.files) {
      map.set(file.path, file);
    }
    return map;
  }, [diff.files]);

  const sourceFiles = useMemo(() => {
    if (!showAllFiles) {
      // 始终按状态优先排序，避免缓存/树序导致 A 沉底
      return sortChangedFiles(diff.files);
    }
    const treePaths = allFiles ?? [];
    const seen = new Set<string>();
    const merged: GitChangedFile[] = treePaths.map((file) => {
      seen.add(file.path);
      const changed = changedFileByPath.get(file.path);
      return {
        path: file.path,
        status: changed?.status ?? "",
        additions: changed?.additions,
        deletions: changed?.deletions,
      };
    });
    // 已删除文件不在 ls-tree 结果中，需补回才能显示 D
    for (const file of diff.files) {
      if (!seen.has(file.path)) {
        merged.push(file);
      }
    }
    return sortChangedFiles(merged);
  }, [showAllFiles, allFiles, diff.files, changedFileByPath]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) {
      return sourceFiles;
    }
    // 筛选后仍保持状态优先顺序
    return sortChangedFiles(
      sourceFiles.filter((file) => file.path.toLowerCase().includes(q)),
    );
  }, [sourceFiles, filter]);

  const treeFolderPaths = useMemo(() => getCommitFileTreeFolderPaths(visible), [visible]);

  // 切到树形 / 显示全量 / 全量树加载完成时，默认展开
  useEffect(() => {
    if (view !== "tree") {
      return;
    }
    setExpandedTreePaths(new Set(getCommitFileTreeFolderPaths(sourceFiles)));
    // 仅跟视图模式与数据源切换，避免筛选变化时打乱用户折叠
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sourceFiles 随 showAllFiles/allFiles/commit 变
  }, [view, showAllFiles, commitId, allFiles]);

  // 顶栏「全部展开 / 全部折叠」（只响应信号，不跟 filter 重跑）
  useEffect(() => {
    if (!treeExpandSignal || view !== "tree") {
      return;
    }
    if (treeExpandSignal.type === "all") {
      setExpandedTreePaths(new Set(treeFolderPaths));
    } else {
      setExpandedTreePaths(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅 nonce 触发
  }, [treeExpandSignal]);

  useEffect(() => {
    onTreeExpandabilityChange(sectionKey, view === "tree" && treeFolderPaths.length > 0);
    return () => onTreeExpandabilityChange(sectionKey, false);
  }, [sectionKey, view, treeFolderPaths.length, onTreeExpandabilityChange]);

  /** 仅有实际改动状态的文件可点击；再点已选中项则关闭对比弹层 */
  function handleFileClick(file: GitChangedFile): void {
    if (!file.status) {
      return;
    }
    if (
      selectedCommitFile?.commitId === commitId &&
      selectedCommitFile.parentId === diff.parentId &&
      selectedCommitFile.path === file.path
    ) {
      selectCommitFile(null);
      return;
    }
    selectCommitFile({
      commitId,
      parentId: diff.parentId,
      path: file.path,
      status: file.status,
    });
  }

  function isFileSelected(file: GitChangedFile): boolean {
    return (
      selectedCommitFile?.commitId === commitId &&
      selectedCommitFile?.parentId === diff.parentId &&
      selectedCommitFile?.path === file.path
    );
  }

  function toggleTreeFolder(path: string): void {
    setExpandedTreePaths((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  const isMultiParent = parentCount > 1 && Boolean(diff.parentShortId);
  const sectionSummary = useMemo(() => summarizeFiles(diff.files), [diff.files]);

  // 「与 parentN 的差异」只做搜索框 placeholder，不占标题行（避免窄列截成「与 pa...」）
  const placeholder = showAllFiles
    ? t("repo.commitAllFilesFilter")
    : isMultiParent && diff.parentShortId
      ? t("repo.commitDiffWithParent", {
          index: index + 1,
          hash: diff.parentShortId,
        })
      : t("repo.commitChangedFiles");

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {/* 多 parent：标题行只留文件数统计，不含合计 +/- */}
      {isMultiParent ? (
        <div
          className={cn(
            "text-muted-foreground flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-[11px] leading-none",
            index > 0 && "border-border border-t",
          )}
        >
          <FileDiff className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="shrink-0 tabular-nums">
            {formatFileStatsParts(t, sectionSummary)}
          </span>
        </div>
      ) : null}

      <div className="shrink-0 px-2 pb-1.5 pt-1">
        <div className="relative">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
            aria-hidden="true"
          />
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder={placeholder}
            className="h-7 pl-8 text-xs shadow-none"
            aria-label={placeholder}
          />
        </div>
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <ScrollArea className="h-full w-full min-w-0 px-2 [&_[data-slot=scroll-area-viewport]>div]:!block [&_[data-slot=scroll-area-viewport]>div]:!min-w-0 [&_[data-slot=scroll-area-viewport]>div]:w-full">
          <div className="min-w-0 pb-1">
            {!showAllFiles && diff.truncated ? (
              <p className="text-muted-foreground px-0.5 py-1 text-[11px]">
                {t("repo.commitChangedFilesTruncated", { count: diff.files.length })}
              </p>
            ) : null}
            {showAllFiles && allFilesTruncated ? (
              <p className="text-muted-foreground px-0.5 py-1 text-[11px]">
                {t("repo.commitTreeTruncated", { count: allFiles?.length ?? 0 })}
              </p>
            ) : null}
            {allFilesLoading ? (
              <div className="text-muted-foreground flex items-center gap-2 px-0.5 py-3 text-xs">
                <Spinner className="size-3.5" />
                {t("common.loading")}
              </div>
            ) : visible.length === 0 ? (
              <p className="text-muted-foreground px-0.5 py-2 text-xs">
                {showAllFiles
                  ? t("repo.commitFilesEmpty")
                  : diff.files.length === 0
                    ? t("repo.commitNoChanges")
                    : t("repo.commitFilesEmpty")}
              </p>
            ) : view === "tree" ? (
              <CommitFileTree
                files={visible}
                rootName={rootName}
                expandedPaths={expandedTreePaths}
                onToggleFolder={toggleTreeFolder}
                showStatus
                showLineStats={showLineStats}
                onFileClick={handleFileClick}
                selectedPath={
                  selectedCommitFile?.commitId === commitId &&
                  selectedCommitFile?.parentId === diff.parentId
                    ? selectedCommitFile.path
                    : null
                }
              />
            ) : (
              <ul className="w-full min-w-0">
                {visible.map((file) => {
                  const clickable = Boolean(file.status);
                  const selected = isFileSelected(file);
                  return (
                    <li key={`${diff.parentId}:${file.path}`} className="min-w-0">
                      <div
                        data-commit-file-row={clickable ? "" : undefined}
                        className={cn(
                          "flex h-7 w-full min-w-0 items-center gap-1.5 overflow-hidden rounded-md px-1.5 transition-colors duration-150",
                          clickable ? "cursor-pointer hover:bg-accent/60" : "cursor-default",
                          selected && "bg-primary/10 hover:bg-primary/15",
                        )}
                        onClick={clickable ? () => handleFileClick(file) : undefined}
                      >
                        <span
                          className={cn(
                            "w-3.5 shrink-0 text-center font-mono text-[11px] leading-none font-semibold",
                            gitStatusLetterClass(file.status),
                          )}
                          aria-label={file.status}
                        >
                          {file.status}
                        </span>
                        <MaterialFileIcon name={file.path} isDir={false} className="size-3.5" />
                        <TruncateStartPath path={file.path} className="min-w-0 flex-1 font-mono" />
                        {showLineStats ? (
                          <DiffLineStats additions={file.additions} deletions={file.deletions} />
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </ScrollArea>
      </div>
    </section>
  );
}

/** 历史主区右侧：选中提交后展示元数据与改动文件 */
export function HistoryDetailPane() {
  const { t } = useTranslation();
  const selectedCommitId = useRepoStore((state) => state.selectedCommitId);
  const repoPath = useRepoStore((state) => state.repoPath);
  const detail = useRepoStore((state) => state.selectedCommitDetail);
  const detailLoading = useRepoStore((state) => state.detailLoading);
  const commits = useRepoStore((state) => state.commits);
  const [hashCopied, setHashCopied] = useState(false);
  const [messageCopied, setMessageCopied] = useState(false);
  const [messagePreviewOpen, setMessagePreviewOpen] = useState(false);
  /** 点击「显示分支」后展示；切换提交时复位 */
  const [containingBranches, setContainingBranches] = useState<string[] | null>(null);
  const [branchesLoading, setBranchesLoading] = useState(false);
  /** 点击「显示大小」后展示；切换提交时复位 */
  const [changeSize, setChangeSize] = useState<{ fileCount: number; totalBytes: number } | null>(
    null,
  );
  const [sizeLoading, setSizeLoading] = useState(false);

  /** 文件区共享控件：一份工具栏控制所有 parent 列表/树 */
  const [filesView, setFilesView] = useState<CommitFilesView>("list");
  const [showAllFiles, setShowAllFiles] = useState(false);
  const [allFiles, setAllFiles] = useState<GitChangedFile[] | null>(null);
  const [allFilesTruncated, setAllFilesTruncated] = useState(false);
  const [allFilesLoading, setAllFilesLoading] = useState(false);
  const [showLineStats, setShowLineStats] = useState(false);
  const [treeExpandSignal, setTreeExpandSignal] = useState<TreeExpandSignal | null>(null);
  const [treeExpandableBySection, setTreeExpandableBySection] = useState<Record<string, boolean>>(
    {},
  );

  const summary: GitCommitSummary | null = useMemo(() => {
    if (!selectedCommitId) {
      return null;
    }
    return commits.find((commit) => commit.id === selectedCommitId) ?? null;
  }, [commits, selectedCommitId]);

  const refs = summary?.refs ?? [];
  const rootName = getPathBasename(repoPath ?? "") || t("project.repoLabel");

  // 切换选中提交时恢复「显示分支 / 显示大小」按钮，并重置文件区共享控件
  useEffect(() => {
    setContainingBranches(null);
    setChangeSize(null);
    setBranchesLoading(false);
    setSizeLoading(false);
    setMessagePreviewOpen(false);
    setMessageCopied(false);
    setFilesView("list");
    setShowAllFiles(false);
    setAllFiles(null);
    setAllFilesTruncated(false);
    setAllFilesLoading(false);
    setShowLineStats(false);
    setTreeExpandSignal(null);
    setTreeExpandableBySection({});
  }, [selectedCommitId]);

  const canExpandTree = useMemo(
    () => Object.values(treeExpandableBySection).some(Boolean),
    [treeExpandableBySection],
  );

  const handleTreeExpandabilityChange = useCallback((sectionKey: string, canExpand: boolean) => {
    setTreeExpandableBySection((current) => {
      if (current[sectionKey] === canExpand) {
        return current;
      }
      return { ...current, [sectionKey]: canExpand };
    });
  }, []);

  async function enableShowAllFiles(): Promise<void> {
    if (!repoPath || !selectedCommitId) {
      toast.error(t("repo.commitDetailLoadFailed"));
      return;
    }
    setShowAllFiles(true);
    setFilesView("tree");

    if (allFiles != null) {
      return;
    }

    setAllFilesLoading(true);
    try {
      const result = await gitService.listTree(repoPath, selectedCommitId);
      setAllFiles(result.paths.map((path) => ({ path, status: "" })));
      setAllFilesTruncated(result.truncated);
    } catch (error) {
      setShowAllFiles(false);
      setAllFilesTruncated(false);
      toast.error(toUserMessage(error));
    } finally {
      setAllFilesLoading(false);
    }
  }

  function handleToggleShowAllFiles(): void {
    if (showAllFiles) {
      setShowAllFiles(false);
      setFilesView("list");
      return;
    }
    void enableShowAllFiles();
  }

  if (!selectedCommitId) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 px-6 text-center">
        <GitCommitHorizontal className="text-muted-foreground size-10 opacity-50" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-sm font-medium">{t("repo.commitDetailTitle")}</p>
          <p className="text-muted-foreground max-w-sm text-xs">{t("repo.commitDetailHint")}</p>
        </div>
      </div>
    );
  }

  if (detailLoading && !detail) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-sm">
        <Spinner className="size-4" />
        {t("common.loading")}
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex h-full items-center justify-center px-4">
        <p className="text-destructive text-sm" role="alert">
          {t("repo.commitDetailLoadFailed")}
        </p>
      </div>
    );
  }

  const parentLabel = detail.parentShortIds.length
    ? detail.parentShortIds.join(", ")
    : t("repo.commitNoParent");

  // 仅展示有实际改动的 parent 差异；无变更的不渲染文件区（列表内再按状态排序）
  const changedDiffs = detail.diffs
    .map((diff, index) => ({ diff, index }))
    .filter(({ diff }) => diff.files.length > 0);

  // 顶栏统计对齐 git show / 参考客户端：只用第一父提交（勿把各 parent 文件相加）
  const firstSummary = summarizeFiles(detail.diffs[0]?.files ?? []);
  const displayShortId = detail.id.slice(0, COMMIT_DETAIL_HASH_LEN) || detail.shortId.slice(0, COMMIT_DETAIL_HASH_LEN);
  const fullCommitId = detail.id;
  const commitMessage = [detail.subject, detail.body].filter(Boolean).join("\n\n");

  async function copyCommitHash(): Promise<void> {
    try {
      await copyToClipboard(fullCommitId);
      setHashCopied(true);
      window.setTimeout(() => setHashCopied(false), 1500);
    } catch (error) {
      toast.error(toUserMessage(error) || t("repo.copyFailed"));
    }
  }

  async function copyCommitMessage(): Promise<void> {
    try {
      await copyToClipboard(commitMessage);
      setMessageCopied(true);
      window.setTimeout(() => setMessageCopied(false), 1500);
    } catch (error) {
      toast.error(toUserMessage(error) || t("repo.copyFailed"));
    }
  }

  async function loadContainingBranches(): Promise<void> {
    if (!repoPath || branchesLoading || containingBranches != null) {
      return;
    }
    setBranchesLoading(true);
    try {
      const result = await gitService.getContainingBranches(repoPath, fullCommitId);
      setContainingBranches(result.branches);
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setBranchesLoading(false);
    }
  }

  async function loadChangeSize(): Promise<void> {
    if (!repoPath || sizeLoading || changeSize != null) {
      return;
    }
    setSizeLoading(true);
    try {
      const result = await gitService.getCommitChangeSize(repoPath, fullCommitId);
      setChangeSize({
        fileCount: result.fileCount,
        totalBytes: result.totalBytes,
      });
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setSizeLoading(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      {/* 顶栏：仅 hash 可点复制；悬停手型 + 下划线，与列表 CopyableHash 一致 */}
      <header className="border-border flex h-11 shrink-0 items-center justify-center border-b px-3">
        <p className="text-foreground flex max-w-full items-baseline gap-0 text-sm leading-none">
          <span className="shrink-0">{t("repo.commitLabelPrefix")}</span>
          <Tooltip open={hashCopied ? true : undefined} delayDuration={200}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="text-foreground cursor-pointer border-0 border-b border-transparent bg-transparent p-0 pb-px font-mono text-sm leading-none hover:border-current"
                aria-label={t("repo.copy")}
                onClick={() => {
                  void copyCommitHash();
                }}
              >
                {displayShortId}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {hashCopied ? t("repo.copySuccess") : t("repo.copy")}
            </TooltipContent>
          </Tooltip>
        </p>
      </header>

      {/* 元信息区固定；外层不滚动 */}
      <div className="border-border min-w-0 shrink-0 space-y-2 overflow-x-hidden border-b px-3 py-2.5">
        <div className="min-w-0 w-full">
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              {/* 滚动区与可点击区分离：button 内无法可靠滚动；点文案打开预览 */}
              <div className="border-border bg-muted/30 hover:bg-accent/50 w-full max-w-full min-w-0 overflow-hidden rounded-md border transition-colors">
                <ScrollArea
                  className={cn(
                    // 有正文时定高，保证 Viewport 可滚；仅标题则随内容收缩
                    detail.body ? "h-28" : "max-h-28",
                    "w-full min-w-0",
                    "[&_[data-slot=scroll-area-viewport]>div]:!block [&_[data-slot=scroll-area-viewport]>div]:!min-w-0 [&_[data-slot=scroll-area-viewport]>div]:w-full",
                    "[&_[data-slot=scroll-area-scrollbar][data-state=hidden]]:hidden",
                  )}
                >
                  <button
                    type="button"
                    className="focus-visible:ring-ring block w-full cursor-pointer px-2.5 py-2 text-left focus-visible:outline-none focus-visible:ring-1"
                    aria-label={t("repo.previewCommitMessage")}
                    onClick={() => setMessagePreviewOpen(true)}
                  >
                    <p className="wrap-break-word text-[13px] leading-snug font-semibold">
                      {detail.subject}
                    </p>
                    {detail.body ? (
                      <p className="text-muted-foreground mt-1 whitespace-pre-wrap wrap-break-word text-[11px] leading-snug">
                        {detail.body}
                      </p>
                    ) : null}
                  </button>
                </ScrollArea>
              </div>
            </TooltipTrigger>
            <TooltipContent>{t("repo.previewCommitMessage")}</TooltipContent>
          </Tooltip>
        </div>

        <div className="space-y-1">
          <p className="text-muted-foreground text-[11px] leading-none">
            {t("repo.commitAuthor")}
          </p>
          <div className="flex items-start gap-2">
            <div className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-md">
              <User className="size-3.5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1 space-y-0.5 pt-0.5">
              <p className="truncate text-xs leading-tight font-medium">
                {detail.authorName}
              </p>
              <p className="text-muted-foreground text-[11px] leading-tight tabular-nums">
                {dayjs(detail.authoredAt).format("YYYY-MM-DD HH:mm:ss")}
              </p>
              <p className="text-muted-foreground font-mono text-[11px] leading-tight">
                {t("repo.commitParents", { hashes: parentLabel })}
              </p>
            </div>
          </div>
        </div>

        {firstSummary.total > 0 ? (
          <div className="text-muted-foreground flex items-center gap-1.5 text-[11px] leading-none">
            <FileDiff className="size-3.5 shrink-0" aria-hidden="true" />
            <span>
              {t("repo.commitFileStats", {
                total: firstSummary.total,
                added: firstSummary.added,
                modified: firstSummary.modified,
                deleted: firstSummary.deleted,
              })}
            </span>
          </div>
        ) : null}

        {refs.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1">
            {refs.map((ref) => (
              // 详情区始终全文展示；与历史列表「展开分支名」无关
              <CopyableGitRefTag key={ref} refName={ref} expand />
            ))}
          </div>
        ) : null}

        {containingBranches != null ? (
          <p className="text-muted-foreground text-[11px] leading-snug wrap-break-word">
            {containingBranches.length === 0
              ? t("repo.commitContainingBranchesEmpty")
              : t("repo.commitContainingBranches", {
                  count: containingBranches.length,
                  names: containingBranches.join(", "),
                })}
          </p>
        ) : null}

        {changeSize != null ? (
          <p className="text-muted-foreground text-[11px] leading-snug tabular-nums">
            {t("repo.commitChangeSize", {
              count: changeSize.fileCount,
              size: formatChangeSizeBytes(changeSize.totalBytes),
            })}
          </p>
        ) : null}

        {containingBranches == null || changeSize == null ? (
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {containingBranches == null ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-[11px] shadow-none"
                disabled={branchesLoading || !repoPath}
                onClick={() => void loadContainingBranches()}
              >
                {branchesLoading ? <Spinner className="mr-1 size-3" /> : null}
                {t("repo.commitShowBranches")}
              </Button>
            ) : null}
            {changeSize == null ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-[11px] shadow-none"
                disabled={sizeLoading || !repoPath}
                onClick={() => void loadChangeSize()}
              >
                {sizeLoading ? <Spinner className="mr-1 size-3" /> : null}
                {t("repo.commitShowSize")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* 改动文件区：顶栏控件一份，同时控制下方所有 parent 区域 */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <CommitFilesToolbar
          view={filesView}
          showAllFiles={showAllFiles}
          allFilesLoading={allFilesLoading}
          showLineStats={showLineStats}
          canExpandTree={canExpandTree}
          onShowList={() => setFilesView("list")}
          onShowTree={() => setFilesView("tree")}
          onExpandAll={() =>
            setTreeExpandSignal((current) => ({
              type: "all",
              nonce: (current?.nonce ?? 0) + 1,
            }))
          }
          onCollapseAll={() =>
            setTreeExpandSignal((current) => ({
              type: "none",
              nonce: (current?.nonce ?? 0) + 1,
            }))
          }
          onToggleShowAllFiles={handleToggleShowAllFiles}
          onShowLineStatsChange={setShowLineStats}
        />
        {changedDiffs.length === 0 ? (
          <ParentDiffSection
            diff={{ parentId: "", parentShortId: "", files: [], truncated: false }}
            index={0}
            parentCount={detail.diffs.length || 1}
            rootName={rootName}
            commitId={detail.id}
            view={filesView}
            showAllFiles={showAllFiles}
            allFiles={allFiles}
            allFilesLoading={allFilesLoading}
            allFilesTruncated={allFilesTruncated}
            showLineStats={showLineStats}
            treeExpandSignal={treeExpandSignal}
            onTreeExpandabilityChange={handleTreeExpandabilityChange}
          />
        ) : (
          changedDiffs.map(({ diff, index }) => (
            <ParentDiffSection
              key={diff.parentId || `root-${index}`}
              diff={diff}
              index={index}
              parentCount={detail.diffs.length}
              rootName={rootName}
              commitId={detail.id}
              view={filesView}
              showAllFiles={showAllFiles}
              allFiles={allFiles}
              allFilesLoading={allFilesLoading}
              allFilesTruncated={allFilesTruncated}
              showLineStats={showLineStats}
              treeExpandSignal={treeExpandSignal}
              onTreeExpandabilityChange={handleTreeExpandabilityChange}
            />
          ))
        )}
      </div>

      <Dialog open={messagePreviewOpen} onOpenChange={setMessagePreviewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("repo.commitMessagePreview")}</DialogTitle>
            <DialogDescription>{t("repo.commitMessagePreviewDescription")}</DialogDescription>
          </DialogHeader>
          <ScrollArea className="border-border max-h-[min(60vh,30rem)] rounded-md border">
            <div className="space-y-3 px-3 py-2.5">
              <p className="wrap-break-word text-sm leading-relaxed font-semibold">{detail.subject}</p>
              {detail.body ? (
                <p className="text-muted-foreground whitespace-pre-wrap wrap-break-word text-xs leading-relaxed">
                  {detail.body}
                </p>
              ) : null}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => void copyCommitMessage()}>
              <Copy className="size-3.5" aria-hidden="true" />
              {messageCopied ? t("repo.copySuccess") : t("repo.copy")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
