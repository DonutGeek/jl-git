import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type SyntheticEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import dayjs from "dayjs";
import {
  ArrowDownWideNarrow,
  ArrowUp,
  Check,
  ChevronDown,
  Circle,
  GitCommitHorizontal,
  MoreHorizontal,
  Search,
  SearchX,
} from "lucide-react";
import { usePanelRef } from "react-resizable-panels";
import { toast } from "sonner";

import { DropdownMenuScrollArea } from "@/components/common/DropdownMenuScrollArea";
import { TRUNCATE_BUDGET_ATTR } from "@/components/common/TruncateStartPath";
import { CommitAuthorAvatars } from "@/components/git/CommitAuthorAvatars";
import { GitRefTag } from "@/components/git/GitRefTag";
import { HistoryAdvancedFilterPopover } from "@/components/git/HistoryAdvancedFilterPopover";
import { HistoryCommitContextMenu } from "@/components/git/HistoryCommitContextMenu";
import { HistoryGraph } from "@/components/git/HistoryGraph";
import { useHistoryWorkspace } from "@/components/git/HistoryWorkspaceContext";
import { RESIZABLE_HANDLE_CLASSNAME } from "@/components/layout/ResizableSplit";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useScrollAreaViewport } from "@/hooks/useScrollAreaViewport";
import { cn } from "@/lib/utils";

import { useProjectStore } from "@/store/useProjectStore";
import { useRepoStore } from "@/store/useRepoStore";

import { openBranchHistoryWindow } from "@/services/window/historyWindows";

import { toUserMessage } from "@/types/error";
import type { GitCommitSummary, GitLogOrder } from "@/types/git";

import { copyToClipboard } from "@/utils/clipboard";

type DatePreset = "all" | "7d" | "30d" | "90d";

/** 图谱列宽（稳定 key；读时做范围校验，无需 :vN） */
const HISTORY_GRAPH_WIDTH_STORAGE_KEY = "jlgit:history-graph-width";
/** 历史列表「更多」视图开关 */
const HISTORY_VIEW_PREFS_STORAGE_KEY = "jlgit:history-view-prefs";
/** 图谱列默认=最小宽；多 lane 时横滑或拖分隔线加宽 */
const HISTORY_GRAPH_MIN_WIDTH = 48;
const HISTORY_GRAPH_DEFAULT_WIDTH = HISTORY_GRAPH_MIN_WIDTH;
const HISTORY_GRAPH_MAX_WIDTH = 320;
/**
 * 历史列表水平间隙（左右同宽）。
 * 滚动条悬停才出现，不为滚动条额外加宽右侧。
 */
const HISTORY_EDGE_GAP_PX = 8;
/** 与 HistoryGraph commit.spacing 对齐 */
const HISTORY_ROW_HEIGHT_PX = 32;
/** 列表上下内边距（与 py-1.5 一致，供虚拟列表 padding） */
const HISTORY_LIST_PAD_Y_PX = 6;
const HISTORY_VIRTUAL_OVERSCAN = 12;
/** 列表短 hash 展示 7 位（Git 常用 abbrev） */
const HISTORY_HASH_DISPLAY_LEN = 7;

interface HistoryViewPrefs {
  /** 展示合并提交（关闭则从列表隐藏） */
  showMergeCommits: boolean;
  /** 展示远程分支标签（关闭则标签中去掉 origin&…） */
  showRemoteBranches: boolean;
  /** 展开分支名（关闭则超出省略） */
  expandBranchNames: boolean;
  /** 分支标签放到行最左侧（subject 之前） */
  branchOnLeft: boolean;
}

const DEFAULT_HISTORY_VIEW_PREFS: HistoryViewPrefs = {
  showMergeCommits: true,
  showRemoteBranches: true,
  expandBranchNames: false,
  branchOnLeft: true,
};

function readHistoryGraphWidth(): number {
  try {
    const value = Number(localStorage.getItem(HISTORY_GRAPH_WIDTH_STORAGE_KEY));
    if (
      Number.isFinite(value) &&
      value >= HISTORY_GRAPH_MIN_WIDTH &&
      value <= HISTORY_GRAPH_MAX_WIDTH
    ) {
      return value;
    }
  } catch {
    // 存储不可用时使用默认宽度
  }
  return HISTORY_GRAPH_DEFAULT_WIDTH;
}

function readHistoryViewPrefs(): HistoryViewPrefs {
  try {
    const raw = localStorage.getItem(HISTORY_VIEW_PREFS_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_HISTORY_VIEW_PREFS;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return DEFAULT_HISTORY_VIEW_PREFS;
    }
    const record = parsed as Record<string, unknown>;
    return {
      showMergeCommits:
        typeof record.showMergeCommits === "boolean"
          ? record.showMergeCommits
          : DEFAULT_HISTORY_VIEW_PREFS.showMergeCommits,
      showRemoteBranches:
        typeof record.showRemoteBranches === "boolean"
          ? record.showRemoteBranches
          : DEFAULT_HISTORY_VIEW_PREFS.showRemoteBranches,
      expandBranchNames:
        typeof record.expandBranchNames === "boolean"
          ? record.expandBranchNames
          : DEFAULT_HISTORY_VIEW_PREFS.expandBranchNames,
      branchOnLeft:
        typeof record.branchOnLeft === "boolean"
          ? record.branchOnLeft
          : DEFAULT_HISTORY_VIEW_PREFS.branchOnLeft,
    };
  } catch {
    return DEFAULT_HISTORY_VIEW_PREFS;
  }
}

