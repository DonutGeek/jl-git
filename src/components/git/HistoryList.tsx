import { memo, useCallback, useEffect, useMemo, useState, type SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import {
  ArrowDownWideNarrow,
  Check,
  ChevronDown,
  GitCommitHorizontal,
  MoreHorizontal,
  Search,
  SearchX,
  SlidersHorizontal,
  Tag,
  User,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { useRepoStore } from "@/store/useRepoStore";

import { toUserMessage } from "@/types/error";
import { GitCommitSummary } from "@/types/git";

import { copyToClipboard } from "@/utils/clipboard";

type DatePreset = "all" | "7d" | "30d" | "90d";

interface CopyableHashProps {
  fullId: string;
  shortId: string;
}

/** 短 hash：悬停提示复制，点击写入剪贴板并短暂显示「复制成功」 */
function CopyableHash({ fullId, shortId }: CopyableHashProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  async function copyHash(): Promise<void> {
    try {
      await copyToClipboard(fullId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      toast.error(toUserMessage(error) || t("repo.copyFailed"));
    }
  }

  function stopRowSelect(event: SyntheticEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <Tooltip open={copied ? true : undefined} delayDuration={200}>
      <TooltipTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          className="text-muted-foreground hover:text-foreground w-[58px] shrink-0 cursor-pointer text-right font-mono text-xs underline-offset-2 hover:underline"
          aria-label={t("repo.copy")}
          onClick={(event) => {
            stopRowSelect(event);
            void copyHash();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              stopRowSelect(event);
              void copyHash();
            }
          }}
        >
          {shortId}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {copied ? t("repo.copySuccess") : t("repo.copy")}
      </TooltipContent>
    </Tooltip>
  );
}

interface HistoryCommitRowProps {
  commit: GitCommitSummary;
  isSelected: boolean;
  isTip: boolean;
  onSelect: (commitId: string) => void;
}

/** 单行提交：memo 避免选中变化时整表重绘 */
const HistoryCommitRow = memo(function HistoryCommitRow({
  commit,
  isSelected,
  isTip,
  onSelect,
}: HistoryCommitRowProps) {
  const refs = commit.refs ?? [];
  const primaryRef = refs[0] ?? null;
  const extraRefCount = Math.max(0, refs.length - 1);
  const authoredLabel = useMemo(
    () => dayjs(commit.authoredAt).format("YYYY-MM-DD HH:mm:ss"),
    [commit.authoredAt],
  );

  return (
    <li className="border-0">
      <button
        type="button"
        role="option"
        aria-selected={isSelected}
        className={cn(
          "flex w-full cursor-pointer items-center gap-2 rounded-md border-0 px-2 py-1.5 text-left shadow-none transition-colors duration-150",
          isSelected
            ? "bg-primary/10 text-foreground hover:bg-primary/15"
            : "hover:bg-accent/60 text-foreground",
        )}
        onClick={() => onSelect(commit.id)}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {isTip ? (
            <span className="bg-primary size-1.5 shrink-0 rounded-full" aria-hidden="true" />
          ) : (
            <span className="size-1.5 shrink-0" aria-hidden="true" />
          )}
          <span className="min-w-0 truncate text-sm" title={commit.subject}>
            {commit.subject}
          </span>
          {primaryRef ? (
            <span
              className="text-primary inline-flex max-w-[140px] shrink-0 items-center gap-1 overflow-hidden"
              title={refs.join(", ")}
            >
              <Tag className="size-3 shrink-0 opacity-80" aria-hidden="true" />
              <span className="truncate text-xs">
                {primaryRef}
                {extraRefCount > 0 ? ` +${extraRefCount}` : ""}
              </span>
            </span>
          ) : null}
        </div>

        <span className="text-muted-foreground w-[138px] shrink-0 font-mono text-[11px] tabular-nums">
          {authoredLabel}
        </span>

        <div className="text-muted-foreground flex w-[96px] shrink-0 items-center gap-1 overflow-hidden">
          <User className="size-3 shrink-0 opacity-70" aria-hidden="true" />
          <span className="min-w-0 truncate text-xs" title={commit.authorName}>
            {commit.authorName}
          </span>
        </div>

        <CopyableHash fullId={commit.id} shortId={commit.shortId} />
      </button>
    </li>
  );
});

/** 多关键词用 | 分隔，任一命中即可 */
function matchesQuery(commit: GitCommitSummary, query: string): boolean {
  const raw = query.trim();
  if (!raw) {
    return true;
  }

  const terms = raw
    .split("|")
    .map((term) => term.trim().toLowerCase())
    .filter(Boolean);

  if (terms.length === 0) {
    return true;
  }

  const haystack =
    `${commit.shortId} ${commit.id} ${commit.subject} ${commit.authorName} ${(commit.refs ?? []).join(" ")}`.toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

function matchesDate(commit: GitCommitSummary, preset: DatePreset): boolean {
  if (preset === "all") {
    return true;
  }

  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
  return dayjs(commit.authoredAt).isAfter(dayjs().subtract(days, "day"));
}

/** 历史列表：顶部筛选条 + 提交列表（本轮对已加载提交做客户端过滤） */
export function HistoryList() {
  const { t } = useTranslation();
  const commits = useRepoStore((state) => state.commits);
  const branches = useRepoStore((state) => state.branches);
  const status = useRepoStore((state) => state.status);
  const hasMore = useRepoStore((state) => state.hasMore);
  const loading = useRepoStore((state) => state.loading);
  const loadMoreLog = useRepoStore((state) => state.loadMoreLog);

  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState("");
  const [author, setAuthor] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [branchScope, setBranchScope] = useState<"all" | string>("all");

  const selectedCommitId = useRepoStore((state) => state.selectedCommitId);
  const selectCommit = useRepoStore((state) => state.selectCommit);
  const currentBranch = status?.branch ?? null;
  const localBranches = useMemo(
    () => branches.filter((branch) => !branch.isRemote),
    [branches],
  );

  const handleSelectCommit = useCallback(
    (commitId: string) => {
      void selectCommit(commitId).catch((error: unknown) => {
        toast.error(toUserMessage(error));
      });
    },
    [selectCommit],
  );

  /**
   * 进入历史 / 列表刷新后：
   * - 已有选中且仍在列表中 → 保留
   * - 否则有提交 → 默认选中第一条
   * - 无提交 → 清空选中
   */
  useEffect(() => {
    if (loading) {
      return;
    }

    if (commits.length === 0) {
      if (selectedCommitId !== null) {
        void selectCommit(null).catch(() => undefined);
      }
      return;
    }

    const stillValid =
      selectedCommitId != null &&
      commits.some((commit) => commit.id === selectedCommitId);

    if (stillValid) {
      return;
    }

    const firstId = commits[0]?.id;
    if (firstId) {
      void selectCommit(firstId).catch((error: unknown) => {
        toast.error(toUserMessage(error));
      });
    }
  }, [commits, loading, selectCommit, selectedCommitId]);

  const authors = useMemo(() => {
    const names = new Set<string>();
    for (const commit of commits) {
      if (commit.authorName) {
        names.add(commit.authorName);
      }
    }
    return [...names].sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [commits]);

  const filteredCommits = useMemo(() => {
    return commits.filter((commit) => {
      if (author && commit.authorName !== author) {
        return false;
      }
      if (!matchesDate(commit, datePreset)) {
        return false;
      }
      if (!matchesQuery(commit, query)) {
        return false;
      }
      return true;
    });
  }, [commits, author, datePreset, query]);

  async function handleLoadMore(): Promise<void> {
    setLoadingMore(true);

    try {
      await loadMoreLog();
    } catch (error) {
      toast.error(toUserMessage(error));
    } finally {
      setLoadingMore(false);
    }
  }

  function handleSoon(action: string): void {
    toast.message(t("repo.syncComingSoon", { action }));
  }

  const branchLabel =
    branchScope === "all" ? t("repo.historyAllBranches") : branchScope;
  const authorLabel = author ?? t("repo.historyAuthor");
  const dateLabel =
    datePreset === "all"
      ? t("repo.historyDate")
      : datePreset === "7d"
        ? t("repo.historyDate7d")
        : datePreset === "30d"
          ? t("repo.historyDate30d")
          : t("repo.historyDate90d");

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 筛选条：替代「提交历史」标题 */}
      <div
        className="border-border flex h-11 shrink-0 items-center gap-1.5 border-b px-2"
        role="toolbar"
        aria-label={t("repo.historyFilters")}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 max-w-[140px] gap-1 px-2 text-xs font-normal"
            >
              <span className="min-w-0 truncate">{branchLabel}</span>
              <ChevronDown className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-auto">
            <DropdownMenuLabel>{t("repo.historyBranchScope")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                setBranchScope("all");
                handleSoon(t("repo.historyAllBranches"));
              }}
            >
              <span className="min-w-0 flex-1 truncate">{t("repo.historyAllBranches")}</span>
              {branchScope === "all" ? <Check className="size-3.5 shrink-0" aria-hidden="true" /> : null}
            </DropdownMenuItem>
            {localBranches.map((branch) => (
              <DropdownMenuItem
                key={branch.name}
                onSelect={() => {
                  setBranchScope(branch.name);
                  handleSoon(t("repo.historyBranchScope"));
                }}
              >
                <span className="min-w-0 flex-1 truncate">{branch.name}</span>
                {branchScope === branch.name ? (
                  <Check className="size-3.5 shrink-0" aria-hidden="true" />
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="relative min-w-[160px] flex-1">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("repo.historySearchPlaceholder")}
            className="h-7 pr-8 pl-7 text-xs"
            aria-label={t("repo.historySearch")}
          />
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground absolute top-1/2 right-0.5 size-6 -translate-y-1/2"
                aria-label={t("repo.historyAdvancedFilter")}
                onClick={() => handleSoon(t("repo.historyAdvancedFilter"))}
              >
                <SlidersHorizontal className="size-3.5" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("repo.historyAdvancedFilter")}</TooltipContent>
          </Tooltip>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                "h-7 max-w-[120px] gap-1 px-2 text-xs font-normal",
                author && "bg-primary/10 text-primary border-transparent",
              )}
            >
              <span className="min-w-0 truncate">{authorLabel}</span>
              <ChevronDown className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-72 w-48 overflow-auto">
            <DropdownMenuLabel>{t("repo.historyAuthor")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setAuthor(null)}>
              <span className="min-w-0 flex-1 truncate">{t("repo.historyAuthorAll")}</span>
              {author == null ? <Check className="size-3.5 shrink-0" aria-hidden="true" /> : null}
            </DropdownMenuItem>
            {authors.map((name) => (
              <DropdownMenuItem key={name} onSelect={() => setAuthor(name)}>
                <span className="min-w-0 flex-1 truncate">{name}</span>
                {author === name ? <Check className="size-3.5 shrink-0" aria-hidden="true" /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                "h-7 gap-1 px-2 text-xs font-normal",
                datePreset !== "all" && "bg-primary/10 text-primary border-transparent",
              )}
            >
              <span>{dateLabel}</span>
              <ChevronDown className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-40">
            <DropdownMenuLabel>{t("repo.historyDate")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(
              [
                ["all", t("repo.historyDateAll")],
                ["7d", t("repo.historyDate7d")],
                ["30d", t("repo.historyDate30d")],
                ["90d", t("repo.historyDate90d")],
              ] as const
            ).map(([value, label]) => (
              <DropdownMenuItem key={value} onSelect={() => setDatePreset(value)}>
                <span className="min-w-0 flex-1">{label}</span>
                {datePreset === value ? <Check className="size-3.5 shrink-0" aria-hidden="true" /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground h-7 px-2 text-xs font-normal"
          onClick={() => handleSoon(t("repo.historyHighlight"))}
        >
          {t("repo.historyHighlight")}
        </Button>

        <div className="ml-auto flex shrink-0 items-center gap-0.5">
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
                <MoreHorizontal className="size-3.5" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("repo.historyMore")}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {commits.length === 0 ? (
          <div className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-3 px-6 text-center">
            <GitCommitHorizontal
              className="text-muted-foreground size-10 opacity-50"
              aria-hidden="true"
            />
            <div className="space-y-1">
              <p className="text-sm font-medium">{t("repo.history")}</p>
              <p className="text-muted-foreground max-w-sm text-xs">
                {t("repo.historyEmpty")}
              </p>
            </div>
          </div>
        ) : filteredCommits.length === 0 ? (
          <div className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-3 px-6 text-center">
            <SearchX
              className="text-muted-foreground size-10 opacity-50"
              aria-hidden="true"
            />
            <div className="space-y-1">
              <p className="text-sm font-medium">{t("repo.historyNoMatch")}</p>
              <p className="text-muted-foreground max-w-sm text-xs">
                {t("repo.historyNoMatchHint")}
              </p>
            </div>
          </div>
        ) : (
          <ul className="px-1.5 py-1.5" role="listbox" aria-label={t("repo.history")}>
            {filteredCommits.map((commit) => {
              const refs = commit.refs ?? [];
              const isTip =
                currentBranch != null &&
                refs.some((ref) => ref === currentBranch || ref.endsWith(`&${currentBranch}`));

              return (
                <HistoryCommitRow
                  key={commit.id}
                  commit={commit}
                  isSelected={selectedCommitId === commit.id}
                  isTip={isTip}
                  onSelect={handleSelectCommit}
                />
              );
            })}
          </ul>
        )}

        {hasMore ? (
          <div className="px-2 py-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => void handleLoadMore()}
              disabled={loading || loadingMore}
            >
              {loadingMore ? t("common.loading") : t("repo.loadMore")}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
