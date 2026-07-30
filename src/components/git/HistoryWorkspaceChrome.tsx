import type { ReactNode, RefObject } from "react";

import { ResizableSplit } from "@/components/layout/ResizableSplit";
import { cn } from "@/lib/utils";

const HISTORY_DETAIL_SPLIT_KEY = "jlgit:split:history-detail";

interface HistoryWorkspaceChromeProps {
  className?: string;
  list: ReactNode;
  detail: ReactNode;
  overlay?: ReactNode;
  overlayOpen?: boolean;
  containerRef?: RefObject<HTMLDivElement | null>;
}

interface HistoryListChromeProps {
  "aria-label": string;
  children: ReactNode;
  className?: string;
}

interface HistoryDetailChromeProps {
  children: ReactNode;
  className?: string;
}

/**
 * 历史页稳定外壳：真实数据与 Loading 只提供左右内容和可选覆盖层。
 * 此组件不读取仓库状态，避免 Loading 路径触发 Git 派生计算。
 */
export function HistoryWorkspaceChrome({
  className,
  list,
  detail,
  overlay,
  overlayOpen = false,
  containerRef,
}: HistoryWorkspaceChromeProps) {
  return (
    <div
      ref={containerRef}
      className={cn("relative flex h-full min-h-0 min-w-0 flex-1 overflow-hidden", className)}
      data-history-workspace-chrome="true"
    >
      <ResizableSplit
        orientation="horizontal"
        defaultRatio={68}
        minFirstPx={420}
        minSecondPx={280}
        storageKey={HISTORY_DETAIL_SPLIT_KEY}
        separatorClassName={overlayOpen ? "z-40" : undefined}
        first={
          <aside
            className={cn(
              "h-full min-h-0 min-w-0 overflow-hidden",
              overlayOpen && "pointer-events-none",
            )}
            data-history-list-pane="true"
          >
            {list}
          </aside>
        }
        second={
          <aside className="h-full min-h-0 min-w-0 overflow-hidden" data-history-detail-pane="true">
            {detail}
          </aside>
        }
      />
      {overlay}
    </div>
  );
}

/** 历史列表顶部控制区；Loading 可注入无状态占位控件复用高度与边界。 */
export function HistoryListChrome({
  "aria-label": ariaLabel,
  children,
  className,
}: HistoryListChromeProps) {
  return (
    <div
      className={cn(
        "border-border flex h-11 shrink-0 items-center gap-1.5 border-b px-2",
        className,
      )}
      role="toolbar"
      aria-label={ariaLabel}
      data-history-list-chrome="true"
    >
      {children}
    </div>
  );
}

/** 历史详情顶部控制区；真实详情与 Loading 共用高度、边界和居中布局。 */
export function HistoryDetailChrome({ children, className }: HistoryDetailChromeProps) {
  return (
    <header
      className={cn(
        "border-border flex h-11 shrink-0 items-center justify-center border-b px-3",
        className,
      )}
      data-history-detail-chrome="true"
    >
      {children}
    </header>
  );
}
