import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import {
  Camera,
  ChevronsDownUp,
  ChevronsUpDown,
  FileDiff,
  GitCommitHorizontal,
  List,
  ListTree,
  MoreHorizontal,
  Search,
  Tag,
  User,
} from "lucide-react";
import { toast } from "sonner";

import { CommitFileTree, getCommitFileTreeFolderPaths } from "@/components/git/CommitFileTree";
import { MaterialFileIcon } from "@/components/git/MaterialFileIcon";
import { Button } from "@/components/ui/button";
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

import { toUserMessage } from "@/types/error";
import { GitChangedFile, GitCommitParentDiff, GitCommitSummary } from "@/types/git";
import { copyToClipboard } from "@/utils/clipboard";
import { getPathBasename } from "@/utils/getPathBasename";
import { gitStatusLetterClass } from "@/utils/gitStatusStyle";

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
}

function ParentDiffSection({ diff, index, parentCount, rootName }: ParentDiffSectionProps) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState("");
  const [view, setView] = useState<"list" | "tree">("list");
  const [expandedTreePaths, setExpandedTreePaths] = useState<Set<string>>(new Set());

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) {
      return diff.files;
    }
    return diff.files.filter((file) => file.path.toLowerCase().includes(q));
  }, [diff.files, filter]);

  const treeFolderPaths = useMemo(() => getCommitFileTreeFolderPaths(visible), [visible]);

  const placeholder =
    parentCount > 1 && diff.parentShortId
      ? t("repo.commitDiffWithParent", {
          index: index + 1,
          hash: diff.parentShortId,
        })
      : t("repo.commitChangedFiles");

  function showTreeView(): void {
    setView("tree");
    setExpandedTreePaths(new Set(treeFolderPaths));
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
                className="text-muted-foreground size-6"
                aria-label={t("repo.commitSnapshotSoon")}
                onClick={() =>
                  toast.message(t("repo.syncComingSoon", { action: t("repo.commitSnapshotSoon") }))
                }
              >
                <Camera className="size-3.5" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("repo.commitSnapshotSoon")}</TooltipContent>
          </Tooltip>
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground size-6"
                aria-label={t("repo.historyMore")}
                onClick={() =>
                  toast.message(t("repo.syncComingSoon", { action: t("repo.historyMore") }))
                }
              >
                <MoreHorizontal className="size-3.5" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("repo.historyMore")}</TooltipContent>
          </Tooltip>
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
        <ScrollArea className="h-full w-full min-w-0 pr-3 pb-1 [&_[data-orientation=vertical]]:!right-1">
          {visible.length === 0 ? (
            <p className="text-muted-foreground px-2 py-2 text-xs">{t("repo.commitFilesEmpty")}</p>
          ) : view === "tree" ? (
            <CommitFileTree
              files={visible}
              rootName={rootName}
              expandedPaths={expandedTreePaths}
              onToggleFolder={toggleTreeFolder}
            />
          ) : (
            <ul className="w-full min-w-0">
              {visible.map((file) => (
                <li key={`${diff.parentId}:${file.path}`} className="min-w-0">
                  <div className="hover:bg-accent/60 flex h-7 w-full min-w-0 cursor-default items-center gap-1.5 overflow-hidden rounded-md px-1.5 transition-colors duration-150">
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
                    <TruncateStartPath path={file.path} className="font-mono" />
                  </div>
                </li>
              ))}
            </ul>
          )}
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

  const summary: GitCommitSummary | null = useMemo(() => {
    if (!selectedCommitId) {
      return null;
    }
    return commits.find((commit) => commit.id === selectedCommitId) ?? null;
  }, [commits, selectedCommitId]);

  const refs = summary?.refs ?? [];
  const rootName = getPathBasename(repoPath ?? "") || t("project.repoLabel");

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
            <TooltipContent side="bottom">
              {hashCopied ? t("repo.copySuccess") : t("repo.copy")}
            </TooltipContent>
          </Tooltip>
        </p>
      </header>

      {/* 元信息区固定；外层不滚动 */}
      <div className="border-border shrink-0 space-y-2 border-b px-3 py-2.5">
        {/* 提交文案框：标题+正文作为整体，仅框内滚动 */}
        <ScrollArea className="border-border bg-muted/30 max-h-28 rounded-md border">
          <Tooltip open={messageCopied ? true : undefined} delayDuration={200}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="hover:bg-accent/50 focus-visible:ring-ring block w-full cursor-pointer space-y-1 px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-1"
                aria-label={t("repo.copy")}
                onClick={() => void copyCommitMessage()}
              >
                <p className="wrap-break-word text-[13px] leading-snug font-semibold">
                  {detail.subject}
                </p>
                {detail.body ? (
                  <div className="text-muted-foreground whitespace-pre-wrap font-sans text-[11px] leading-snug">
                    {detail.body}
                  </div>
                ) : null}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {messageCopied ? t("repo.copySuccess") : t("repo.copy")}
            </TooltipContent>
          </Tooltip>
        </ScrollArea>

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
              <span
                key={ref}
                className="bg-muted text-foreground inline-flex h-5 max-w-[160px] items-center gap-1 overflow-hidden rounded-md px-1.5 text-[11px] leading-none"
                title={ref}
              >
                <Tag className="text-primary size-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{ref}</span>
              </span>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-[11px]"
            onClick={() =>
              toast.message(
                t("repo.syncComingSoon", { action: t("repo.commitShowBranches") }),
              )
            }
          >
            {t("repo.commitShowBranches")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-[11px]"
            onClick={() =>
              toast.message(
                t("repo.syncComingSoon", { action: t("repo.commitShowSize") }),
              )
            }
          >
            {t("repo.commitShowSize")}
          </Button>
        </div>
      </div>

      {/* 改动文件区独立占满剩余高度并滚动 */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {changedDiffs.length === 0 ? (
          <p className="text-muted-foreground px-3 py-4 text-xs">
            {t("repo.commitNoChanges")}
          </p>
        ) : (
          changedDiffs.map(({ diff, index }) => (
            <ParentDiffSection
              key={diff.parentId || `root-${index}`}
              diff={diff}
              index={index}
              parentCount={detail.diffs.length}
              rootName={rootName}
            />
          ))
        )}
      </div>
    </div>
  );
}
