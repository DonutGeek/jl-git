import {
  Suspense,
  lazy,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type SyntheticEvent,
} from "react";
import { useTranslation } from "react-i18next";
import dayjs from "dayjs";
import {
  ArrowDownWideNarrow,
  ArrowUp,
  Check,
  ChevronDown,
  Circle,
  GitCommitHorizontal,
  Loader2,
  MoreHorizontal,
  Search,
  SearchX,
  SlidersHorizontal,
  Tag,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CommitAuthorAvatars } from "@/components/git/CommitAuthorAvatars";
import { cn } from "@/lib/utils";

import { useRepoStore } from "@/store/useRepoStore";

import { toUserMessage } from "@/types/error";
import { GitCommitSummary } from "@/types/git";

import { copyToClipboard } from "@/utils/clipboard";

type DatePreset = "all" | "7d" | "30d" | "90d";

const HISTORY_GRAPH_WIDTH_STORAGE_KEY = "jlgit:history-graph-width:v3";
/** 单列图谱略留边距；复杂分支可再拖宽 */
const HISTORY_GRAPH_DEFAULT_WIDTH = 52;
const HISTORY_GRAPH_MIN_WIDTH = 40;
const HISTORY_GRAPH_MAX_WIDTH = 320;
/**
 * 历史列表水平间隙（左右同宽）。
 * 滚动条悬停才出现，不为滚动条额外加宽右侧。
 */
const HISTORY_EDGE_GAP_PX = 8;

function readHistoryGraphWidth(): number {
  try {
    const value = Number(localStorage.getItem(HISTORY_GRAPH_WIDTH_STORAGE_KEY));
    if (Number.isFinite(value) && value >= HISTORY_GRAPH_MIN_WIDTH && value <= HISTORY_GRAPH_MAX_WIDTH) {
      return value;
    }
  } catch {
    // 存储不可用时使用默认宽度
  }
  return HISTORY_GRAPH_DEFAULT_WIDTH;
}

const HistoryGraph = lazy(async () => {
  const module = await import("@/components/git/HistoryGraph");
  return { default: module.HistoryGraph };
});

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
          className="text-muted-foreground hover:text-foreground inline-block w-[58px] shrink-0 cursor-pointer border-b border-transparent pb-px text-right font-mono text-xs leading-none hover:border-current"
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
      <TooltipContent>
        {copied ? t("repo.copySuccess") : t("repo.copy")}
      </TooltipContent>
    </Tooltip>
  );
}

interface HistoryCommitRowProps {
  commit: GitCommitSummary;
  isSelected: boolean;
  /** 图谱悬停同步高亮（未选中时） */
  isHovered: boolean;
  isTip: boolean;
  onSelect: (commitId: string) => void;
}

