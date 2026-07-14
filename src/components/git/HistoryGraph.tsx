import { type ReactElement, memo, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Gitgraph, Mode, TemplateName, templateExtend } from "@gitgraph/react";

import { GitCommitSummary } from "@/types/git";

interface HistoryGraphProps {
  commits: GitCommitSummary[];
  width: number;
  /** 悬停圆点时同步高亮历史行；移出传 null */
  onHoverCommit?: (commitId: string | null) => void;
  /** 点击圆点选中提交 */
  onSelectCommit?: (commitId: string) => void;
}

interface GitgraphImportCommit {
  hash: string;
  parents: string[];
  subject: string;
  author: {
    name: string;
    email: string;
  };
  refs: string[];
  onClick: () => void;
  onMouseOver: () => void;
  onMouseOut: () => void;
  renderDot: (commit: {
    style: { dot: { size: number; color: string; strokeColor?: string; strokeWidth?: number } };
  }) => ReactElement;
}

interface GraphHoverTooltip {
  commitId: string;
  title: string;
  subject: string;
  /** 视口坐标：浮层用 fixed，避免被分隔线 z-index 压住 */
  dotX: number;
  dotY: number;
}

/** 与历史行 32px 高度对齐的轻量提交图谱列。 */
const HISTORY_GRAPH_OPTIONS = {
  mode: Mode.Compact,
  initCommitOffsetY: 12,
  template: templateExtend(TemplateName.Metro, {
    colors: ["currentColor"],
    branch: {
      lineWidth: 1.5,
      spacing: 18,
      label: { display: false },
    },
    commit: {
      spacing: 32,
      // 必须关闭：库内 Tooltip 在自定义 renderTooltip 时仍访问空 ref，会直接崩溃
      hasTooltipInCompactMode: false,
      dot: {
        size: 6,
        strokeWidth: 1,
        strokeColor: "var(--background)",
      },
      message: {
        display: false,
        displayAuthor: false,
        displayHash: false,
      },
    },
  }),
};

const DOT_SIZE = 6;

/**
 * 使用 Gitgraph 的 git2json 导入格式渲染真实提交 DAG。
 * `commits` 保持 Git 日志的最新在前顺序，组件会在导入时逆序建立拓扑。
 *
 * 注意：
 * - 不用库的 compact tooltip（renderTooltip 会触发 Tooltip 空 ref 崩溃）
 * - 悬停浮层 portal 到 body + fixed，避免被分隔线 / ScrollArea 压住或裁切
 * - 窗口外 parent 过滤，避免拓扑把线拖出列表底部形成半截圆
 * - 自定义 renderDot，避免默认实现用 hash 作 SVG id（常以数字开头，非法）
 */
export const HistoryGraph = memo(function HistoryGraph({
  commits,
  width,
  onHoverCommit,
  onSelectCommit,
}: HistoryGraphProps) {
  const { t } = useTranslation();
  const onHoverRef = useRef(onHoverCommit);
  const onSelectRef = useRef(onSelectCommit);
  const [tooltip, setTooltip] = useState<GraphHoverTooltip | null>(null);
  onHoverRef.current = onHoverCommit;
  onSelectRef.current = onSelectCommit;

  const graphCommits = useMemo<GitgraphImportCommit[]>(() => {
    const knownHashes = new Set(commits.map((commit) => commit.id));
    return commits.map((commit) => {
      const title = t("repo.historyGraphCommit", { hash: commit.shortId });

      function showTooltip(target: Element): void {
        const dotRect = target.getBoundingClientRect();
        setTooltip({
          commitId: commit.id,
          title,
          subject: commit.subject,
          dotX: dotRect.left + dotRect.width / 2,
          dotY: dotRect.top + dotRect.height / 2,
        });
      }

      function hideTooltip(): void {
        setTooltip((current) => (current?.commitId === commit.id ? null : current));
      }

      return {
        hash: commit.id,
        // 仅保留本页已加载的 parent，避免线延伸出列表底部形成半截圆
        parents: commit.parentIds.filter((parentId) => knownHashes.has(parentId)),
        subject: commit.subject,
        author: {
          name: commit.authorName,
          email: commit.authorEmail,
        },
        refs: commit.refs ?? [],
        onClick: () => {
          onSelectRef.current?.(commit.id);
        },
        onMouseOver: () => {
          onHoverRef.current?.(commit.id);
        },
        onMouseOut: () => {
          onHoverRef.current?.(null);
        },
        renderDot: (graphCommit) => {
          const size = graphCommit.style.dot.size;
          return (
            <g
              style={{ cursor: "pointer" }}
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
              <circle
                cx={size}
                cy={size}
                r={size}
                fill={graphCommit.style.dot.color}
                stroke={graphCommit.style.dot.strokeColor}
                strokeWidth={graphCommit.style.dot.strokeWidth}
              />
              {/* 扩大可点区域，避免 6px 圆点难悬停 */}
              <circle cx={size} cy={size} r={size + 4} fill="transparent" />
            </g>
          );
        },
      };
    });
  }, [commits, t]);

  const graphKey = useMemo(
    () =>
      graphCommits
        .map((commit) => `${commit.hash}:${commit.parents.join(",")}:${commit.refs.join(",")}`)
        .join("|"),
    [graphCommits],
  );

  if (graphCommits.length === 0) {
    return null;
  }

  return (
    <div
      className="text-muted-foreground pointer-events-auto absolute top-0 left-1.5 z-10 overflow-hidden [&_svg]:block"
      style={{ width }}
      aria-hidden="true"
    >
      <Gitgraph key={graphKey} options={HISTORY_GRAPH_OPTIONS}>
        {(gitgraph) => {
          // children 仅在 mount 时调用一次；key 变化会重挂载并重新 import
          gitgraph.import(graphCommits);
        }}
      </Gitgraph>

      {/* 提到 body：分隔线 z-20 高于图谱 z-10，容器内再高也压不住 */}
      {tooltip
        ? createPortal(
            <div className="pointer-events-none fixed inset-0 z-[100] overflow-visible">
              <div
                className="border-primary bg-background absolute rounded-full border-[1.5px]"
                style={{
                  left: tooltip.dotX - (DOT_SIZE + 1.5),
                  top: tooltip.dotY - (DOT_SIZE + 1.5),
                  width: (DOT_SIZE + 1.5) * 2,
                  height: (DOT_SIZE + 1.5) * 2,
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
                className="border-border bg-popover text-popover-foreground absolute max-w-[min(360px,calc(100vw-24px))] min-w-[220px] -translate-y-1/2 rounded-md border shadow-md"
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
