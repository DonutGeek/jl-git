import { memo, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import type { GitCommitSummary } from "@/types/git";

import {
  computeHistoryGraphLayout,
  rewriteParentsForVisibleCommits,
} from "@/utils/historyGraphLayout";

interface HistoryGraphProps {
  /** 当前列表可见行（与行高一一对齐） */
  commits: GitCommitSummary[];
  /**
   * 已加载全量拓扑（含被客户端筛选掉的提交），用于改写不可见 parent。
   * 默认等于 commits。
   */
  topologyCommits?: GitCommitSummary[];
  /** 当前检出分支名；用于 tip 空心圆（log decorate 不含 HEAD 字面量） */
  currentBranch?: string | null;
  /** 悬停圆点时同步高亮历史行；移出传 null */
  onHoverCommit?: (commitId: string | null) => void;
  /** 点击圆点选中提交 */
  onSelectCommit?: (commitId: string) => void;
  /** SVG 内容宽度（供父级 ScrollArea 横滑内容盒，不用于加宽列） */
  onContentWidthChange?: (contentWidth: number) => void;
}

interface GraphHoverTooltip {
  commitId: string;
  title: string;
  subject: string;
  dotX: number;
  dotY: number;
  shape: "circle" | "square";
}

/** 与 HistoryList 34px 行槽位 / pt-1.5 对齐 */
const ROW_HEIGHT = 34;
const LIST_PADDING_TOP = 6;
const LANE_SPACING = 18;
const PAD_X = 10;
const DOT_SIZE = 5;
const STROKE_WIDTH = 1.5;

function isCurrentBranchTip(refs: string[], currentBranch: string | null | undefined): boolean {
  if (!currentBranch) {
    return false;
  }
  return refs.some((ref) => ref === currentBranch || ref.endsWith(`&${currentBranch}`));
}

function laneX(col: number): number {
  return PAD_X + col * LANE_SPACING;
}

function rowCenterY(rowIndex: number): number {
  return LIST_PADDING_TOP + rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
}

function rowTopY(rowIndex: number): number {
  return LIST_PADDING_TOP + rowIndex * ROW_HEIGHT;
}

function rowBottomY(rowIndex: number): number {
  return LIST_PADDING_TOP + (rowIndex + 1) * ROW_HEIGHT;
}

/** 竖轨 + 斜线（铁路观感）：同列竖直，跨列半行内直线斜接（约 45°） */
function linkPath(fromCol: number, toCol: number, y0: number, y1: number): string {
  const x0 = laneX(fromCol);
  const x1 = laneX(toCol);
  return `M ${x0} ${y0} L ${x1} ${y1}`;
}

/**
 * 自绘铁路图：lane 布局 + SVG 竖轨/斜线 + 合并方块 / tip 空心 / 普通实心圆。
 * 数据仍用 git log 的 parentIds，不依赖 @gitgraph/react。
 */
export const HistoryGraph = memo(function HistoryGraph({
  commits,
  topologyCommits,
  currentBranch = null,
  onHoverCommit,
  onSelectCommit,
  onContentWidthChange,
}: HistoryGraphProps) {
  const { t } = useTranslation();
  const onHoverRef = useRef(onHoverCommit);
  const onSelectRef = useRef(onSelectCommit);
  const onContentWidthRef = useRef(onContentWidthChange);
  const [tooltip, setTooltip] = useState<GraphHoverTooltip | null>(null);
  onHoverRef.current = onHoverCommit;
  onSelectRef.current = onSelectCommit;
  onContentWidthRef.current = onContentWidthChange;

  const topology = topologyCommits ?? commits;

  const layout = useMemo(() => {
    const inputs = rewriteParentsForVisibleCommits(commits, topology);
    return computeHistoryGraphLayout(inputs);
  }, [commits, topology]);

  const width = Math.max(PAD_X * 2 + Math.max(layout.columns, 1) * LANE_SPACING, 40);
  const height = LIST_PADDING_TOP + commits.length * ROW_HEIGHT;

  useEffect(() => {
    onContentWidthRef.current?.(Math.ceil(width));
  }, [width]);

  if (commits.length === 0 || layout.rows.length === 0) {
    return null;
  }

  const tipHalf = DOT_SIZE + 1.5;
  // 节点遮罩略大于线宽，确保竖轨不从圆心透出
  const maskPad = STROKE_WIDTH + 0.5;

  // 轨线 / 圆点走语义 Token（muted / primary / background），随应用主题切换
  return (
    <div className="pointer-events-auto w-max" aria-hidden="true">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="text-muted-foreground block overflow-visible"
      >
        {layout.rows.map((row, rowIndex) => {
          const centerY = rowCenterY(rowIndex);
          const topY = rowTopY(rowIndex);
          const bottomY = rowBottomY(rowIndex);
          return (
            <g key={`links-${commits[rowIndex]?.id ?? rowIndex}`}>
              {row.topLinks.map((link, linkIndex) => (
                <path
                  key={`t-${linkIndex}`}
                  d={linkPath(link.fromCol, link.toCol, topY, centerY)}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={STROKE_WIDTH}
                />
              ))}
              {row.bottomLinks.map((link, linkIndex) => (
                <path
                  key={`b-${linkIndex}`}
                  d={linkPath(link.fromCol, link.toCol, centerY, bottomY)}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={STROKE_WIDTH}
                />
              ))}
            </g>
          );
        })}

        {layout.rows.map((row, rowIndex) => {
          const commit = commits[rowIndex];
          if (!commit) {
            return null;
          }
          const cx = laneX(row.col);
          const cy = rowCenterY(rowIndex);
          const refs = commit.refs ?? [];
          // 合并形态看原始 parent 数（筛选掉一侧父提交仍应显示方块）
          const isMerge = commit.parentIds.length > 1;
          const isTip = isCurrentBranchTip(refs, currentBranch);
          const shape: "circle" | "square" = isMerge ? "square" : "circle";
          const title = t("repo.historyGraphCommit", { hash: commit.shortId });

          function showTooltip(target: Element): void {
            const rect = target.getBoundingClientRect();
            setTooltip({
              commitId: commit.id,
              title,
              subject: commit.subject,
              dotX: rect.left + rect.width / 2,
              dotY: rect.top + rect.height / 2,
              shape,
            });
          }

          function hideTooltip(): void {
            setTooltip((current) => (current?.commitId === commit.id ? null : current));
          }

          return (
            <g
              key={commit.id}
              className="cursor-pointer"
              onClick={() => onSelectRef.current?.(commit.id)}
              onMouseOver={(event) => {
                onHoverRef.current?.(commit.id);
                showTooltip(event.currentTarget);
              }}
              onMouseOut={() => {
                onHoverRef.current?.(null);
                hideTooltip();
              }}
            >
              {/* 不透明底垫：切断下层竖轨，避免半透明 fill 透线 */}
              {isMerge ? (
                <rect
                  x={cx - DOT_SIZE - maskPad}
                  y={cy - DOT_SIZE - maskPad}
                  width={(DOT_SIZE + maskPad) * 2}
                  height={(DOT_SIZE + maskPad) * 2}
                  rx={2.5}
                  ry={2.5}
                  fill="var(--background)"
                />
              ) : (
                <circle cx={cx} cy={cy} r={DOT_SIZE + maskPad} fill="var(--background)" />
              )}
              {isMerge ? (
                <rect
                  x={cx - DOT_SIZE}
                  y={cy - DOT_SIZE}
                  width={DOT_SIZE * 2}
                  height={DOT_SIZE * 2}
                  // 轻微圆角，避免直角方块过硬（约 2px）
                  rx={2}
                  ry={2}
                  fill="currentColor"
                />
              ) : isTip ? (
                <circle
                  cx={cx}
                  cy={cy}
                  r={DOT_SIZE}
                  fill="var(--background)"
                  stroke="var(--primary)"
                  strokeWidth={2}
                />
              ) : (
                <circle cx={cx} cy={cy} r={DOT_SIZE} fill="currentColor" />
              )}
              <circle cx={cx} cy={cy} r={DOT_SIZE + 4} fill="transparent" />
            </g>
          );
        })}
      </svg>

      {tooltip
        ? createPortal(
            <div className="pointer-events-none fixed inset-0 z-[100] overflow-visible">
              <div
                className={cn(
                  "border-primary bg-background absolute border-[1.5px]",
                  tooltip.shape === "square" ? "rounded-[3px]" : "rounded-full",
                )}
                style={{
                  left: tooltip.dotX - tipHalf,
                  top: tooltip.dotY - tipHalf,
                  width: tipHalf * 2,
                  height: tipHalf * 2,
                }}
              />
              <div
                className="bg-primary absolute h-px"
                style={{
                  left: tooltip.dotX + DOT_SIZE,
                  top: tooltip.dotY,
                  width: 8,
                }}
              />
              <div
                className="border-border bg-popover text-popover-foreground absolute max-w-[min(360px,calc(100vw-24px))] min-w-[220px] -translate-y-1/2 rounded-md border"
                style={{
                  left: tooltip.dotX + DOT_SIZE + 8,
                  top: tooltip.dotY,
                }}
              >
                <div className="text-muted-foreground px-2.5 pt-2 font-mono text-[10px] leading-none">
                  {tooltip.title}
                </div>
                <div className="border-border mx-2 mt-1.5 border-t" />
                <div className="text-popover-foreground px-2.5 py-2 text-[11px] leading-snug break-words whitespace-pre-wrap">
                  {tooltip.subject}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
});
