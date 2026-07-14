import { useEffect, useMemo, useState } from "react";
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
  Loader2,
  Search,
  Tag,
  User,
} from "lucide-react";
import { toast } from "sonner";

import { CommitFileTree, getCommitFileTreeFolderPaths } from "@/components/git/CommitFileTree";
import { DiffLineStats } from "@/components/git/DiffLineStats";
import { MaterialFileIcon } from "@/components/git/MaterialFileIcon";
import { Button } from "@/components/ui/button";
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

/** 人类可读字节大小（与状态栏口径一致） */
function formatBytes(bytes: number): string {
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
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)}${units[unitIndex]}`;
}

/** 远端展示用 origin&name，复制时还原为 origin/name 便于粘贴到 Git 命令 */
function refClipboardText(ref: string): string {
  const amp = ref.indexOf("&");
  if (amp > 0) {
    return `${ref.slice(0, amp)}/${ref.slice(amp + 1)}`;
  }
  return ref;
}

interface CopyableRefTagProps {
  refName: string;
}

/** 历史详情分支 / 标签：点击复制（悬停提示，成功短暂反馈） */
function CopyableRefTag({ refName }: CopyableRefTagProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  async function copyRef(): Promise<void> {
    try {
      await copyToClipboard(refClipboardText(refName));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      toast.error(toUserMessage(error) || t("repo.copyFailed"));
    }
  }

  return (
    <Tooltip open={copied ? true : undefined} delayDuration={200}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="bg-muted text-foreground hover:bg-accent inline-flex h-5 max-w-[160px] cursor-pointer items-center gap-1 overflow-hidden rounded-md border-0 px-1.5 text-[11px] leading-none transition-colors"
          title={refName}
          aria-label={t("repo.copy")}
          onClick={() => {
            void copyRef();
          }}
        >
          <Tag className="text-primary size-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{refName}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {copied ? t("repo.copySuccess") : t("repo.copy")}
      </TooltipContent>
    </Tooltip>
  );
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

interface ParentDiffSectionProps {
  diff: GitCommitParentDiff;
  index: number;
  parentCount: number;
  rootName: string;
  commitId: string;
  repoPath: string;
}

function ParentDiffSection({
  diff,
  index,
  parentCount,
  rootName,
  commitId,
  repoPath,
}: ParentDiffSectionProps) {
  const { t } = useTranslation();
  const selectedCommitFile = useRepoStore((state) => state.selectedCommitFile);
  const selectCommitFile = useRepoStore((state) => state.selectCommitFile);
  const [filter, setFilter] = useState("");
  const [view, setView] = useState<"list" | "tree">("list");
  const [expandedTreePaths, setExpandedTreePaths] = useState<Set<string>>(new Set());
  /** 显示该提交树下全部文件（非仅改动） */
  const [showAllFiles, setShowAllFiles] = useState(false);
  const [allFiles, setAllFiles] = useState<GitChangedFile[] | null>(null);
  const [allFilesLoading, setAllFilesLoading] = useState(false);
  /** 列表 / 树中显示 +/- 行数 */
  const [showLineStats, setShowLineStats] = useState(false);

  // 切换提交时退出「显示所有文件」，避免串数据
  useEffect(() => {
    setShowAllFiles(false);
    setAllFiles(null);
    setAllFilesLoading(false);
    setView("list");
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
      return diff.files;
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
    return merged;
  }, [showAllFiles, allFiles, diff.files, changedFileByPath]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) {
      return sourceFiles;
    }
    return sourceFiles.filter((file) => file.path.toLowerCase().includes(q));
  }, [sourceFiles, filter]);

  const treeFolderPaths = useMemo(() => getCommitFileTreeFolderPaths(visible), [visible]);

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

  const placeholder = showAllFiles
    ? t("repo.commitAllFilesFilter")
    : parentCount > 1 && diff.parentShortId
      ? t("repo.commitDiffWithParent", {
          index: index + 1,
          hash: diff.parentShortId,
        })
      : t("repo.commitChangedFiles");

  function showTreeView(): void {
    setView("tree");
    setExpandedTreePaths(new Set(getCommitFileTreeFolderPaths(sourceFiles)));
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

  async function enableShowAllFiles(): Promise<void> {
    if (!repoPath) {
      toast.error(t("repo.commitDetailLoadFailed"));
      return;
    }
    setShowAllFiles(true);
    setView("tree");

    function expandMergedTree(treeFiles: GitChangedFile[]): void {
      const seen = new Set(treeFiles.map((file) => file.path));
      const merged: GitChangedFile[] = treeFiles.map((file) => {
        const changed = changedFileByPath.get(file.path);
        return {
          path: file.path,
          status: changed?.status ?? "",
          additions: changed?.additions,
          deletions: changed?.deletions,
        };
      });
      for (const file of diff.files) {
        if (!seen.has(file.path)) {
          merged.push(file);
        }
      }
      setExpandedTreePaths(new Set(getCommitFileTreeFolderPaths(merged)));
    }

    if (allFiles != null) {
      expandMergedTree(allFiles);
      return;
    }

    setAllFilesLoading(true);
    try {
      const result = await gitService.listTree(repoPath, commitId);
      const files: GitChangedFile[] = result.paths.map((path) => ({
        path,
        status: "",
      }));
      setAllFiles(files);
      expandMergedTree(files);
    } catch (error) {
      setShowAllFiles(false);
      toast.error(toUserMessage(error));
    } finally {
      setAllFilesLoading(false);
    }
  }

  function disableShowAllFiles(): void {
    setShowAllFiles(false);
    setView("list");
    setExpandedTreePaths(new Set());
  }

  function handleShowAllFilesClick(): void {
    if (showAllFiles) {
      disableShowAllFiles();
      return;
    }
    void enableShowAllFiles();
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {/* 分隔线只在上方元信息区 border-b，此处不再加 border-t，避免叠成双线 */}
      <div className="flex shrink-0 items-center gap-1 px-2 py-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "h-6 gap-1 px-1.5 text-xs transition-colors",
            // disabled 默认 pointer-events-none 会导致 not-allowed 光标看不到
            showAllFiles && "disabled:pointer-events-auto",
            view === "list" && !showAllFiles
              ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
              : "text-muted-foreground",
          )}
          aria-pressed={view === "list" && !showAllFiles}
          disabled={showAllFiles}
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
            "h-6 gap-1 px-1.5 text-xs transition-colors",
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
                    onClick={() => setExpandedTreePaths(new Set(treeFolderPaths))}
                    disabled={treeFolderPaths.length === 0}
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
                    onClick={() => setExpandedTreePaths(new Set())}
                    disabled={treeFolderPaths.length === 0}
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
                onClick={handleShowAllFilesClick}
              >
                {allFilesLoading ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
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
              {/* 勾选项：开关行数；后续其它项可在此追加并打开独立弹窗 */}
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

      <div className="shrink-0 px-2 pb-1.5">
        <div className="relative">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
            aria-hidden="true"
          />
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder={placeholder}
            className="h-7 pl-8 text-xs"
            aria-label={placeholder}
          />
        </div>
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <ScrollArea className="h-full w-full min-w-0 [&_[data-orientation=vertical]]:right-0.5 [&_[data-orientation=vertical]]:left-auto [&_[data-slot=scroll-area-viewport]>div]:!block [&_[data-slot=scroll-area-viewport]>div]:!min-w-0 [&_[data-slot=scroll-area-viewport]>div]:w-full">
          <div className="min-w-0 px-2 pr-3 pb-1">
            {allFilesLoading ? (
              <div className="text-muted-foreground flex items-center gap-2 px-0.5 py-3 text-xs">
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
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

  const summary: GitCommitSummary | null = useMemo(() => {
    if (!selectedCommitId) {
      return null;
    }
    return commits.find((commit) => commit.id === selectedCommitId) ?? null;
  }, [commits, selectedCommitId]);

  const refs = summary?.refs ?? [];
  const rootName = getPathBasename(repoPath ?? "") || t("project.repoLabel");

  // 切换选中提交时恢复「显示分支 / 显示大小」按钮
  useEffect(() => {
    setContainingBranches(null);
    setChangeSize(null);
    setBranchesLoading(false);
    setSizeLoading(false);
    setMessagePreviewOpen(false);
    setMessageCopied(false);
  }, [selectedCommitId]);

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
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
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

  // 仅展示有实际改动的 parent 差异；无变更的不渲染文件区
  const changedDiffs = detail.diffs
    .map((diff, index) => ({ diff, index }))
    .filter(({ diff }) => diff.files.length > 0);

  const firstSummary = summarizeFiles(changedDiffs.flatMap(({ diff }) => diff.files));
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
                {detail.shortId}
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
              <button
                type="button"
                className="border-border bg-muted/30 hover:bg-accent/50 focus-visible:ring-ring block w-full max-w-full min-w-0 cursor-pointer rounded-md border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-1"
                aria-label={t("repo.previewCommitMessage")}
                onClick={() => setMessagePreviewOpen(true)}
              >
                {/* 小高度预览用原生滚动，避免 ScrollArea 内层 table 把卡片撑出右缘 */}
                <div className="h-28 w-full min-w-0 overflow-x-hidden overflow-y-auto">
                  <p className="wrap-break-word break-words text-[13px] leading-snug font-semibold">
                    {detail.subject}
                  </p>
                  {detail.body ? (
                    <p className="text-muted-foreground mt-1 whitespace-pre-wrap wrap-break-word break-words text-[11px] leading-snug">
                      {detail.body}
                    </p>
                  ) : null}
                </div>
              </button>
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
              {t("repo.commitFileStatsShort", {
                total: firstSummary.total,
                modified: firstSummary.modified,
                added: firstSummary.added,
              })}
            </span>
          </div>
        ) : null}

        {refs.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1">
            {refs.map((ref) => (
              <CopyableRefTag key={ref} refName={ref} />
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
              size: formatBytes(changeSize.totalBytes),
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
                className="h-7 px-2.5 text-[11px]"
                disabled={branchesLoading || !repoPath}
                onClick={() => void loadContainingBranches()}
              >
                {branchesLoading ? (
                  <Loader2 className="mr-1 size-3 animate-spin" aria-hidden="true" />
                ) : null}
                {t("repo.commitShowBranches")}
              </Button>
            ) : null}
            {changeSize == null ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-[11px]"
                disabled={sizeLoading || !repoPath}
                onClick={() => void loadChangeSize()}
              >
                {sizeLoading ? (
                  <Loader2 className="mr-1 size-3 animate-spin" aria-hidden="true" />
                ) : null}
                {t("repo.commitShowSize")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* 改动文件区独立占满剩余高度并滚动；无改动时仍可「显示所有文件」 */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {changedDiffs.length === 0 ? (
          <ParentDiffSection
            diff={{ parentId: "", parentShortId: "", files: [] }}
            index={0}
            parentCount={detail.diffs.length || 1}
            rootName={rootName}
            commitId={detail.id}
            repoPath={repoPath ?? ""}
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
              repoPath={repoPath ?? ""}
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
