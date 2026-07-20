import { cn } from "@/lib/utils";

interface DiffLineStatsProps {
  additions?: number | null;
  deletions?: number | null;
  className?: string;
  /** muted：分区摘要等场景用中性色，避免与「增/删文件数」抢语义色 */
  tone?: "color" | "muted";
}

/** 提交改动文件的 +/- 行数（无统计或二进制时不渲染） */
export function DiffLineStats({
  additions,
  deletions,
  className,
  tone = "color",
}: DiffLineStatsProps) {
  const hasAdd = typeof additions === "number";
  const hasDel = typeof deletions === "number";
  if (!hasAdd && !hasDel) {
    return null;
  }

  const addClass = tone === "muted" ? "text-muted-foreground" : "text-git-added";
  const delClass = tone === "muted" ? "text-muted-foreground" : "text-git-deleted";

  return (
    <span
      className={cn(
        "ml-auto flex shrink-0 items-center gap-1.5 font-mono text-[11px] tabular-nums leading-none",
        className,
      )}
      aria-hidden="true"
    >
      {hasAdd && additions > 0 ? <span className={addClass}>+{additions}</span> : null}
      {hasDel && deletions > 0 ? <span className={delClass}>-{deletions}</span> : null}
    </span>
  );
}
