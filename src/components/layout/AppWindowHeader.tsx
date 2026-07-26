import type { ReactNode } from "react";

import { useWindowChromeLayout } from "@/hooks/useWindowChromeLayout";
import { cn } from "@/lib/utils";

interface AppWindowHeaderProps {
  children: ReactNode;
  className?: string;
  /** 默认 h-12；多仓鲸灵等可用 h-11 */
  heightClassName?: string;
}

/**
 * 子窗统一顶栏：mac Overlay 左留白 + 自绘拖拽；Win/Linux 仅系统标题栏拖移（避免 IPC 前摇）。
 */
export function AppWindowHeader({
  children,
  className,
  heightClassName = "h-12",
}: AppWindowHeaderProps) {
  const { headerPaddingClass, isMacOverlay } = useWindowChromeLayout();
  const dragProps = isMacOverlay
    ? ({ "data-tauri-drag-region": true } as const)
    : {};

  return (
    <header
      {...dragProps}
      className={cn(
        "border-border bg-muted/40 flex shrink-0 items-center border-b px-4",
        heightClassName,
        headerPaddingClass,
        className,
      )}
    >
      <div {...dragProps} className="flex min-w-0 items-center gap-2">
        {children}
      </div>
      <div {...dragProps} className="h-full min-w-2 flex-1" />
    </header>
  );
}
