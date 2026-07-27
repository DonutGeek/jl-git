import type { ReactNode } from "react";
import { CircleHelp } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** 设置标题旁说明：问号，悬停弹出 */
export function SettingsTip({ ariaLabel, children }: { ariaLabel: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground inline-flex size-4 shrink-0 items-center justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={ariaLabel}
        >
          <CircleHelp className="size-3.5" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      {/* 覆盖 ui/tooltip 默认 text-balance，避免长说明右侧大块留白 */}
      <TooltipContent
        side="top"
        className="max-w-xs text-left leading-relaxed text-pretty text-wrap"
      >
        {children}
      </TooltipContent>
    </Tooltip>
  );
}
