import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileSearch, GitCommitHorizontal } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { CommitAuthorAvatars } from "@/components/git/CommitAuthorAvatars";
import { TextDiffPreview } from "@/components/git/TextDiffPreview";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { AppWindowHeader } from "@/components/layout/AppWindowHeader";
import { ResizableSplit } from "@/components/layout/ResizableSplit";
import { cn } from "@/lib/utils";

import { getCommitFileDiff, getLog } from "@/services/git";
import { openCommitHistoryWindow } from "@/services/window/historyWindows";
import { toUserMessage } from "@/types/error";
import type { GitCommitSummary, GitDiffResult } from "@/types/git";
import type { Project } from "@/types/project";
import { formatCommitDateTime } from "@/utils/formatCommitDateTime";
import { DEFAULT_TEXT_ENCODING } from "@/utils/textEncodings";

interface FileHistoryWorkspaceProps {
  project: Project;
  filePath: string;
  initialRef: string | null;
}

/** 文件历史子窗：左提交列表，右该文件相对父提交的差异。 */
export function FileHistoryWorkspace({ project, filePath, initialRef }: FileHistoryWorkspaceProps) {
  const { t } = useTranslation();
  const [commits, setCommits] = useState<GitCommitSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [diff, setDiff] = useState<GitDiffResult | null>(null);
  const [encoding, setEncoding] = useState(DEFAULT_TEXT_ENCODING);
  const [listError, setListError] = useState<string | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [diffLoading, setDiffLoading] = useState(false);

  const selected = useMemo(
    () => commits.find((commit) => commit.id === selectedId) ?? null,
    [commits, selectedId],
  );

  useEffect(() => {
    let active = true;
    setListLoading(true);
    setListError(null);
    void getLog(project.path, {
      limit: 100,
      ref: initialRef ?? undefined,
      all: initialRef ? undefined : true,
      path: filePath,
    })
      .then((result) => {
        if (!active) return;
        setCommits(result.commits);
        setSelectedId(result.commits[0]?.id ?? null);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setListError(toUserMessage(reason) || t("fileHistory.loadCommitsFailed"));
        setCommits([]);
        setSelectedId(null);
      })
      .finally(() => {
        if (active) setListLoading(false);
      });
    return () => {
      active = false;
    };
  }, [filePath, initialRef, project.path, t]);

  useEffect(() => {
    if (!selected) {
      setDiff(null);
      setDiffError(null);
      setDiffLoading(false);
      return;
    }
    let active = true;
    setDiffLoading(true);
    setDiffError(null);
    const parentRev = selected.parentIds[0];
    void getCommitFileDiff(project.path, {
      filePath,
      commitRev: selected.id,
      parentRev: parentRev || undefined,
      encoding,
    })
      .then((result) => {
        if (active) setDiff(result);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setDiff(null);
        setDiffError(toUserMessage(reason) || t("fileHistory.loadDiffFailed"));
      })
      .finally(() => {
        if (active) setDiffLoading(false);
      });
    return () => {
      active = false;
    };
  }, [encoding, filePath, project.path, selected, t]);

  return (
    <main className="bg-background text-foreground flex h-screen min-h-0 w-full flex-col overflow-hidden">
      <AppWindowHeader>
        <span
          className="truncate text-sm font-semibold"
          title={t("fileHistory.windowTitle", { path: filePath })}
        >
          {t("fileHistory.windowTitle", { path: filePath })}
        </span>
        <span className="text-muted-foreground ml-2 truncate text-xs" title={project.path}>
          ({project.path})
        </span>
      </AppWindowHeader>

      <div className="min-h-0 flex-1">
        <ResizableSplit
          orientation="horizontal"
          defaultRatio={28}
          minFirstPx={220}
          minSecondPx={420}
          storageKey="jlgit:split:file-history"
          first={
            <aside className="flex h-full min-h-0 flex-col">
              {listLoading ? (
                <p className="text-muted-foreground px-3 py-4 text-sm">
                  {t("fileHistory.loading")}
                </p>
              ) : listError ? (
                <p className="text-destructive px-3 py-4 text-sm">{listError}</p>
              ) : commits.length === 0 ? (
                <EmptyState
                  className="h-full"
                  icon={<GitCommitHorizontal />}
                  title={t("fileHistory.empty")}
                  description={t("fileHistory.emptyDescription")}
                />
              ) : (
                <ScrollArea className="h-full min-h-0 w-full flex-1 px-3 py-3 [&_[data-slot=scroll-area-viewport]]:overflow-x-hidden [&_[data-slot=scroll-area-viewport]>div]:!block [&_[data-slot=scroll-area-viewport]>div]:!min-w-0 [&_[data-slot=scroll-area-viewport]>div]:w-full">
                  <ul className="flex w-full min-w-0 flex-col gap-1">
                    {commits.map((commit) => {
                      const active = commit.id === selectedId;
                      return (
                        <li key={commit.id} className="min-w-0">
                          <ContextMenu onOpenChange={(open) => open && setSelectedId(commit.id)}>
                            <ContextMenuTrigger asChild>
                              <button
                                type="button"
                                onClick={() => setSelectedId(commit.id)}
                                className={cn(
                                  "hover:bg-accent flex w-full min-w-0 flex-col gap-0.5 overflow-hidden rounded-md px-1.5 py-1.5 text-left",
                                  active && "bg-accent",
                                )}
                              >
                                <p
                                  className="min-w-0 truncate text-xs font-medium"
                                  title={commit.subject}
                                >
                                  {commit.subject}
                                </p>
                                <div className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-[11px]">
                                  <CommitAuthorAvatars
                                    authorName={commit.authorName}
                                    authorEmail={commit.authorEmail ?? ""}
                                    coAuthors={commit.coAuthors ?? []}
                                  />
                                  <span className="min-w-0 truncate">{commit.authorName}</span>
                                  <span className="font-mono shrink-0">{commit.shortId}</span>
                                  <span className="ml-auto shrink-0 tabular-nums">
                                    {formatCommitDateTime(commit.authoredAt)}
                                  </span>
                                </div>
                              </button>
                            </ContextMenuTrigger>
                            <ContextMenuContent>
                              <ContextMenuItem
                                onSelect={() => {
                                  void openCommitHistoryWindow({
                                    projectId: project.id,
                                    commitId: commit.id,
                                  }).catch((error: unknown) => {
                                    toast.error(
                                      toUserMessage(error) ||
                                        t("fileHistory.openCommitHistoryFailed"),
                                    );
                                  });
                                }}
                              >
                                <GitCommitHorizontal aria-hidden="true" />
                                {t("fileHistory.viewCommitHistory")}
                              </ContextMenuItem>
                            </ContextMenuContent>
                          </ContextMenu>
                        </li>
                      );
                    })}
                  </ul>
                </ScrollArea>
              )}
            </aside>
          }
          second={
            <section className="flex h-full min-h-0 flex-col">
              {!selected ? (
                <EmptyState
                  className="h-full"
                  icon={<FileSearch />}
                  title={t("fileHistory.selectCommit")}
                  description={t("fileHistory.selectCommitDescription")}
                />
              ) : diffLoading ? (
                <p className="text-muted-foreground p-4 text-sm">{t("fileHistory.loading")}</p>
              ) : diffError ? (
                <p className="text-destructive p-4 text-sm">{diffError}</p>
              ) : !diff ? (
                <p className="text-muted-foreground p-4 text-sm">{t("fileHistory.noDiff")}</p>
              ) : (
                <TextDiffPreview
                  path={filePath}
                  diff={diff}
                  selectionKey={`${selected.id}:${filePath}:${encoding}`}
                  encoding={encoding}
                  onEncodingChange={setEncoding}
                  repoPath={project.path}
                  blameRev={selected.id}
                  oldLabel={
                    <span className="font-mono truncate">
                      {selected.parentIds[0]?.slice(0, 7) ?? t("repo.diffEmptyTree")}
                    </span>
                  }
                  newLabel={<span className="font-mono truncate">{selected.shortId}</span>}
                  className="flex min-h-0 flex-1 flex-col overflow-hidden"
                />
              )}
            </section>
          }
        />
      </div>
    </main>
  );
}