/** 单行提交：memo 避免选中变化时整表重绘 */
const HistoryCommitRow = memo(function HistoryCommitRow({
  commit,
  isSelected,
  isHovered,
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
          // 不在整行 overflow-hidden，否则右侧 hash 悬停下划线会被裁掉
          "flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-md border-0 px-2 py-1.5 text-left shadow-none transition-colors duration-150",
          isSelected
            ? "bg-primary/15 text-foreground hover:bg-primary/20"
            : isHovered
              ? "bg-muted text-foreground"
              : "hover:bg-accent/60 text-foreground",
        )}
        onClick={() => onSelect(commit.id)}
      >
        {/* 文案区可收缩；过长只省略 subject，右侧时间/作者/hash 固定 */}
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
          {/* 当前分支 tip：空心圆，对齐参考客户端 HEAD 标记 */}
          {isTip ? (
            <Circle
              className="text-primary size-3 shrink-0 stroke-[2.5]"
              aria-hidden="true"
            />
          ) : (
            <span className="size-3 shrink-0" aria-hidden="true" />
          )}
          <span className="min-w-0 flex-1 truncate text-sm" title={commit.subject}>
            {commit.subject}
          </span>
          {primaryRef ? (
            <span
              className="text-primary inline-flex max-w-[7.5rem] shrink-0 items-center gap-1 overflow-hidden"
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

        <div className="text-muted-foreground flex w-[108px] shrink-0 items-center gap-1.5 overflow-hidden">
          <CommitAuthorAvatars
            authorName={commit.authorName}
            authorEmail={commit.authorEmail ?? ""}
            coAuthors={commit.coAuthors ?? []}
          />
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
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [query, setQuery] = useState("");
  const [author, setAuthor] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [branchScope, setBranchScope] = useState<"all" | string>("all");
  const [graphWidth, setGraphWidth] = useState(readHistoryGraphWidth);
  const [draggingGraphDivider, setDraggingGraphDivider] = useState(false);
  /** 图谱圆点悬停 → 同步高亮对应历史行 */
  const [hoveredCommitId, setHoveredCommitId] = useState<string | null>(null);
  const historyScrollRef = useRef<HTMLDivElement>(null);
  /** 历史列视口：用于拖拽宽度计算；分隔线挂在此层以保证视口等高 */
  const historyPaneRef = useRef<HTMLDivElement>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);

  const selectedCommitId = useRepoStore((state) => state.selectedCommitId);
  const selectedCommitDetail = useRepoStore((state) => state.selectedCommitDetail);
  const detailLoading = useRepoStore((state) => state.detailLoading);
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
   * - 已有选中且仍在列表中 → 保留；若详情缺失则补拉（切仓会话还原常见）
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
      if (
        selectedCommitDetail?.id !== selectedCommitId &&
        !detailLoading &&
        selectedCommitId
      ) {
        void selectCommit(selectedCommitId).catch((error: unknown) => {
          toast.error(toUserMessage(error));
        });
      }
      return;
    }

    const firstId = commits[0]?.id;
    if (firstId) {
      void selectCommit(firstId).catch((error: unknown) => {
        toast.error(toUserMessage(error));
      });
    }
  }, [
    commits,
    detailLoading,
    loading,
    selectCommit,
    selectedCommitDetail?.id,
    selectedCommitId,
  ]);

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

  const hasActiveFilters =
    query.trim().length > 0 ||
    author !== null ||
    datePreset !== "all" ||
    branchScope !== "all";

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_GRAPH_WIDTH_STORAGE_KEY, String(graphWidth));
    } catch {
      // 存储不可用不影响拖拽体验
    }
  }, [graphWidth]);

  const handleLoadMore = useCallback(async (): Promise<void> => {
    if (!hasMore || loading || loadingMoreRef.current) {
      return;
    }

    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadMoreFailed(false);

    try {
      await loadMoreLog();
    } catch (error) {
      setLoadMoreFailed(true);
      toast.error(toUserMessage(error));
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, loadMoreLog, loading]);

  useEffect(() => {
    if (
      !hasMore ||
      loading ||
      loadingMore ||
      loadMoreFailed ||
      hasActiveFilters ||
      !historyScrollRef.current ||
      !loadMoreSentinelRef.current
    ) {
      return;
    }

    const viewport = historyScrollRef.current.querySelector(
      "[data-radix-scroll-area-viewport]",
    );
    if (!(viewport instanceof HTMLElement)) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void handleLoadMore();
        }
      },
      {
        root: viewport,
        rootMargin: "0px 0px 240px",
      },
    );

    observer.observe(loadMoreSentinelRef.current);
    return () => observer.disconnect();
  }, [
    filteredCommits.length,
    hasActiveFilters,
    hasMore,
    handleLoadMore,
    loadMoreFailed,
    loading,
    loadingMore,
  ]);

  useEffect(() => {
    const viewport = historyScrollRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]",
    );
    if (!(viewport instanceof HTMLElement)) {
      return;
    }
    const scrollViewport = viewport;

    function updateBackToTopVisibility(): void {
      const nextVisible = scrollViewport.scrollTop > 320;
      setShowBackToTop((visible) => (visible === nextVisible ? visible : nextVisible));
    }

    updateBackToTopVisibility();
    scrollViewport.addEventListener("scroll", updateBackToTopVisibility, { passive: true });
    return () => scrollViewport.removeEventListener("scroll", updateBackToTopVisibility);
  }, [commits.length, filteredCommits.length]);

  function scrollHistoryToTop(): void {
    const viewport = historyScrollRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]",
    );
    if (viewport instanceof HTMLElement) {
      viewport.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function clampGraphWidth(nextWidth: number): number {
    const paneWidth = historyPaneRef.current?.getBoundingClientRect().width ?? 0;
    const maxByPane = paneWidth > 0 ? Math.max(HISTORY_GRAPH_MIN_WIDTH, paneWidth - 300) : HISTORY_GRAPH_MAX_WIDTH;
    return Math.min(Math.min(HISTORY_GRAPH_MAX_WIDTH, maxByPane), Math.max(HISTORY_GRAPH_MIN_WIDTH, nextWidth));
  }

  function updateGraphWidth(clientX: number): void {
    const rect = historyPaneRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    // 分隔线在「左边距 + graphWidth」处，宽度不含左侧留白
    setGraphWidth(clampGraphWidth(clientX - rect.left - HISTORY_EDGE_GAP_PX));
  }

  function handleGraphDividerPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingGraphDivider(true);
    updateGraphWidth(event.clientX);
  }

  function handleGraphDividerPointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!draggingGraphDivider) {
      return;
    }
    updateGraphWidth(event.clientX);
  }

  function handleGraphDividerPointerEnd(event: ReactPointerEvent<HTMLDivElement>): void {
    setDraggingGraphDivider(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleGraphDividerKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    setGraphWidth((width) => clampGraphWidth(width + (event.key === "ArrowLeft" ? -16 : 16)));
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
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
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
              className="h-7 max-w-[140px] gap-1 px-2 text-xs font-normal shadow-none"
            >
              <span className="min-w-0 truncate">{branchLabel}</span>
              <ChevronDown className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56 p-0">
            <ScrollArea className="max-h-72">
              <div className="p-1">
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
              </div>
            </ScrollArea>
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
            className="h-7 pr-8 pl-7 text-xs shadow-none"
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
                "h-7 max-w-[120px] gap-1 px-2 text-xs font-normal shadow-none",
                author && "bg-primary/10 text-primary border-transparent",
              )}
            >
              <span className="min-w-0 truncate">{authorLabel}</span>
              <ChevronDown className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48 p-0">
            <ScrollArea className="max-h-72">
              <div className="p-1">
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
              </div>
            </ScrollArea>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                "h-7 gap-1 px-2 text-xs font-normal shadow-none",
                datePreset !== "all" && "bg-primary/10 text-primary border-transparent",
              )}
            >
              <span>{dateLabel}</span>
              <ChevronDown className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-40">
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

      <div
        ref={historyPaneRef}
        className="relative min-h-0 min-w-0 flex-1 overflow-hidden"
      >
        <ScrollArea
          ref={historyScrollRef}
          // Radix viewport 内层 display:table 会撑开宽度导致 truncate 失效；在用法处覆盖，不改 ui/scroll-area
          // 水平留白由 ul 控制（左右同宽），滚动条悬停叠加，不单独加宽右侧
          className="h-full w-full [&_[data-slot=scroll-area-viewport]>div]:!block [&_[data-slot=scroll-area-viewport]>div]:!min-w-0 [&_[data-slot=scroll-area-viewport]>div]:w-full"
        >
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
          <div className="relative">
            {!hasActiveFilters ? (
              <Suspense fallback={null}>
                <HistoryGraph
                  commits={commits}
                  width={graphWidth}
                  edgeGap={HISTORY_EDGE_GAP_PX}
                  onHoverCommit={setHoveredCommitId}
                  onSelectCommit={handleSelectCommit}
                />
              </Suspense>
            ) : null}

            <ul
              className="relative w-full min-w-0 py-1.5"
              style={
                hasActiveFilters
                  ? {
                      paddingLeft: HISTORY_EDGE_GAP_PX,
                      paddingRight: HISTORY_EDGE_GAP_PX,
                    }
                  : {
                      // 左边距 + 图谱 + 间隙 | 行 | 同宽右间隙
                      paddingLeft: HISTORY_EDGE_GAP_PX + graphWidth + HISTORY_EDGE_GAP_PX,
                      paddingRight: HISTORY_EDGE_GAP_PX,
                    }
              }
              role="listbox"
              aria-label={t("repo.history")}
            >
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
                    isHovered={hoveredCommitId === commit.id}
                    isTip={isTip}
                    onSelect={handleSelectCommit}
                  />
                );
              })}
            </ul>
          </div>
        )}

        {hasMore ? (
          <div
            ref={loadMoreSentinelRef}
            className="flex min-h-10 items-center justify-center gap-2 px-2 py-3"
            aria-live="polite"
          >
            {loadingMore ? (
              <>
                <Loader2
                  className="text-muted-foreground size-3.5 shrink-0 animate-spin"
                  aria-hidden="true"
                />
                <span className="text-muted-foreground text-xs">{t("repo.historyLoadingMore")}</span>
              </>
            ) : hasActiveFilters || loadMoreFailed ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => void handleLoadMore()}
                disabled={loading}
              >
                {t("repo.loadMore")}
              </Button>
            ) : (
              <span className="text-muted-foreground/80 text-xs">{t("repo.historyLoadMoreHint")}</span>
            )}
          </div>
        ) : null}
        </ScrollArea>

        {/*
         * 分隔线挂在滚动视口外，始终占满历史列高度（一根长线），
         * 样式与 SplitPane / ResizableHandle 一致：默认 border，悬停/拖拽 primary。
         */}
        {!hasActiveFilters && filteredCommits.length > 0 ? (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-valuemin={HISTORY_GRAPH_MIN_WIDTH}
            aria-valuemax={HISTORY_GRAPH_MAX_WIDTH}
            aria-valuenow={Math.round(graphWidth)}
            tabIndex={0}
            className={cn(
              "absolute inset-y-0 z-20 w-1.5 cursor-col-resize bg-transparent",
              "before:bg-border before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:transition-[background-color,width]",
              "after:absolute after:inset-y-0 after:left-1/2 after:w-3 after:-translate-x-1/2",
              "hover:before:bg-primary hover:before:w-0.5",
              "focus-visible:ring-ring focus-visible:ring-1 focus-visible:outline-none",
              draggingGraphDivider && "before:bg-primary before:w-0.5",
            )}
            style={{ left: `${HISTORY_EDGE_GAP_PX + graphWidth}px` }}
            onPointerDown={handleGraphDividerPointerDown}
            onPointerMove={handleGraphDividerPointerMove}
            onPointerUp={handleGraphDividerPointerEnd}
            onPointerCancel={handleGraphDividerPointerEnd}
            onKeyDown={handleGraphDividerKeyDown}
          />
        ) : null}

        {showBackToTop ? (
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute right-3 bottom-3 z-10 size-10 rounded-full"
                aria-label={t("repo.backToTop")}
                onClick={scrollHistoryToTop}
              >
                <ArrowUp className="size-4" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">{t("repo.backToTop")}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
    </div>
  );
}
