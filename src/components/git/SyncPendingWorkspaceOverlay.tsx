import { useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import { ArrowLeft, FileSearch, Files, GitCommitHorizontal, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { EmptyState } from "@/components/common/EmptyState";
import { SelectMenu } from "@/components/common/SelectMenu";
import { TruncateStartPath } from "@/components/common/TruncateStartPath";
import { BranchCompareFilePreview } from "@/components/git/BranchCompareFilePreview";
import { DiffLineStats } from "@/components/git/DiffLineStats";
import { GitIdentityAvatar } from "@/components/git/GitIdentityAvatar";
import { MaterialFileIcon } from "@/components/git/MaterialFileIcon";
import { TextDiffPreview } from "@/components/git/TextDiffPreview";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
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
import { gitStatusLetterClass } from "@/utils/gitStatusStyle";
import { DEFAULT_TEXT_ENCODING } from "@/utils/textEncodings";

export type SyncPendingKind = "push" | "pull";
type SyncPendingView = "files" | "commits";

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
 * - 提交：多次时三栏（提交列表 | 该提交文件 | Diff）；单次时两栏（文件 | Diff）
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
  const showCommitColumn = view === "commits" && (commits?.length ?? 0) > 1;

  const base = kind === "push" ? (upstream ?? "") : "HEAD";
  const target = kind === "push" ? "HEAD" : (upstream ?? "");

  const kindOptions = useMemo(
    () => [
      ...(showPull
        ? [{ value: "pull" as const, label: t("repo.syncPendingPull", { count: behind }) }]
        : []),
      ...(showPush
        ? [{ value: "push" as const, label: t("repo.syncPendingPush", { count: ahead }) }]
        : []),
    ],
    [ahead, behind, showPull, showPush, t],
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

  useEffect(() => {
    if (!show) {
      return;
    }
    if (kind === "push" && !showPush && showPull) {
      setSyncPendingKind("pull");
    } else if (kind === "pull" && !showPull && showPush) {
      setSyncPendingKind("push");
    } else if (!showPush && !showPull) {
      closeSyncPending();
    }
  }, [closeSyncPending, kind, setSyncPendingKind, show, showPull, showPush]);

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
        setRangeFiles(compareResult.files);
        setCommits(logResult.commits);
        const firstCommit = logResult.commits[0] ?? null;
        setSelectedCommitId(firstCommit?.id ?? null);
        setSelectedPath(compareResult.files[0]?.path ?? null);
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
  }, [base, kind, repoPath, show, t, target, upstream]);

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

  const gridClassName = showCommitColumn
    ? "grid min-h-0 flex-1 grid-cols-[minmax(14rem,18rem)_minmax(14rem,18rem)_minmax(0,1fr)]"
    : "grid min-h-0 flex-1 grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]";

  return (
    <div
      className="bg-background absolute inset-0 z-30 flex min-h-0 flex-col overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label={t("repo.syncPendingDialog")}
    >
      <div className="border-border flex h-11 shrink-0 items-center gap-2 border-b px-2">
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground size-6 shrink-0 [&_svg]:size-3.5"
              aria-label={t("repo.commitDiffBack")}
              onClick={closeSyncPending}
            >
              <ArrowLeft aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("repo.commitDiffBack")}</TooltipContent>
        </Tooltip>

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

        <ButtonGroup aria-label={t("repo.syncPendingView")} className="shrink-0">
          {(["files", "commits"] as const).map((item) => (
            <Button
              key={item}
              type="button"
              size="xs"
              variant={view === item ? "default" : "outline"}
              aria-pressed={view === item}
              onClick={() => setView(item)}
            >
              {item === "files" ? t("repo.syncPendingFiles") : t("repo.syncPendingCommits")}
            </Button>
          ))}
        </ButtonGroup>

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
          ) : (
            <div className={gridClassName}>
              {showCommitColumn ? (
                <aside className="border-border bg-muted/20 flex min-h-0 flex-col border-r">
                  <div className="text-muted-foreground border-border border-b px-3 py-1.5 text-[11px]">
                    {t("repo.syncPendingCommitCount", { count: commits?.length ?? 0 })}
                  </div>
                  <ScrollArea className="min-h-0 flex-1">
                    {(commits?.length ?? 0) > 0 ? (
                      <div className="space-y-0.5 p-1">
                        {commits?.map((commit) => (
                          <button
                            type="button"
                            key={commit.id}
                            onClick={() => setSelectedCommitId(commit.id)}
                            className={cn(
                              "hover:bg-accent flex w-full min-w-0 items-start gap-2 rounded-md px-2 py-2 text-left transition-colors",
                              selectedCommitId === commit.id && "bg-accent text-accent-foreground",
                            )}
                          >
                            <GitIdentityAvatar
                              name={commit.authorName}
                              email={commit.authorEmail}
                              label={commit.authorName}
                              compact
                              className="mt-0.5 size-7"
                            />
                            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <span className="line-clamp-2 text-xs leading-snug font-medium">
                                {commit.subject}
                              </span>
                              <span className="text-muted-foreground flex min-w-0 items-center gap-1 font-mono text-[10px] tabular-nums">
                                <GitCommitHorizontal
                                  className="size-3 shrink-0"
                                  aria-hidden="true"
                                />
                                <span className="truncate">{commit.shortId}</span>
                              </span>
                              <span className="text-muted-foreground truncate text-[10px]">
                                {commit.authorName} ·{" "}
                                {dayjs(commit.authoredAt).format("YYYY-MM-DD")}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <EmptyState
                        compact
                        className="py-8"
                        icon={<GitCommitHorizontal />}
                        title={t("repo.syncPendingNoCommits")}
                      />
                    )}
                  </ScrollArea>
                </aside>
              ) : null}

              <aside className="border-border flex min-h-0 flex-col border-r">
                <div className="text-muted-foreground border-border border-b px-3 py-1.5 text-[11px]">
                  {t("repo.syncPendingFileSummary", summary)}
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
                <ScrollArea className="min-h-0 flex-1">
                  {view === "commits" && commitLoading ? (
                    <div className="text-muted-foreground flex items-center justify-center gap-2 py-8 text-xs">
                      <Spinner className="size-3.5" />
                      {t("common.loading")}
                    </div>
                  ) : visibleFiles.length > 0 ? (
                    <div className="space-y-0.5 px-1 py-0.5">
                      {visibleFiles.map((file) => (
                        <button
                          type="button"
                          key={file.path}
                          onClick={() => setSelectedPath(file.path)}
                          className={cn(
                            "hover:bg-accent flex h-7 w-full min-w-0 items-center gap-1 rounded-md px-2 text-left text-xs transition-colors",
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
                          <MaterialFileIcon
                            name={file.path}
                            isDir={false}
                            className="size-3.5 shrink-0"
                          />
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
                  ) : (
                    <EmptyState
                      compact
                      className="py-8"
                      icon={<Files />}
                      title={t("repo.syncPendingNoFiles")}
                    />
                  )}
                </ScrollArea>
              </aside>

              <section className="min-h-0 min-w-0">
                {diffError ? (
                  <p className="text-destructive p-4 text-sm">{diffError}</p>
                ) : !selectedPath ? (
                  <EmptyState
                    className="h-full"
                    icon={<FileSearch />}
                    title={t("repo.syncPendingSelectFile")}
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
                  />
                )}
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