/** 远端 decoration 形如 origin&main */
function isRemoteHistoryRef(ref: string): boolean {
  return ref.includes("&");
}

function filterVisibleHistoryRefs(refs: string[], showRemoteBranches: boolean): string[] {
  if (showRemoteBranches) {
    return refs;
  }
  return refs.filter((ref) => !isRemoteHistoryRef(ref));
}

interface CopyableHashProps {
  fullId: string;
}

/** 短 hash（7 位）：悬停提示复制，点击写入剪贴板 */
function CopyableHash({ fullId }: CopyableHashProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const displayHash = fullId.slice(0, HISTORY_HASH_DISPLAY_LEN);

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
          // 7ch 固定列宽，避免窄面板把 hash 裁成省略号；右侧留一点给悬停下划线
          className="text-muted-foreground hover:text-foreground inline-block w-[7ch] shrink-0 cursor-pointer border-b border-transparent pb-px pr-0.5 text-right font-mono text-xs leading-none tabular-nums hover:border-current"
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
          {displayHash}
        </span>
      </TooltipTrigger>
      <TooltipContent>{copied ? t("repo.copySuccess") : t("repo.copy")}</TooltipContent>
    </Tooltip>
  );
}

interface HistoryCommitRowProps {
  commit: GitCommitSummary;
  isSelected: boolean;
  /** 图谱悬停同步高亮（未选中时） */
  isHovered: boolean;
  /** 当前检出分支 tip：行内空心圆标记（不占非 tip 行的空白列） */
  isTip: boolean;
  /** 是否为当前 HEAD（可修改提交信息） */
  isHead: boolean;
  /** HEAD 是否已无本地超前（改写需确认） */
  alreadyPushed: boolean;
  /** 行内展示的 refs（已按「远程分支」开关过滤） */
  visibleRefs: string[];
  expandBranchNames: boolean;
  branchOnLeft: boolean;
  onSelect: (commitId: string) => void;
  /** 虚拟列表绝对定位样式 */
  className?: string;
  style?: CSSProperties;
}

interface HistoryBranchLabelProps {
  refs: string[];
  expandBranchNames: boolean;
}

/**
 * 列表行分支徽章：
 * - 未展开：空间够则全文，不够才前省略；悬停看全部 refs
 * - 展开：强制全量不省略；有 +N 时悬停可看其余
 */
function HistoryBranchLabel({ refs, expandBranchNames }: HistoryBranchLabelProps) {
  const primaryRef = refs[0] ?? null;
  if (!primaryRef) {
    return null;
  }
  const extraRefCount = Math.max(0, refs.length - 1);

  const refsTooltip = (
    <div className="flex flex-col items-start gap-1">
      {refs.map((refName) => (
        <GitRefTag
          key={refName}
          label={refName}
          expand
          showHoverTooltip={false}
          className="bg-muted"
        />
      ))}
    </div>
  );

  return (
    <GitRefTag
      label={primaryRef}
      extraCount={extraRefCount}
      tooltipContent={refsTooltip}
      expand={expandBranchNames}
    />
  );
}

