import type { ReactNode } from "react";

import { TruncateStartPath, TRUNCATE_BUDGET_ATTR } from "@/components/common/TruncateStartPath";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface TruncateStartHoverLabelProps {
  /** 全文（省略时悬停 Tooltip 展开） */
  text: string;
  /** 前缀（如当前分支 ✓），与文案同壳以便量宽扣除 */
  leading?: ReactNode;
  /** 后缀（如「默认」徽章），必须与 TruncateStartPath 同壳 */
  trailing?: ReactNode;
  className?: string;
  textClassName?: string;
  highlightQuery?: string;
}

/**
 * 前省略标签：预算宽与视觉宽拆开；悬停用 Tooltip 展开全文。
 *
 * - 外层 `TRUNCATE_BUDGET_ATTR` 占满列宽
 * - 内层 `w-max max-w-full`，leading / 文案 / trailing 同壳
 * - Tooltip 默认居中对齐（宽触发器勿 `align="start"`，否则箭头被隐藏）
 */
export function TruncateStartHoverLabel({
  text,
  leading,
  trailing,
  className,
  textClassName,
  highlightQuery,
}: TruncateStartHoverLabelProps) {
  return (
    <div className={cn("min-w-0 w-full", className)} {...{ [TRUNCATE_BUDGET_ATTR]: true }}>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <div className="flex w-max max-w-full min-w-0 cursor-default items-center gap-1.5">
            {leading}
            <TruncateStartPath
              path={text}
              title=""
              highlightQuery={highlightQuery}
              className={cn("text-foreground font-mono text-[11px] leading-none", textClassName)}
            />
            {trailing}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-sm break-all font-mono">
          {text}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
