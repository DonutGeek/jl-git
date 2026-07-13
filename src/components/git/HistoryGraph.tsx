import { type ReactElement, useMemo } from "react";
import { Gitgraph, Mode, TemplateName, templateExtend } from "@gitgraph/react";

import { GitCommitSummary } from "@/types/git";

interface HistoryGraphProps {
  commits: GitCommitSummary[];
  width: number;
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
  renderTooltip: () => ReactElement<SVGGElement>;
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
      hasTooltipInCompactMode: true,
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

function truncateSubject(subject: string): string {
  return subject.length > 30 ? `${subject.slice(0, 30)}…` : subject;
}

/**
 * 使用 Gitgraph 的 git2json 导入格式渲染真实提交 DAG。
 * `commits` 保持 Git 日志的最新在前顺序，组件会在导入时逆序建立拓扑。
 */
export function HistoryGraph({ commits, width }: HistoryGraphProps) {
  const graphCommits = useMemo<GitgraphImportCommit[]>(
    () =>
      commits.map((commit) => ({
        hash: commit.id,
        parents: commit.parentIds,
        subject: commit.subject,
        author: {
          name: commit.authorName,
          email: commit.authorEmail,
        },
        refs: commit.refs,
        renderTooltip: () => (
          <g transform="translate(16, 0)">
            <rect
              x="0"
              y="-23"
              width="248"
              height="46"
              rx="6"
              fill="var(--popover)"
              stroke="var(--border)"
            />
            <text x="10" y="-6" fill="var(--muted-foreground)" fontSize="10">
              {commit.shortId}
            </text>
            <text x="10" y="11" fill="var(--popover-foreground)" fontSize="11">
              {truncateSubject(commit.subject)}
            </text>
          </g>
        ),
      })),
    [commits],
  );
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
      className="text-muted-foreground pointer-events-auto absolute top-0 left-1.5 z-10 h-full overflow-visible [&_svg]:block [&_svg_g]:cursor-pointer"
      style={{ width }}
      aria-hidden="true"
    >
      <Gitgraph key={graphKey} options={HISTORY_GRAPH_OPTIONS}>
        {(gitgraph) => {
          gitgraph.import(graphCommits);
        }}
      </Gitgraph>
    </div>
  );
}
