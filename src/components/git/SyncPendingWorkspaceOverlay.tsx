import { useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import {
  ChevronsDownUp,
  ChevronsUpDown,
  FileSearch,
  Files,
  GitCommitHorizontal,
  GitCompare,
  List,
  ListTree,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { EmptyState } from "@/components/common/EmptyState";
import { SelectMenu } from "@/components/common/SelectMenu";
import { TruncateStartPath } from "@/components/common/TruncateStartPath";
import { BranchCompareFilePreview } from "@/components/git/BranchCompareFilePreview";
import { CommitFileTree, getCommitFileTreeFolderPaths } from "@/components/git/CommitFileTree";
import { DiffLineStats } from "@/components/git/DiffLineStats";
import { GitIdentityAvatar } from "@/components/git/GitIdentityAvatar";
import { MaterialFileIcon } from "@/components/git/MaterialFileIcon";
import { TextDiffPreview } from "@/components/git/TextDiffPreview";
import { RESIZABLE_HANDLE_CLASSNAME, ResizableSplit } from "@/components/layout/ResizableSplit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  getBranchCompare,
  getBranchFileDiff,
  getCommit,
  getCommitFileDiff,
  getLog,
} from "@/services/git";
import { useRepoStore } from "@/store/useRepoStore";
import { toUserMessage } from "@/types/error";
import type { GitChangedFile, GitCommitDetail, GitCommitSummary, GitDiffResult } from "@/types/git";
import { getChangedFileStatsParts } from "@/utils/formatChangedFileStats";
import { getPathBasename } from "@/utils/getPathBasename";
import { gitStatusLetterClass } from "@/utils/gitStatusStyle";
import { DEFAULT_TEXT_ENCODING } from "@/utils/textEncodings";

export type SyncPendingKind = "push" | "pull";
type SyncPendingView = "files" | "commits";
type SyncPendingFileListView = "list" | "tree";

/** 同步预览分栏最小宽（与变更面板 240 对齐量级） */
const SYNC_PENDING_COMMIT_MIN_PX = 220;
const SYNC_PENDING_FILES_MIN_PX = 240;
const SYNC_PENDING_DIFF_MIN_PX = 320;
const SYNC_PENDING_LAYOUT_3_KEY = "jlgit.syncPending.layout.v1.three";
const SYNC_PENDING_LAYOUT_2_KEY = "jlgit.syncPending.layout.v1.filesDiff";

const SYNC_PENDING_SCROLL_AREA_CLASS =
  "min-h-0 min-w-0 flex-1 [&_[data-slot=scroll-area-viewport]]:overflow-x-hidden [&_[data-slot=scroll-area-viewport]>div]:!block [&_[data-slot=scroll-area-viewport]>div]:!min-w-0 [&_[data-slot=scroll-area-viewport]>div]:w-full";

function readThreeColumnLayout(): { commits: number; files: number; diff: number } {
  const fallback = { commits: 22, files: 26, diff: 52 };
  try {
    const raw = localStorage.getItem(SYNC_PENDING_LAYOUT_3_KEY);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw) as Partial<typeof fallback>;
    const commits = Number(parsed.commits);
    const files = Number(parsed.files);
    const diff = Number(parsed.diff);
    if (
      ![commits, files, diff].every((value) => Number.isFinite(value) && value > 5 && value < 90) ||
      Math.abs(commits + files + diff - 100) > 1
    ) {
      return fallback;
    }
    return { commits, files, diff };
  } catch {
    return fallback;
  }
}

function summarizeFiles(files: GitChangedFile[]): {
  count: number;
  added: number;
  modified: number;
  deleted: number;
} {
  return {
    count: files.length,
    added: files.filter((file) => file.status === "A").length,
    modified: files.filter((file) => !["A", "D"].includes(file.status)).length,
    deleted: files.filter((file) => file.status === "D").length,
  };
}

/**
 * 待推送 / 待更新全工作区覆盖层。
 * - 文件：改动文件 | Diff
 * - 提交：三栏（提交列表含提交人 | 该提交文件 | Diff）
 */
