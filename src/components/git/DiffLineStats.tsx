import { cn } from "@/lib/utils";

interface DiffLineStatsProps {
  additions?: number | null;
  deletions?: number | null;
  className?: string;
}

/** 提交改动文件的 +/- 行数（无统计或二进制时不渲染） */
export function DiffLineStats({ additions, deletions, className }: DiffLineStatsProps) {
  const hasAdd = typeof additions === "number";
  const hasDel = typeof deletions === "number";
  if (!hasAdd && !hasDel) {
    return null;
  }

  return (
    <span
      className={cn(
        "ml-auto flex shrink-0 items-center gap-1.5 font-mono text-[11px] tabular-nums leading-none",
        className,
      )}
      aria-hidden="true"
    >
      {hasAdd && additions > 0 ? (
        <span className="text-git-added">+{additions}</span>
      ) : null}
      {hasDel && deletions > 0 ? (
        <span className="text-git-deleted">-{deletions}</span>
      ) : null}
    </span>
  );
}
