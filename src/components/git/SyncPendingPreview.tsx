import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  FileSearch,
  Files,
  GitCommitHorizontal,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { EmptyState } from "@/components/common/EmptyState";
import { SelectMenu } from "@/components/common/SelectMenu";
import { TruncateStartPath } from "@/components/common/TruncateStartPath";
import { BranchCompareFilePreview } from "@/components/git/BranchCompareFilePreview";
import { DiffLineStats } from "@/components/git/DiffLineStats";
import { MaterialFileIcon } from "@/components/git/MaterialFileIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getBranchCompare, getBranchFileDiff, getCommit, getLog } from "@/services/git";
import { toUserMessage } from "@/types/error";
import type { GitChangedFile, GitCommitDetail, GitCommitSummary, GitDiffResult } from "@/types/git";
import { gitStatusLetterClass } from "@/utils/gitStatusStyle";
import { DEFAULT_TEXT_ENCODING } from "@/utils/textEncodings";

export type SyncPendingKind = "push" | "pull";
type SyncPendingView = "files" | "commits";

interface SyncPendingPreviewProps {
  repoPath: string;
  /** 跟踪分支，如 origin/main；无则不可预览 */
  upstream: string | null;
  ahead: number;
  behind: number;
  disabled?: boolean;
  className?: string;
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
 * 工具栏 ahead/behind 角标分组：点击打开待推送 / 待更新预览（文件或提交）。
 */
export function SyncPendingPreview({
  repoPath,
  upstream,
  ahead,
  behind,
  disabled = false,
  className,
}: SyncPendingPreviewProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<SyncPendingKind>(ahead > 0 ? "push" : "pull");
  const [view, setView] = useState<SyncPendingView>("files");
  const [files, setFiles] = useState<GitChangedFile[] | null>(null);
  const [commits, setCommits] = useState<GitCommitSummary[] | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedCommit, setSelectedCommit] = useState<GitCommitDetail | null>(null);
  const [fileFilter, setFileFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [diff, setDiff] = useState<GitDiffResult | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [encoding, setEncoding] = useState(DEFAULT_TEXT_ENCODING);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);
  const diffRequestId = useRef(0);

  const showPush = ahead > 0;
  const showPull = behind > 0;
  const visible = showPush || showPull;

  // push: upstream → HEAD；pull: HEAD → upstream
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

  const visibleFiles = useMemo(
    () =>
      files?.filter((file) => file.path.toLowerCase().includes(fileFilter.trim().toLowerCase())) ??
      [],
    [fileFilter, files],
  );
  const summary = useMemo(() => summarizeFiles(files ?? []), [files]);

  useEffect(() => {
    if (!open) {
      return;
    }
    // 打开时若当前 kind 不可用则切到可用侧
    if (kind === "push" && !showPush && showPull) {
      setKind("pull");
    } else if (kind === "pull" && !showPull && showPush) {
      setKind("push");
    }
  }, [kind, open, showPull, showPush]);

  useEffect(() => {
    if (!open || !upstream || !base || !target) {
      return;
    }

    const currentRequest = ++requestId.current;
    setError(null);
    setFiles(null);
    setCommits(null);
    setSelectedPath(null);
    setSelectedCommit(null);
    setDiff(null);
    setLoading(true);

    if (view === "files") {
      void getBranchCompare(repoPath, { base, target })
        .then((result) => {
          if (currentRequest !== requestId.current) {
            return;
          }
          setFiles(result.files);
          setSelectedPath(result.files[0]?.path ?? null);
        })
        .catch((reason: unknown) => {
          if (currentRequest === requestId.current) {
            setError(toUserMessage(reason) || t("repo.syncPendingLoadFailed"));
          }
        })
        .finally(() => {
          if (currentRequest === requestId.current) {
            setLoading(false);
          }
        });
      return;
    }

    const range = kind === "push" ? `${upstream}..HEAD` : `HEAD..${upstream}`;
    void getLog(repoPath, { ref: range, limit: 100 })
      .then((result) => {
        if (currentRequest !== requestId.current) {
          return;
        }
        setCommits(result.commits);
        const first = result.commits[0];
        if (first) {
          void getCommit(repoPath, first.id)
            .then((show) => {
              if (currentRequest === requestId.current) {
                setSelectedCommit(show.commit);
              }
            })
            .catch(() => {
              /* 选中失败时右侧保持空 */
            });
        }
      })
      .catch((reason: unknown) => {
        if (currentRequest === requestId.current) {
          setError(toUserMessage(reason) || t("repo.syncPendingLoadFailed"));
        }
      })
      .finally(() => {
        if (currentRequest === requestId.current) {
          setLoading(false);
        }
      });
  }, [base, kind, open, repoPath, t, target, upstream, view]);

