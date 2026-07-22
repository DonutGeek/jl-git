import type { ReactNode } from "react";

import {
  toggleCurrentWindowMaximize,
  WindowChromeControls,
} from "@/components/layout/WindowChromeControls";
import { useWindowChromeLayout } from "@/hooks/useWindowChromeLayout";
import { cn } from "@/lib/utils";

interface AppWindowHeaderProps {
  children: ReactNode;
  className?: string;
  /** 默认 h-12；多仓鲸灵等可用 h-11 */
  heightClassName?: string;
}

/**
 * 子窗统一顶栏：mac Overlay 左留白；Win/Linux 右侧自绘三键；空白区可拖、可双击最大化。
 * 标题文案留在 drag-region 内以便拖动；仅窗口控件 no-drag。
 */
export function AppWindowHeader({
  children,
  className,
  heightClassName = "h-12",
}: AppWindowHeaderProps) {
  const { headerPaddingClass, showCustomChromeControls } = useWindowChromeLayout();

  return (
    <header
      data-tauri-drag-region
      className={cn(
        "border-border bg-muted/40 flex shrink-0 items-center border-b px-4",
        heightClassName,
        headerPaddingClass,
        className,
      )}
      onDoubleClick={() => {
        if (showCustomChromeControls) {
          void toggleCurrentWindowMaximize();
        }
      }}
    >
      <div className="flex min-w-0 items-center gap-2">{children}</div>
      <div data-tauri-drag-region className="h-full min-w-2 flex-1" />
      {showCustomChromeControls ? <WindowChromeControls /> : null}
    </header>
  );
}
