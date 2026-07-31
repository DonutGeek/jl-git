import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { findContiguousMatchRanges } from "@/utils/textHighlight";

interface HighlightTextProps {
  text: string;
  query: string;
  className?: string;
  /** 覆盖默认浅底高亮 */
  markClassName?: string;
  title?: string;
}

const DEFAULT_MARK_CLASS = "rounded-sm bg-primary/15 text-inherit";

/** 按连续子串 query 高亮 text；无命中时原样输出。 */
export function HighlightText({
  text,
  query,
  className,
  markClassName,
  title,
}: HighlightTextProps): ReactNode {
  const ranges = findContiguousMatchRanges(text, query);
  if (ranges.length === 0) {
    return (
      <span className={className} title={title}>
        {text}
      </span>
    );
  }

  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const [index, range] of ranges.entries()) {
    if (cursor < range.start) {
      parts.push(text.slice(cursor, range.start));
    }
    parts.push(
      <mark
        key={`${range.start}-${range.end}-${index}`}
        className={cn(DEFAULT_MARK_CLASS, markClassName)}
      >
        {text.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  }
  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return (
    <span className={className} title={title}>
      {parts}
    </span>
  );
}