export function SyncPendingWorkspaceOverlay() {
  const { t } = useTranslation();
  const repoPath = useRepoStore((state) => state.repoPath);
  const upstream = useRepoStore((state) => state.status?.upstream ?? null);
  const ahead = useRepoStore((state) => state.status?.ahead ?? 0);
  const behind = useRepoStore((state) => state.status?.behind ?? 0);
  const kind = useRepoStore((state) => state.syncPendingKind);
  const setSyncPendingKind = useRepoStore((state) => state.setSyncPendingKind);
  const closeSyncPending = useRepoStore((state) => state.closeSyncPendingPreview);

  const [view, setView] = useState<SyncPendingView>("files");
  const [fileListView, setFileListView] = useState<SyncPendingFileListView>("list");
  const [expandedTreePaths, setExpandedTreePaths] = useState<Set<string>>(() => new Set());
  const [rangeFiles, setRangeFiles] = useState<GitChangedFile[] | null>(null);
  const [commits, setCommits] = useState<GitCommitSummary[] | null>(null);
  const [selectedCommitId, setSelectedCommitId] = useState<string | null>(null);
  const [selectedCommit, setSelectedCommit] = useState<GitCommitDetail | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileFilter, setFileFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [diff, setDiff] = useState<GitDiffResult | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [encoding, setEncoding] = useState(DEFAULT_TEXT_ENCODING);
  const [loading, setLoading] = useState(false);
  const [commitLoading, setCommitLoading] = useState(false);
  const listRequestId = useRef(0);
  const commitRequestId = useRef(0);
  const diffRequestId = useRef(0);

  const show = Boolean(kind && repoPath);
  const showPush = ahead > 0;
  const showPull = behind > 0;
  const pendingCount = kind === "push" ? ahead : behind;
  // 提交视图始终显示左侧提交列表（含提交人），不因只有 1 条而收起
  const showCommitColumn = view === "commits";

  const base = kind === "push" ? (upstream ?? "") : "HEAD";
  const target = kind === "push" ? "HEAD" : (upstream ?? "");

  // 有 upstream 时两侧都可选；某一侧为 0 时用空状态，不强制切走
  const kindOptions = useMemo(
    () => [
      { value: "pull" as const, label: t("repo.syncPendingPull") },
      { value: "push" as const, label: t("repo.syncPendingPush") },
    ],
    [t],
  );

  const commitFiles = selectedCommit?.diffs[0]?.files ?? [];
  const activeFiles = view === "files" ? (rangeFiles ?? []) : commitFiles;
  const visibleFiles = useMemo(
    () =>
      activeFiles.filter((file) =>
        file.path.toLowerCase().includes(fileFilter.trim().toLowerCase()),
      ),
    [activeFiles, fileFilter],
  );
  const summary = useMemo(() => summarizeFiles(activeFiles), [activeFiles]);
  const treeFolderPaths = useMemo(() => getCommitFileTreeFolderPaths(visibleFiles), [visibleFiles]);
  const canExpandTree = treeFolderPaths.length > 0;
  const treeRootName = getPathBasename(repoPath ?? "") || t("repo.repoLabel");

  // 切到树形 / 文件数据源变化时默认全部展开（筛选变化不打断用户折叠）
  useEffect(() => {
    if (fileListView !== "tree") {
      return;
    }
    const source = view === "files" ? (rangeFiles ?? []) : (selectedCommit?.diffs[0]?.files ?? []);
    setExpandedTreePaths(new Set(getCommitFileTreeFolderPaths(source)));
  }, [fileListView, view, selectedCommitId, kind, rangeFiles, selectedCommit]);

  function toggleTreeFolder(path: string): void {
    setExpandedTreePaths((previous) => {
      const next = new Set(previous);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  // 两侧都无待同步时关闭；允许用户主动切到空侧查看空状态
  useEffect(() => {
    if (!show) {
      return;
    }
    if (!showPush && !showPull) {
      closeSyncPending();
    }
  }, [closeSyncPending, show, showPull, showPush]);

  // 打开 / 切换 push·pull：拉提交列表 + 区间文件
  useEffect(() => {
    if (!show || !repoPath || !upstream || !kind || !base || !target) {
      return;
    }

    const currentRequest = ++listRequestId.current;
    setError(null);
    setRangeFiles(null);
    setCommits(null);
    setSelectedCommitId(null);
    setSelectedCommit(null);
    setSelectedPath(null);
    setDiff(null);

    // ahead-only / behind-only：空侧不要跑 tip 树对比，否则会把另一侧的文件 diff 误显示出来
    const sideCount = kind === "push" ? ahead : behind;
    if (sideCount <= 0) {
      setRangeFiles([]);
      setCommits([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const range = kind === "push" ? `${upstream}..HEAD` : `HEAD..${upstream}`;
    void Promise.all([
      getBranchCompare(repoPath, { base, target }),
      getLog(repoPath, { ref: range, limit: 100 }),
    ])
      .then(([compareResult, logResult]) => {
        if (currentRequest !== listRequestId.current) {
          return;
        }
        // 双重保险：区间无独有提交时清空文件（状态角标偶发滞后）
        const files = logResult.commits.length > 0 ? compareResult.files : [];
        setRangeFiles(files);
        setCommits(logResult.commits);
        const firstCommit = logResult.commits[0] ?? null;
        setSelectedCommitId(firstCommit?.id ?? null);
        setSelectedPath(files[0]?.path ?? null);
      })
      .catch((reason: unknown) => {
        if (currentRequest === listRequestId.current) {
          setError(toUserMessage(reason) || t("repo.syncPendingLoadFailed"));
        }
      })
      .finally(() => {
        if (currentRequest === listRequestId.current) {
          setLoading(false);
        }
      });
  }, [ahead, base, behind, kind, repoPath, show, t, target, upstream]);

  // 选中提交 → 拉详情与文件列表
  useEffect(() => {
    if (!show || !repoPath || !selectedCommitId || view !== "commits") {
      return;
    }

    const currentRequest = ++commitRequestId.current;
    setCommitLoading(true);
    setSelectedCommit(null);
    setSelectedPath(null);
    setDiff(null);

    void getCommit(repoPath, selectedCommitId)
      .then((result) => {
        if (currentRequest !== commitRequestId.current) {
          return;
        }
        setSelectedCommit(result.commit);
        setSelectedPath(result.commit.diffs[0]?.files[0]?.path ?? null);
      })
      .catch((reason: unknown) => {
        if (currentRequest === commitRequestId.current) {
          setError(toUserMessage(reason) || t("repo.syncPendingLoadFailed"));
        }
      })
      .finally(() => {
        if (currentRequest === commitRequestId.current) {
          setCommitLoading(false);
        }
      });
  }, [repoPath, selectedCommitId, show, t, view]);

  // 切到文件视图时，用区间文件默认选中
  useEffect(() => {
    if (view !== "files") {
      return;
    }
    setSelectedPath((prev) => {
      if (prev && rangeFiles?.some((file) => file.path === prev)) {
        return prev;
      }
      return rangeFiles?.[0]?.path ?? null;
    });
  }, [rangeFiles, view]);

  // Diff：文件模式用区间对比；提交模式用 parent→commit
  useEffect(() => {
    if (!show || !repoPath || !selectedPath) {
      return;
    }

    const currentRequest = ++diffRequestId.current;
    setDiff(null);
    setDiffError(null);

    if (view === "files") {
      if (!base || !target) {
        return;
      }
      void getBranchFileDiff(repoPath, {
        base,
        target,
        filePath: selectedPath,
        encoding,
      })
        .then((result) => {
          if (currentRequest === diffRequestId.current) {
            setDiff(result);
          }
        })
        .catch((reason: unknown) => {
          if (currentRequest === diffRequestId.current) {
            setDiffError(toUserMessage(reason) || t("repo.syncPendingDiffFailed"));
          }
        });
      return;
    }

    if (!selectedCommit) {
      return;
    }
    void getCommitFileDiff(repoPath, {
      filePath: selectedPath,
      commitRev: selectedCommit.id,
      parentRev: selectedCommit.parents[0] ?? "",
      encoding,
    })
      .then((result) => {
        if (currentRequest === diffRequestId.current) {
          setDiff(result);
        }
      })
      .catch((reason: unknown) => {
        if (currentRequest === diffRequestId.current) {
          setDiffError(toUserMessage(reason) || t("repo.syncPendingDiffFailed"));
        }
      });
  }, [base, encoding, repoPath, selectedCommit, selectedPath, show, t, target, view]);

  if (!show || !kind) {
    return null;
  }

  const threeColumnLayout = readThreeColumnLayout();

  const commitColumn = (
    <aside className="bg-muted/20 flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      {/* h-8 与 DiffPreviewToolbar / 文件栏顶栏底边对齐 */}
      <div className="text-muted-foreground border-border flex h-8 shrink-0 items-center border-b px-3 text-[11px]">
        {t("repo.syncPendingCommitCount", { count: commits?.length ?? 0 })}
      </div>
      <ScrollArea className={SYNC_PENDING_SCROLL_AREA_CLASS}>
        {(commits?.length ?? 0) > 0 ? (
          <div className="w-full min-w-0 space-y-0.5 p-1">
            {commits?.map((commit) => (
              <button
                type="button"
                key={commit.id}
                onClick={() => setSelectedCommitId(commit.id)}
                className={cn(
                  "hover:bg-accent flex w-full min-w-0 flex-col gap-1 overflow-hidden rounded-md px-2 py-2 text-left transition-colors",
                  selectedCommitId === commit.id && "bg-accent text-accent-foreground",
                )}
              >
                {/* 参考：标题一行；次行 头像+作者+hash | 日期右对齐 */}
                <span
                  className="min-w-0 truncate text-xs leading-snug font-medium"
                  title={commit.subject}
                >
                  {commit.subject}
                </span>
                <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-[10px]">
                  <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
                    <GitIdentityAvatar
                      name={commit.authorName}
                      email={commit.authorEmail}
                      label={commit.authorName}
                      compact
                      className="size-4 shrink-0"
                    />
                    <span className="min-w-0 truncate" title={commit.authorName}>
                      {commit.authorName}
                    </span>
                    <span className="shrink-0 font-mono tabular-nums">{commit.shortId}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {dayjs(commit.authoredAt).format("YYYY-MM-DD")}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            compact
            className="h-full min-h-40 py-0"
            icon={<GitCommitHorizontal />}
            title={t("repo.syncPendingNoCommits")}
            description={t("repo.syncPendingNoCommitsDescription")}
          />
        )}
      </ScrollArea>
    </aside>
  );

  const filesColumn = (
    <aside className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      {/* h-8 与 DiffPreviewToolbar 底边对齐 */}
      <div className="border-border flex h-8 shrink-0 items-center gap-1 border-b px-2">
        <span className="text-muted-foreground flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden text-[11px] tabular-nums">
          {getChangedFileStatsParts(t, {
            total: summary.count,
            added: summary.added,
            modified: summary.modified,
            deleted: summary.deleted,
          }).map((part) => (
            <span key={part} className="shrink-0">
              {part}
            </span>
          ))}
        </span>
        {fileListView === "tree" ? (
          <div className="flex shrink-0 items-center gap-0.5">
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground size-6"
                  aria-label={t("repo.expandAll")}
                  disabled={!canExpandTree}
                  onClick={() => setExpandedTreePaths(new Set(treeFolderPaths))}
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
                  disabled={!canExpandTree}
                  onClick={() => setExpandedTreePaths(new Set())}
                >
                  <ChevronsDownUp className="size-3.5" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("repo.collapseAll")}</TooltipContent>
            </Tooltip>
          </div>
        ) : null}
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground h-6 gap-1 px-1.5 text-xs"
              aria-label={fileListView === "list" ? t("repo.viewTree") : t("repo.viewList")}
              onClick={() => setFileListView((current) => (current === "list" ? "tree" : "list"))}
            >
              {fileListView === "list" ? (
                <ListTree className="size-3.5" aria-hidden="true" />
              ) : (
                <List className="size-3.5" aria-hidden="true" />
              )}
              {fileListView === "list" ? t("repo.viewTree") : t("repo.viewList")}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {fileListView === "list" ? t("repo.viewTree") : t("repo.viewList")}
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="p-2">
        <Input
          className="h-7 text-xs shadow-none"
          value={fileFilter}
          onChange={(event) => setFileFilter(event.target.value)}
          placeholder={t("repo.filter")}
          aria-label={t("repo.filter")}
        />
      </div>
      <ScrollArea className={SYNC_PENDING_SCROLL_AREA_CLASS}>
        {view === "commits" && commitLoading ? (
          <div className="text-muted-foreground flex items-center justify-center gap-2 py-8 text-xs">
            <Spinner className="size-3.5" />
            {t("common.loading")}
          </div>
        ) : visibleFiles.length > 0 ? (
          fileListView === "tree" ? (
            <div className="w-full min-w-0 px-1 py-0.5">
              <CommitFileTree
                files={visibleFiles}
                rootName={treeRootName}
                expandedPaths={expandedTreePaths}
                onToggleFolder={toggleTreeFolder}
                showStatus
                showLineStats
                onFileClick={(file) => setSelectedPath(file.path)}
                selectedPath={selectedPath}
              />
            </div>
          ) : (
            <div className="w-full min-w-0 space-y-0.5 px-1 py-0.5">
              {visibleFiles.map((file) => (
                <button
                  type="button"
                  key={file.path}
                  onClick={() => setSelectedPath(file.path)}
                  className={cn(
                    "hover:bg-accent flex h-7 w-full min-w-0 items-center gap-1 overflow-hidden rounded-md px-2 text-left text-xs transition-colors",
                    selectedPath === file.path && "bg-accent text-accent-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "w-3.5 shrink-0 text-center font-mono text-[11px] leading-none font-semibold",
                      gitStatusLetterClass(file.status),
                    )}
                  >
                    {file.status}
                  </span>
                  <MaterialFileIcon name={file.path} isDir={false} className="size-3.5 shrink-0" />
                  <TruncateStartPath
                    className="min-w-0 flex-1"
                    path={file.path}
                    highlightQuery={fileFilter}
                  />
                  <DiffLineStats
                    additions={file.additions}
                    deletions={file.deletions}
                    className="ml-0"
                  />
                </button>
              ))}
            </div>
          )
        ) : (
          <EmptyState
            compact
            className="h-full min-h-40 py-0"
            icon={<Files />}
            title={t("repo.syncPendingNoFiles")}
            description={t("repo.syncPendingNoFilesDescription")}
          />
        )}
      </ScrollArea>
    </aside>
  );

  const diffColumn = (
    <section className="h-full min-h-0 min-w-0 overflow-hidden">
      {diffError ? (
        <p className="text-destructive p-4 text-sm">{diffError}</p>
      ) : activeFiles.length === 0 && !loading && !commitLoading ? (
        <EmptyState
          className="h-full"
          icon={<Files />}
          title={t("repo.syncPendingNoFiles")}
          description={t("repo.syncPendingNoFilesDescription")}
        />
      ) : !selectedPath ? (
        <EmptyState
          className="h-full"
          icon={<FileSearch />}
          title={t("repo.syncPendingSelectFile")}
          description={t("repo.syncPendingSelectFileDescription")}
        />
      ) : !diff || !repoPath ? (
        <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-sm">
          <Spinner className="size-4" />
          {t("common.loading")}
        </div>
      ) : view === "files" ? (
        <BranchCompareFilePreview
          repoPath={repoPath}
          base={base}
          target={target}
          path={selectedPath}
          diff={diff}
          encoding={encoding}
          onEncodingChange={setEncoding}
        />
      ) : selectedCommit ? (
        <TextDiffPreview
          path={selectedPath}
          diff={diff}
          selectionKey={`${selectedCommit.id}\0${selectedPath}`}
          encoding={encoding}
          onEncodingChange={setEncoding}
          repoPath={repoPath}
          blameRev={selectedCommit.id}
          oldLabel={
            <span className="truncate font-mono">
              {selectedCommit.parents[0]?.slice(0, 7) || t("repo.diffEmptyTree")}
            </span>
          }
          newLabel={<span className="truncate font-mono">{selectedCommit.shortId}</span>}
          binaryEncodingLabel="HEX"
          allowBinaryEditor
          className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
        />
      ) : (
        <EmptyState
          className="h-full"
          icon={<GitCommitHorizontal />}
          title={t("repo.syncPendingSelectCommit")}
          description={t("repo.syncPendingSelectCommitDescription")}
        />
      )}
    </section>
  );

  return (
    <div
      className="bg-background absolute inset-0 z-30 flex min-h-0 flex-col overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label={t("repo.syncPendingDialog")}
    >
      <div className="border-border flex h-11 shrink-0 items-center gap-2 border-b px-2">
        <span
          className="text-muted-foreground inline-flex size-7 shrink-0 items-center justify-center"
          aria-hidden="true"
        >
          <GitCompare className="size-4.5" />
        </span>

        {upstream ? (
          <SelectMenu
            size="sm"
            value={kind}
            options={kindOptions}
            onChange={(value) => setSyncPendingKind(value as SyncPendingKind)}
            ariaLabel={t("repo.syncPendingKind")}
            triggerClassName="h-7 w-auto min-w-40 max-w-64"
          />
        ) : (
          <span className="text-muted-foreground truncate text-sm">
            {t("repo.syncPendingNoUpstream")}
          </span>
        )}

        <div
          className="bg-muted/60 flex shrink-0 items-center gap-0.5 rounded-md p-0.5"
          role="tablist"
          aria-label={t("repo.syncPendingView")}
        >
          {(["files", "commits"] as const).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={view === item}
              className={cn(
                "cursor-pointer rounded-sm px-2 py-0.5 text-[11px] transition-colors",
                view === item
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setView(item)}
            >
              {item === "files" ? t("repo.syncPendingFiles") : t("repo.syncPendingCommits")}
            </button>
          ))}
        </div>

        {pendingCount > 0 ? (
          <span className="text-muted-foreground truncate text-xs tabular-nums">
            {t("repo.syncPendingCommitCount", { count: commits?.length ?? pendingCount })}
          </span>
        ) : null}

        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground ml-auto size-6 shrink-0 [&_svg]:size-3.5"
              aria-label={t("repo.diffClosePreview")}
              onClick={closeSyncPending}
            >
              <X aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("repo.diffClosePreview")}</TooltipContent>
        </Tooltip>
      </div>

      {!upstream ? (
        <p className="text-muted-foreground p-6 text-sm">{t("repo.syncPendingNoUpstream")}</p>
      ) : (
        <>
          {error ? <p className="text-destructive shrink-0 px-3 py-2 text-xs">{error}</p> : null}

          {loading ? (
            <div className="text-muted-foreground flex flex-1 items-center justify-center gap-2 text-sm">
              <Spinner className="size-4" />
              {t("common.loading")}
            </div>
          ) : showCommitColumn ? (
            <ResizablePanelGroup
              key={SYNC_PENDING_LAYOUT_3_KEY}
              id={SYNC_PENDING_LAYOUT_3_KEY}
              orientation="horizontal"
              className="min-h-0 min-w-0 flex-1"
              defaultLayout={threeColumnLayout}
              onLayoutChanged={(layout, meta) => {
                if (!meta.isUserInteraction) {
                  return;
                }
                const commits = layout.commits;
                const files = layout.files;
                const diff = layout.diff;
                if (
                  typeof commits !== "number" ||
                  typeof files !== "number" ||
                  typeof diff !== "number"
                ) {
                  return;
                }
                try {
                  localStorage.setItem(
                    SYNC_PENDING_LAYOUT_3_KEY,
                    JSON.stringify({ commits, files, diff }),
                  );
                } catch {
                  // ignore
                }
              }}
            >
              <ResizablePanel
                id="commits"
                defaultSize={`${threeColumnLayout.commits}%`}
                minSize={`${SYNC_PENDING_COMMIT_MIN_PX}px`}
                className="min-h-0 min-w-0"
              >
                {commitColumn}
              </ResizablePanel>
              <ResizableHandle className={RESIZABLE_HANDLE_CLASSNAME} />
              <ResizablePanel
                id="files"
                defaultSize={`${threeColumnLayout.files}%`}
                minSize={`${SYNC_PENDING_FILES_MIN_PX}px`}
                className="min-h-0 min-w-0"
              >
                {filesColumn}
              </ResizablePanel>
              <ResizableHandle className={RESIZABLE_HANDLE_CLASSNAME} />
              <ResizablePanel
                id="diff"
                defaultSize={`${threeColumnLayout.diff}%`}
                minSize={`${SYNC_PENDING_DIFF_MIN_PX}px`}
                className="min-h-0 min-w-0"
              >
                {diffColumn}
              </ResizablePanel>
            </ResizablePanelGroup>
          ) : (
            <ResizableSplit
              storageKey={SYNC_PENDING_LAYOUT_2_KEY}
              defaultRatio={28}
              minFirstPx={SYNC_PENDING_FILES_MIN_PX}
              minSecondPx={SYNC_PENDING_DIFF_MIN_PX}
              className="min-h-0 min-w-0 flex-1"
              first={filesColumn}
              second={diffColumn}
            />
          )}
        </>
      )}
    </div>
  );
}