  useEffect(() => {
    if (!open || view !== "files" || !selectedPath || !base || !target) {
      return;
    }
    const currentRequest = ++diffRequestId.current;
    setDiff(null);
    setDiffError(null);
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
  }, [base, encoding, open, repoPath, selectedPath, t, target, view]);

  if (!visible) {
    return null;
  }

  function openWith(next: SyncPendingKind): void {
    if (open && kind === next) {
      setOpen(false);
      return;
    }
    setKind(next);
    setOpen(true);
  }

  async function selectCommit(commit: GitCommitSummary): Promise<void> {
    setSelectedCommit(null);
    try {
      setSelectedCommit((await getCommit(repoPath, commit.id)).commit);
    } catch (reason) {
      setError(toUserMessage(reason) || t("repo.syncPendingLoadFailed"));
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          className={cn(
            "border-border bg-muted/40 inline-flex h-8 items-center overflow-hidden rounded-md border",
            className,
          )}
          role="group"
          aria-label={t("repo.syncPendingGroup")}
        >
          {showPull ? (
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-full gap-1 rounded-none px-2"
                  disabled={disabled || !upstream}
                  aria-label={t("repo.unpulledCount", { count: behind })}
                  aria-expanded={open && kind === "pull"}
                  onClick={() => openWith("pull")}
                >
                  <ArrowDownToLine className="size-3.5" aria-hidden="true" />
                  <span className="bg-primary text-primary-foreground inline-flex size-4 items-center justify-center rounded-md text-[10px] leading-none font-semibold">
                    {behind > 99 ? "99+" : behind}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("repo.unpulledCount", { count: behind })}</TooltipContent>
            </Tooltip>
          ) : null}
          {showPush ? (
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-full gap-1 rounded-none px-2",
                    showPull && "border-border border-l",
                  )}
                  disabled={disabled || !upstream}
                  aria-label={t("repo.unpushedCount", { count: ahead })}
                  aria-expanded={open && kind === "push"}
                  onClick={() => openWith("push")}
                >
                  <ArrowUpFromLine className="size-3.5" aria-hidden="true" />
                  <span className="bg-primary text-primary-foreground inline-flex size-4 items-center justify-center rounded-md text-[10px] leading-none font-semibold">
                    {ahead > 99 ? "99+" : ahead}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("repo.unpushedCount", { count: ahead })}</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </PopoverAnchor>

      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={6}
        className="flex h-[min(28rem,70vh)] w-[min(48rem,calc(100vw-2rem))] flex-col overflow-hidden p-0"
      >
        {!upstream ? (
          <p className="text-muted-foreground p-4 text-sm">{t("repo.syncPendingNoUpstream")}</p>
        ) : (
          <>
            <div className="border-border flex shrink-0 items-center gap-2 border-b px-3 py-2">
              <SelectMenu
                size="sm"
                value={kind}
                options={kindOptions}
                onChange={(value) => setKind(value as SyncPendingKind)}
                ariaLabel={t("repo.syncPendingKind")}
                triggerClassName="h-7 w-auto min-w-40 max-w-56"
              />
              <div
                className="border-border ml-auto flex shrink-0 items-center rounded-md border p-0.5 text-xs"
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
                      "rounded-sm px-2 py-1 transition-colors",
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
            </div>

            {error ? <p className="text-destructive shrink-0 px-3 py-2 text-xs">{error}</p> : null}

            {loading ? (
              <div className="text-muted-foreground flex flex-1 items-center justify-center gap-2 text-sm">
                <Spinner className="size-4" />
                {t("common.loading")}
              </div>
            ) : view === "files" ? (
              <div className="grid min-h-0 flex-1 grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)]">
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
                    {visibleFiles.length > 0 ? (
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
                  ) : !diff ? (
                    <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-sm">
                      <Spinner className="size-4" />
                      {t("common.loading")}
                    </div>
                  ) : (
                    <BranchCompareFilePreview
                      repoPath={repoPath}
                      base={base}
                      target={target}
                      path={selectedPath}
                      diff={diff}
                      encoding={encoding}
                      onEncodingChange={setEncoding}
                    />
                  )}
                </section>
              </div>
            ) : (
              <div className="grid min-h-0 flex-1 grid-cols-[minmax(14rem,18rem)_minmax(0,1fr)]">
                <aside className="border-border flex min-h-0 flex-col border-r">
                  <div className="text-muted-foreground border-border border-b px-3 py-1.5 text-[11px]">
                    {t("repo.syncPendingCommitCount", { count: commits?.length ?? 0 })}
                  </div>
                  <ScrollArea className="min-h-0 flex-1">
                    {(commits?.length ?? 0) > 0 ? (
                      <div className="space-y-0.5 px-1 py-0.5">
                        {commits?.map((commit) => (
                          <button
                            type="button"
                            key={commit.id}
                            onClick={() => {
                              void selectCommit(commit);
                            }}
                            className={cn(
                              "hover:bg-accent flex w-full min-w-0 flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors",
                              selectedCommit?.id === commit.id &&
                                "bg-accent text-accent-foreground",
                            )}
                          >
                            <span className="flex w-full min-w-0 items-center gap-1.5">
                              <GitCommitHorizontal
                                className="text-muted-foreground size-3 shrink-0"
                                aria-hidden="true"
                              />
                              <span className="min-w-0 flex-1 truncate text-xs font-medium">
                                {commit.subject}
                              </span>
                            </span>
                            <span className="text-muted-foreground pl-5 font-mono text-[10px] tabular-nums">
                              {commit.shortId} · {commit.authorName}
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
                <section className="min-h-0 min-w-0 overflow-hidden">
                  {selectedCommit ? (
                    <ScrollArea className="h-full">
                      <div className="space-y-3 p-4">
                        <div>
                          <h2 className="text-sm font-semibold">{selectedCommit.subject}</h2>
                          <p className="text-muted-foreground mt-1 text-xs">
                            {selectedCommit.authorName} · {selectedCommit.shortId}
                          </p>
                        </div>
                        {selectedCommit.body.trim() ? (
                          <pre className="bg-muted/40 rounded-md p-3 text-xs whitespace-pre-wrap">
                            {selectedCommit.body}
                          </pre>
                        ) : null}
                        {selectedCommit.diffs[0]?.files.length ? (
                          <div className="space-y-1">
                            <p className="text-muted-foreground text-[11px] font-medium">
                              {t("repo.syncPendingCommitFiles", {
                                count: selectedCommit.diffs[0].files.length,
                              })}
                            </p>
                            <ul className="space-y-0.5">
                              {selectedCommit.diffs[0].files.slice(0, 40).map((file) => (
                                <li
                                  key={file.path}
                                  className="flex min-w-0 items-center gap-1.5 text-xs"
                                >
                                  <span
                                    className={cn(
                                      "w-3.5 shrink-0 text-center font-mono text-[11px] font-semibold",
                                      gitStatusLetterClass(file.status),
                                    )}
                                  >
                                    {file.status}
                                  </span>
                                  <span className="min-w-0 truncate font-mono">{file.path}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    </ScrollArea>
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
      </PopoverContent>
    </Popover>
  );
}