/** 单行提交：memo 避免选中变化时整表重绘 */
const HistoryCommitRow = memo(function HistoryCommitRow({
  commit,
  isSelected,
  isHovered,
  isTip,
  isHead,
  alreadyPushed,
  visibleRefs,
  expandBranchNames,
  branchOnLeft,
  onSelect,
  className,
  style,
}: HistoryCommitRowProps) {
  const authoredLabel = useMemo(
    () => dayjs(commit.authoredAt).format("YYYY-MM-DD HH:mm:ss"),
    [commit.authoredAt],
  );
  /** 合并提交：说明弱化，降低噪声（对齐参考端灰字） */
  const isMergeCommit = commit.parentIds.length > 1;
  const hasBranchLabel = visibleRefs.length > 0;
  const branchLabel = hasBranchLabel ? (
    <HistoryBranchLabel refs={visibleRefs} expandBranchNames={expandBranchNames} />
  ) : null;

  /**
   * 文案区布局契约：
   * - 说明与标签紧挨；空白只出现在「标签之后～时间列之前」（透明，不是灰底拉满）
   * - 折叠：标签槽提供预算宽，药丸 w-max，够则全文、不够才前省略
   * - 展开：标签 shrink-0 全文；说明 truncate 让位
   */
  const branchSlotClassName = expandBranchNames
    ? "shrink-0"
    : branchOnLeft
      ? "min-w-0 max-w-[40%] shrink"
      : // 右+折叠：吃剩余宽；保底宽度避免长说明把预算挤没
        "min-w-[7rem] flex-1";

  const subjectClassName = cn(
    "min-w-0 truncate text-xs leading-none",
    !hasBranchLabel
      ? "flex-1"
      : expandBranchNames
        ? branchOnLeft
          ? "min-w-[3rem] flex-1"
          : "min-w-[3rem] shrink"
        : branchOnLeft
          ? "min-w-0 flex-1"
          : // 右+折叠：说明最多一半，保证标签槽有预算；短说明仍随内容宽（max 不是 width）
            "min-w-0 max-w-[50%] shrink",
    isMergeCommit && "text-muted-foreground",
  );

  const branchSlot = branchLabel ? (
    <span
      className={branchSlotClassName}
      {...(!expandBranchNames ? { [TRUNCATE_BUDGET_ATTR]: true as const } : {})}
    >
      {branchLabel}
    </span>
  ) : null;

  return (
    <HistoryCommitContextMenu
      commit={commit}
      isHead={isHead}
      alreadyPushed={alreadyPushed}
      onMenuOpen={() => onSelect(commit.id)}
    >
      <li className={cn("border-0", className)} style={{ height: HISTORY_ROW_HEIGHT_PX, ...style }}>
        <button
          type="button"
          role="option"
          aria-selected={isSelected}
          className={cn(
            // 固定四列：文案 | 时间 | 作者 | hash；作者约 avatar+短名（5.5rem），避免与 hash 间大空档
            "grid h-full w-full min-w-0 cursor-pointer grid-cols-[minmax(0,1fr)_138px_5.5rem_7ch] items-center gap-1.5 rounded-md border-0 px-2 text-left shadow-none transition-colors duration-150",
            isSelected
              ? "bg-primary/15 text-foreground hover:bg-primary/20"
              : isHovered
                ? "bg-muted text-foreground"
                : "hover:bg-accent/60 text-foreground",
          )}
          onClick={() => onSelect(commit.id)}
        >
          <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
            {/* 仅 tip 行显示空心圆；非 tip 不占位，避免出现「圈下面一整列空白」 */}
            {isTip ? (
              <Circle className="text-primary size-3 shrink-0 stroke-[2.5]" aria-hidden="true" />
            ) : null}
            {branchOnLeft ? branchSlot : null}
            <span className={subjectClassName} title={commit.subject}>
              {commit.subject}
            </span>
            {!branchOnLeft ? branchSlot : null}
          </div>

          <span className="text-muted-foreground truncate font-mono text-[11px] leading-none tabular-nums">
            {authoredLabel}
          </span>

          <div className="text-muted-foreground flex min-w-0 items-center gap-1 overflow-hidden">
            <CommitAuthorAvatars
              authorName={commit.authorName}
              authorEmail={commit.authorEmail ?? ""}
              coAuthors={commit.coAuthors ?? []}
            />
            <span className="min-w-0 truncate text-xs leading-none" title={commit.authorName}>
              {commit.authorName}
            </span>
          </div>

          <CopyableHash fullId={commit.id} />
        </button>
      </li>
    </HistoryCommitContextMenu>
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
  const logRef = useRepoStore((state) => state.logRef);
  const logOrder = useRepoStore((state) => state.logOrder);
  const selectLogRef = useRepoStore((state) => state.selectLogRef);
  const setLogOrder = useRepoStore((state) => state.setLogOrder);
  const historyAdvanced = useRepoStore((state) => state.historyAdvanced);
  const applyHistoryAdvanced = useRepoStore((state) => state.applyHistoryAdvanced);
  const clearHistoryAdvanced = useRepoStore((state) => state.clearHistoryAdvanced);
  const { allowOpenInNewWindow } = useHistoryWorkspace();

  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [query, setQuery] = useState("");
  /** 分支范围下拉内筛选 */
  const [branchMenuFilter, setBranchMenuFilter] = useState("");
  /** 用户下拉内筛选 */
  const [authorMenuFilter, setAuthorMenuFilter] = useState("");
  const [author, setAuthor] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [viewPrefs, setViewPrefs] = useState<HistoryViewPrefs>(readHistoryViewPrefs);
  /** 与列表纵向滚动同步，供视口内图谱层 translateY */
  const [graphScrollTop, setGraphScrollTop] = useState(0);
  /** SVG 内容宽度：撑开列内横向 ScrollArea，不改变列宽 */
  const [graphContentWidth, setGraphContentWidth] = useState(0);
  /** 图谱圆点悬停 → 同步高亮对应历史行 */
  const [hoveredCommitId, setHoveredCommitId] = useState<string | null>(null);
  const { viewport: historyViewport, bindScrollArea } = useScrollAreaViewport();
  const graphPanelRef = usePanelRef();
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);

  const selectedCommitId = useRepoStore((state) => state.selectedCommitId);
  const selectedCommitDetail = useRepoStore((state) => state.selectedCommitDetail);
  const detailLoading = useRepoStore((state) => state.detailLoading);
  const selectCommit = useRepoStore((state) => state.selectCommit);
  const currentBranch = status?.branch ?? null;
  /** 历史「当前分支」范围：检出分支名；游离 HEAD 时用 HEAD */
  const currentBranchLogRef = status?.detached ? "HEAD" : currentBranch;
  /** 当前 HEAD tip 短 hash，用于判断可否修改提交信息 */
  const headTipShortId = useMemo(() => {
    const current = branches.find((branch) => branch.isCurrent);
    const tip = current?.tipShortId?.trim();
    return tip || null;
  }, [branches]);
  /** ahead=0 且有上游时，改写 HEAD 需确认（可能已推送） */
  const alreadyPushed = (status?.ahead ?? 0) <= 0 && Boolean(status?.upstream);
  /** 历史范围下拉：本地在上 + origin/ 远端（此前误只列本地） */
  const historyScopeBranches = useMemo(() => {
    const byName = (left: (typeof branches)[number], right: (typeof branches)[number]) =>
      left.name.localeCompare(right.name);
    const local = branches.filter((branch) => !branch.isRemote).sort(byName);
    const originRemote = branches
      .filter((branch) => branch.isRemote && branch.name.startsWith("origin/"))
      .sort(byName);
    return [...local, ...originRemote];
  }, [branches]);

  const branchMenuFilterNormalized = branchMenuFilter.trim().toLowerCase();
  const filteredScopeBranches = useMemo(() => {
    if (!branchMenuFilterNormalized) {
      return historyScopeBranches;
    }
    return historyScopeBranches.filter((branch) =>
      branch.name.toLowerCase().includes(branchMenuFilterNormalized),
    );
  }, [historyScopeBranches, branchMenuFilterNormalized]);

  const showCurrentBranchItem =
    !branchMenuFilterNormalized ||
    t("repo.historyCurrentBranch").toLowerCase().includes(branchMenuFilterNormalized);
  const showAllBranchesItem =
    !branchMenuFilterNormalized ||
    t("repo.historyAllBranches").toLowerCase().includes(branchMenuFilterNormalized);

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
      selectedCommitId != null && commits.some((commit) => commit.id === selectedCommitId);

    if (stillValid) {
      if (selectedCommitDetail?.id !== selectedCommitId && !detailLoading && selectedCommitId) {
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
  }, [commits, detailLoading, loading, selectCommit, selectedCommitDetail?.id, selectedCommitId]);

  const authors = useMemo(() => {
    const names = new Set<string>();
    for (const commit of commits) {
      if (commit.authorName) {
        names.add(commit.authorName);
      }
    }
    return [...names].sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [commits]);

  const authorMenuFilterNormalized = authorMenuFilter.trim().toLowerCase();
  const filteredAuthors = useMemo(() => {
    if (!authorMenuFilterNormalized) {
      return authors;
    }
    return authors.filter((name) => name.toLowerCase().includes(authorMenuFilterNormalized));
  }, [authors, authorMenuFilterNormalized]);

  const showAllAuthorsItem =
    !authorMenuFilterNormalized ||
    t("repo.historyAuthorAll").toLowerCase().includes(authorMenuFilterNormalized);

  const filteredCommits = useMemo(() => {
    return commits.filter((commit) => {
      if (!viewPrefs.showMergeCommits && commit.parentIds.length > 1) {
        return false;
      }
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
  }, [commits, author, datePreset, query, viewPrefs.showMergeCommits]);

  const hasClientFilters =
    query.trim().length > 0 ||
    author !== null ||
    datePreset !== "all" ||
    !viewPrefs.showMergeCommits;

  /**
   * 日期窗已越过：newest-first 下最旧已加载提交若已不在窗内，
   * 继续翻页不可能再命中，必须停止（否则短列表哨兵常驻会无限加载）。
   */
  const dateFilterExhausted =
    datePreset !== "all" &&
    commits.length > 0 &&
    !matchesDate(commits[commits.length - 1], datePreset);

  /** 作者/关键词等：连续翻页未增加可见行则停止 */
  const [filterLoadExhausted, setFilterLoadExhausted] = useState(false);

  useEffect(() => {
    setFilterLoadExhausted(false);
  }, [query, author, datePreset, logRef, viewPrefs.showMergeCommits]);

  const shouldAutoLoadMore =
    hasMore && !dateFilterExhausted && !filterLoadExhausted && !loadMoreFailed;

  const commitVirtualizer = useVirtualizer({
    count: filteredCommits.length,
    getScrollElement: () => historyViewport,
    estimateSize: () => HISTORY_ROW_HEIGHT_PX,
    overscan: HISTORY_VIRTUAL_OVERSCAN,
    paddingStart: HISTORY_LIST_PAD_Y_PX,
    paddingEnd: HISTORY_LIST_PAD_Y_PX,
    getItemKey: (index) => filteredCommits[index]?.id ?? index,
  });

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_VIEW_PREFS_STORAGE_KEY, JSON.stringify(viewPrefs));
    } catch {
      // 存储不可用不影响视图开关
    }
  }, [viewPrefs]);

  function persistGraphWidthPx(widthPx: number): void {
    const next = Math.min(
      HISTORY_GRAPH_MAX_WIDTH,
      Math.max(HISTORY_GRAPH_MIN_WIDTH, Math.round(widthPx)),
    );
    try {
      localStorage.setItem(HISTORY_GRAPH_WIDTH_STORAGE_KEY, String(next));
    } catch {
      // 存储不可用不影响拖拽体验
    }
  }

  function toggleViewPref(key: keyof HistoryViewPrefs): void {
    setViewPrefs((current) => ({ ...current, [key]: !current[key] }));
  }

  // 列表/筛选结果变化时重置内容宽，避免沿用上一页 SVG 宽度
  useEffect(() => {
    setGraphContentWidth(0);
  }, [filteredCommits]);

  /**
   * 筛选/翻页后浏览器可能把 scrollTop 钳回 0，但 graphScrollTop state 不会自动变；
   * 若不立刻同步，translateY 会把图谱整体错位到列表上方。
   */
  useEffect(() => {
    if (historyViewport) {
      setGraphScrollTop(historyViewport.scrollTop);
      return;
    }
    setGraphScrollTop(0);
  }, [commits.length, filteredCommits, historyViewport]);

  const handleLoadMore = useCallback(async (): Promise<void> => {
    if (
      !hasMore ||
      loading ||
      loadingMoreRef.current ||
      dateFilterExhausted ||
      filterLoadExhausted
    ) {
      return;
    }

    const filteredBefore = filteredCommits.length;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadMoreFailed(false);

    try {
      await loadMoreLog();
      const nextCommits = useRepoStore.getState().commits;
      const oldest = nextCommits[nextCommits.length - 1];
      if (datePreset !== "all" && oldest && !matchesDate(oldest, datePreset)) {
        setFilterLoadExhausted(true);
        return;
      }
      if (hasClientFilters) {
        const filteredAfter = nextCommits.filter((commit) => {
          if (!viewPrefs.showMergeCommits && commit.parentIds.length > 1) {
            return false;
          }
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
        }).length;
        // 本页未贡献任何可见行：短列表下哨兵仍在视口，停止以免空转
        if (filteredAfter <= filteredBefore) {
          setFilterLoadExhausted(true);
        }
      }
    } catch (error) {
      setLoadMoreFailed(true);
      toast.error(toUserMessage(error));
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [
    author,
    dateFilterExhausted,
    datePreset,
    filterLoadExhausted,
    filteredCommits.length,
    hasClientFilters,
    hasMore,
    loadMoreLog,
    loading,
    query,
    viewPrefs.showMergeCommits,
  ]);

  useEffect(() => {
    if (
      !shouldAutoLoadMore ||
      loading ||
      loadingMore ||
      !historyViewport ||
      !loadMoreSentinelRef.current
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void handleLoadMore();
        }
      },
      {
        root: historyViewport,
        rootMargin: "0px 0px 240px",
      },
    );

    observer.observe(loadMoreSentinelRef.current);
    return () => observer.disconnect();
  }, [
    filteredCommits.length,
    handleLoadMore,
    historyViewport,
    loading,
    loadingMore,
    shouldAutoLoadMore,
  ]);

  useEffect(() => {
    if (!historyViewport) {
      return;
    }
    const scrollViewport = historyViewport;

    function onHistoryScroll(): void {
      setGraphScrollTop(scrollViewport.scrollTop);
      const nextVisible = scrollViewport.scrollTop > 320;
      setShowBackToTop((visible) => (visible === nextVisible ? visible : nextVisible));
    }

    onHistoryScroll();
    scrollViewport.addEventListener("scroll", onHistoryScroll, { passive: true });
    return () => scrollViewport.removeEventListener("scroll", onHistoryScroll);
  }, [commits.length, filteredCommits.length, historyViewport]);

  /** 图谱列上纵向滚轮转发给列表，避免悬停图谱时只能横滑 */
  function handleGraphColumnWheel(event: ReactWheelEvent<HTMLDivElement>): void {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
      return;
    }
    if (!historyViewport) {
      return;
    }
    historyViewport.scrollTop += event.deltaY;
  }

  function scrollHistoryToTop(): void {
    historyViewport?.scrollTo({ top: 0, behavior: "smooth" });
  }

  function writeShowMergeCommitsPrefs(value: boolean): void {
    setViewPrefs((prev) => {
      const next = { ...prev, showMergeCommits: value };
      try {
        localStorage.setItem(HISTORY_VIEW_PREFS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const isCurrentBranchScope = currentBranchLogRef != null && logRef === currentBranchLogRef;
  const branchLabel =
    logRef == null
      ? t("repo.historyAllBranches")
      : isCurrentBranchScope
        ? t("repo.historyCurrentBranch")
        : logRef;
  const authorLabel = author ?? t("repo.historyAuthor");
  const dateLabel =
    datePreset === "all"
      ? t("repo.historyDate")
      : datePreset === "7d"
        ? t("repo.historyDate7d")
        : datePreset === "30d"
          ? t("repo.historyDate30d")
          : t("repo.historyDate90d");

  // absolute 行不受 padding 约束；列表已在右侧 Panel 内，仅留左右边距
  const commitRowLeft = HISTORY_EDGE_GAP_PX;
  const commitRowRight = HISTORY_EDGE_GAP_PX + 4;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      {/* 筛选条：左=范围+搜索+用户/日期；右=排序/更多 */}
      <div
        className="border-border flex h-11 shrink-0 items-center gap-1.5 border-b px-2"
        role="toolbar"
        aria-label={t("repo.historyFilters")}
      >
        <DropdownMenu
          onOpenChange={(open) => {
            if (!open) {
              setBranchMenuFilter("");
            }
          }}
        >
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              // 固定宽度：避免「当前分支」与长远端名切换时按钮伸缩挤乱筛选条
              className="h-7 w-28 shrink-0 justify-between gap-1 px-2 text-xs font-normal shadow-none"
              title={branchLabel}
            >
              <span className="min-w-0 flex-1 truncate text-left">{branchLabel}</span>
              <ChevronDown className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          {/* 固定宽度 + overflow，避免长分支名把菜单撑开（对齐工具栏分支下拉） */}
          <DropdownMenuContent align="start" className="w-72 overflow-hidden p-0">
            <div className="border-border border-b p-1.5">
              <div className="relative">
                <Search
                  className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2"
                  aria-hidden="true"
                />
                <Input
                  value={branchMenuFilter}
                  onChange={(event) => setBranchMenuFilter(event.target.value)}
                  placeholder={t("repo.historyBranchFilterPlaceholder")}
                  className="h-7 pl-7 text-xs shadow-none"
                  aria-label={t("repo.historyBranchFilterPlaceholder")}
                  // 避免输入时触发菜单 item 焦点/关闭
                  onKeyDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                />
              </div>
            </div>
            <DropdownMenuScrollArea
              itemCount={
                Number(showCurrentBranchItem) +
                Number(showAllBranchesItem) +
                filteredScopeBranches.length
              }
              maxHeight={288}
              availableHeightOffset={41}
            >
              <div className="min-w-0 p-1">
                {showCurrentBranchItem ? (
                  <DropdownMenuItem
                    disabled={currentBranchLogRef == null}
                    className="max-w-full min-w-0"
                    onSelect={() => {
                      if (currentBranchLogRef == null) {
                        return;
                      }
                      void selectLogRef(currentBranchLogRef).catch((error: unknown) => {
                        toast.error(toUserMessage(error));
                      });
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {t("repo.historyCurrentBranch")}
                    </span>
                    {isCurrentBranchScope ? (
                      <Check className="size-3.5 shrink-0" aria-hidden="true" />
                    ) : null}
                  </DropdownMenuItem>
                ) : null}
                {showAllBranchesItem ? (
                  <DropdownMenuItem
                    className="max-w-full min-w-0"
                    onSelect={() => {
                      void selectLogRef(null).catch((error: unknown) => {
                        toast.error(toUserMessage(error));
                      });
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">{t("repo.historyAllBranches")}</span>
                    {logRef == null ? (
                      <Check className="size-3.5 shrink-0" aria-hidden="true" />
                    ) : null}
                  </DropdownMenuItem>
                ) : null}
                {filteredScopeBranches.map((branch) => (
                  <DropdownMenuItem
                    key={branch.name}
                    className="max-w-full min-w-0"
                    onSelect={() => {
                      void selectLogRef(branch.name).catch((error: unknown) => {
                        toast.error(toUserMessage(error));
                      });
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate" title={branch.name}>
                      {branch.name}
                    </span>
                    {logRef === branch.name ? (
                      <Check className="size-3.5 shrink-0" aria-hidden="true" />
                    ) : null}
                  </DropdownMenuItem>
                ))}
                {!showCurrentBranchItem &&
                !showAllBranchesItem &&
                filteredScopeBranches.length === 0 ? (
                  <p className="text-muted-foreground px-2 py-3 text-center text-xs">
                    {t("repo.historyBranchFilterEmpty")}
                  </p>
                ) : null}
              </div>
            </DropdownMenuScrollArea>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 搜索：固定合适宽度，不拉满中间空白 */}
        <div className="relative w-56 shrink-0">
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
          <HistoryAdvancedFilterPopover
            applied={historyAdvanced}
            showMergeCommitsPrefs={viewPrefs.showMergeCommits}
            onShowMergeCommitsPrefsChange={writeShowMergeCommitsPrefs}
            disabled={loading}
            onApply={async (filters) => {
              await applyHistoryAdvanced(filters);
            }}
            onReset={async (showMergeCommits) => {
              await clearHistoryAdvanced(showMergeCommits);
            }}
          />
        </div>

        <DropdownMenu
          onOpenChange={(open) => {
            if (!open) {
              setAuthorMenuFilter("");
            }
          }}
        >
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                "h-7 max-w-30 shrink-0 gap-1 px-2 text-xs font-normal shadow-none",
                author && "bg-primary/10 text-primary border-transparent",
              )}
            >
              <span className="min-w-0 truncate">{authorLabel}</span>
              <ChevronDown className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48 p-0">
            <div className="border-border border-b p-1.5">
              <div className="relative">
                <Search
                  className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2"
                  aria-hidden="true"
                />
                <Input
                  value={authorMenuFilter}
                  onChange={(event) => setAuthorMenuFilter(event.target.value)}
                  placeholder={t("repo.historyAuthorFilterPlaceholder")}
                  className="h-7 pl-7 text-xs shadow-none"
                  aria-label={t("repo.historyAuthorFilterPlaceholder")}
                  // 避免输入时触发菜单 item 焦点/关闭
                  onKeyDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                />
              </div>
            </div>
            <DropdownMenuScrollArea
              itemCount={Number(showAllAuthorsItem) + filteredAuthors.length}
              maxHeight={288}
              availableHeightOffset={41}
            >
              <div className="p-1">
                {showAllAuthorsItem ? (
                  <DropdownMenuItem onSelect={() => setAuthor(null)}>
                    <span className="min-w-0 flex-1 truncate">{t("repo.historyAuthorAll")}</span>
                    {author == null ? (
                      <Check className="size-3.5 shrink-0" aria-hidden="true" />
                    ) : null}
                  </DropdownMenuItem>
                ) : null}
                {filteredAuthors.map((name) => (
                  <DropdownMenuItem key={name} onSelect={() => setAuthor(name)}>
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                    {author === name ? (
                      <Check className="size-3.5 shrink-0" aria-hidden="true" />
                    ) : null}
                  </DropdownMenuItem>
                ))}
                {!showAllAuthorsItem && filteredAuthors.length === 0 ? (
                  <p className="text-muted-foreground px-2 py-3 text-center text-xs">
                    {t("repo.historyAuthorFilterEmpty")}
                  </p>
                ) : null}
              </div>
            </DropdownMenuScrollArea>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                "h-7 shrink-0 gap-1 px-2 text-xs font-normal shadow-none",
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
                {datePreset === value ? (
                  <Check className="size-3.5 shrink-0" aria-hidden="true" />
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <DropdownMenu>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground size-7"
                    aria-label={t("repo.historySort")}
                  >
                    <ArrowDownWideNarrow className="size-3.5" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>{t("repo.historySort")}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="min-w-42">
              {(
                [
                  {
                    value: "default" as const,
                    label: t("repo.historySortDefault"),
                    hint: null,
                  },
                  {
                    value: "topo" as const,
                    label: "--topo-order",
                    hint: t("repo.historySortTopoHint"),
                  },
                  {
                    value: "date" as const,
                    label: "--date-order",
                    hint: t("repo.historySortDateHint"),
                  },
                ] satisfies { value: GitLogOrder; label: string; hint: string | null }[]
              ).map((option) => {
                const item = (
                  <DropdownMenuItem
                    className="font-mono text-xs"
                    onSelect={() => {
                      void setLogOrder(option.value).catch((error: unknown) => {
                        toast.error(toUserMessage(error));
                      });
                    }}
                  >
                    <span className="min-w-0 flex-1">{option.label}</span>
                    {logOrder === option.value ? (
                      <Check className="size-3.5 shrink-0" aria-hidden="true" />
                    ) : null}
                  </DropdownMenuItem>
                );

                if (!option.hint) {
                  return <Fragment key={option.value}>{item}</Fragment>;
                }

                return (
                  <Tooltip key={option.value} delayDuration={200}>
                    <TooltipTrigger asChild>{item}</TooltipTrigger>
                    {/* 菜单在右侧，提示从左侧弹出，避免遮挡选项 */}
                    <TooltipContent side="left" sideOffset={8}>
                      {option.hint}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground size-7"
                    aria-label={t("repo.historyMore")}
                  >
                    <MoreHorizontal className="size-3.5" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>{t("repo.historyMore")}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="min-w-44">
              {(
                [
                  {
                    key: "showMergeCommits" as const,
                    label: t("repo.historyShowMergeCommits"),
                  },
                  {
                    key: "showRemoteBranches" as const,
                    label: t("repo.historyShowRemoteBranches"),
                  },
                  {
                    key: "expandBranchNames" as const,
                    label: t("repo.historyExpandBranchNames"),
                  },
                  {
                    key: "branchOnLeft" as const,
                    label: t("repo.historyBranchOnLeft"),
                  },
                ] as const
              ).map((option) => (
                <DropdownMenuItem
                  key={option.key}
                  // 多选：点选不关闭菜单
                  onSelect={(event) => {
                    event.preventDefault();
                    toggleViewPref(option.key);
                  }}
                >
                  <span className="min-w-0 flex-1">{option.label}</span>
                  {viewPrefs[option.key] ? (
                    <Check className="size-3.5 shrink-0" aria-hidden="true" />
                  ) : null}
                </DropdownMenuItem>
              ))}
              {allowOpenInNewWindow ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => {
                      const repoPath = useRepoStore.getState().repoPath;
                      const project = useProjectStore
                        .getState()
                        .projects.find((item) => item.path === repoPath);
                      if (!project) {
                        toast.error(t("repo.historyOpenInNewWindowFailed"));
                        return;
                      }
                      void openBranchHistoryWindow({
                        projectId: project.id,
                        ref: logRef,
                      }).catch((error: unknown) => {
                        toast.error(toUserMessage(error) || t("repo.historyOpenInNewWindowFailed"));
                      });
                    }}
                  >
                    {t("repo.historyOpenInNewWindow")}
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        {commits.length === 0 || filteredCommits.length === 0 ? (
          <ScrollArea
            ref={bindScrollArea}
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
                  <p className="text-muted-foreground max-w-sm text-xs">{t("repo.historyEmpty")}</p>
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-3 px-6 text-center">
                <SearchX className="text-muted-foreground size-10 opacity-50" aria-hidden="true" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">{t("repo.historyNoMatch")}</p>
                  <p className="text-muted-foreground max-w-sm text-xs">
                    {t("repo.historyNoMatchHint")}
                  </p>
                </div>
              </div>
            )}
          </ScrollArea>
        ) : (
          <ResizablePanelGroup
            id={HISTORY_GRAPH_WIDTH_STORAGE_KEY}
            orientation="horizontal"
            className="h-full min-h-0 min-w-0"
            onLayoutChanged={(_layout, meta) => {
              if (!meta.isUserInteraction) {
                return;
              }
              const widthPx = graphPanelRef.current?.getSize().inPixels;
              if (typeof widthPx === "number") {
                persistGraphWidthPx(widthPx);
              }
            }}
          >
            <ResizablePanel
              id="graph"
              panelRef={graphPanelRef}
              defaultSize={`${readHistoryGraphWidth()}px`}
              minSize={`${HISTORY_GRAPH_MIN_WIDTH}px`}
              maxSize={`${HISTORY_GRAPH_MAX_WIDTH}px`}
              groupResizeBehavior="preserve-pixel-size"
              className="min-h-0 min-w-0"
            >
              {/*
               * 图谱列：纵位用 translateY 跟列表 scrollTop（勿放进列表 ScrollArea，
               * 否则 Radix 纵滚会把整图滚出可视区）。横滑用列内 ScrollArea。
               */}
              <div
                className="bg-background h-full min-h-0 overflow-hidden pl-2"
                onWheel={handleGraphColumnWheel}
                aria-hidden="true"
              >
                <div
                  style={{
                    transform: `translateY(${-graphScrollTop}px)`,
                  }}
                >
                  <ScrollArea
                    className={cn(
                      "w-full",
                      "[&_[data-slot=scroll-area-viewport]]:!h-auto [&_[data-slot=scroll-area-viewport]]:!max-h-none",
                      "[&_[data-slot=scroll-area-viewport]]:!overflow-x-auto [&_[data-slot=scroll-area-viewport]]:!overflow-y-hidden",
                      "[&_[data-slot=scroll-area-viewport]>div]:!block [&_[data-slot=scroll-area-viewport]>div]:!min-w-0",
                      "[&_[data-slot=scroll-area-scrollbar][data-orientation=vertical]]:hidden",
                    )}
                  >
                    <div
                      className="min-w-full"
                      style={graphContentWidth > 0 ? { width: graphContentWidth } : undefined}
                    >
                      <HistoryGraph
                        commits={filteredCommits}
                        topologyCommits={commits}
                        currentBranch={currentBranch}
                        onHoverCommit={setHoveredCommitId}
                        onSelectCommit={handleSelectCommit}
                        onContentWidthChange={setGraphContentWidth}
                      />
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </ResizablePanel>

            <ResizableHandle className={RESIZABLE_HANDLE_CLASSNAME} />

            <ResizablePanel id="commits" minSize="300px" className="relative min-h-0 min-w-0">
              <ScrollArea
                ref={bindScrollArea}
                // Radix viewport 内层 display:table 会撑开宽度导致 truncate 失效；在用法处覆盖，不改 ui/scroll-area
                className="h-full w-full [&_[data-slot=scroll-area-viewport]]:overflow-x-hidden [&_[data-slot=scroll-area-viewport]>div]:!block [&_[data-slot=scroll-area-viewport]>div]:!min-w-0 [&_[data-slot=scroll-area-viewport]>div]:w-full"
              >
                <ul
                  className="relative w-full min-w-0"
                  style={{
                    height: `${commitVirtualizer.getTotalSize()}px`,
                  }}
                  role="listbox"
                  aria-label={t("repo.history")}
                >
                  {commitVirtualizer.getVirtualItems().map((virtualItem) => {
                    const commit = filteredCommits[virtualItem.index];
                    if (!commit) {
                      return null;
                    }
                    const refs = commit.refs ?? [];
                    const visibleRefs = filterVisibleHistoryRefs(
                      refs,
                      viewPrefs.showRemoteBranches,
                    );
                    const isTip =
                      currentBranch != null &&
                      refs.some(
                        (ref) => ref === currentBranch || ref.endsWith(`&${currentBranch}`),
                      );
                    const isHead =
                      (headTipShortId != null &&
                        (commit.shortId === headTipShortId ||
                          commit.id.startsWith(headTipShortId))) ||
                      (status?.detached === true &&
                        (commit.refs ?? []).some(
                          (ref) => ref === "HEAD" || ref.endsWith("&HEAD") || ref.includes("HEAD"),
                        ));

                    return (
                      <HistoryCommitRow
                        key={virtualItem.key}
                        commit={commit}
                        isSelected={selectedCommitId === commit.id}
                        isHovered={hoveredCommitId === commit.id}
                        isTip={isTip}
                        isHead={isHead}
                        alreadyPushed={alreadyPushed}
                        visibleRefs={visibleRefs}
                        expandBranchNames={viewPrefs.expandBranchNames}
                        branchOnLeft={viewPrefs.branchOnLeft}
                        onSelect={handleSelectCommit}
                        className="absolute top-0 min-w-0"
                        style={{
                          height: `${virtualItem.size}px`,
                          transform: `translateY(${virtualItem.start}px)`,
                          left: commitRowLeft,
                          right: commitRowRight,
                        }}
                      />
                    );
                  })}
                </ul>

                {shouldAutoLoadMore || loadMoreFailed ? (
                  <div
                    ref={loadMoreSentinelRef}
                    className="flex min-h-8 items-center justify-center gap-2 px-2 py-2"
                    aria-live="polite"
                  >
                    {loadingMore ? (
                      <>
                        <Spinner className="text-muted-foreground size-3.5 shrink-0" />
                        <span className="text-muted-foreground text-xs">
                          {t("repo.historyLoadingMore")}
                        </span>
                      </>
                    ) : loadMoreFailed ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground h-7 px-2 text-xs"
                        onClick={() => {
                          setLoadMoreFailed(false);
                          setFilterLoadExhausted(false);
                          void handleLoadMore();
                        }}
                        disabled={loading}
                      >
                        {t("repo.historyRetryLoadMore")}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </ScrollArea>

              {showBackToTop ? (
                <Tooltip delayDuration={400}>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      className={cn(
                        "bg-background/95 text-muted-foreground absolute right-3 bottom-3 z-10 rounded-full shadow-sm",
                        "hover:bg-accent hover:text-foreground",
                      )}
                      aria-label={t("repo.backToTop")}
                      onClick={scrollHistoryToTop}
                    >
                      <ArrowUp className="size-3.5" aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left" sideOffset={8}>
                    {t("repo.backToTop")}
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
    </div>
  );
}
