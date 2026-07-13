import { Group, Panel, Separator, type GroupProps, type PanelProps, type SeparatorProps } from "react-resizable-panels";

import { cn } from "@/lib/utils";

/** 可调整面板组（横向/纵向） */
function ResizablePanelGroup({ className, ...props }: GroupProps) {
  return <Group className={cn("flex h-full w-full", className)} {...props} />;
}

const ResizablePanel = Panel;

/**
 * 拖拽分隔线：仅 hover / active 高亮；focus 不沿用高亮（拖完会残留焦点导致「粘住」）。
 * 布局占位宽度固定；视觉线用 before 绝对定位变色/加粗，避免挤动相邻面板。
 */
function ResizableHandle({ className, ...props }: SeparatorProps) {
  return (
    <Separator
      className={cn(
        // 固定占位（透明），不因悬停改变 flex 尺寸
        "relative w-1.5 shrink-0 bg-transparent",
        // 竖线（横向分栏）：左右拖
        "cursor-col-resize",
        // 键盘焦点：细环，不高亮整条线
        "focus-visible:ring-ring focus-visible:ring-1 focus-visible:outline-none",
        // 扩大命中区
        "after:absolute after:inset-y-0 after:left-1/2 after:w-3 after:-translate-x-1/2",
        // 视觉线：绝对居中，变粗不占布局
        "before:bg-border before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:transition-[width,background-color]",
        // 只在真正悬停或拖拽中高亮（不含 focus）
        "data-[separator=hover]:before:bg-primary data-[separator=active]:before:bg-primary",
        "data-[separator=hover]:before:w-0.5 data-[separator=active]:before:w-0.5",
        "data-[separator=disabled]:cursor-not-allowed",
        // 横线（纵向分栏）：上下拖
        "aria-[orientation=horizontal]:h-1.5 aria-[orientation=horizontal]:w-auto aria-[orientation=horizontal]:cursor-row-resize aria-[orientation=horizontal]:self-stretch",
        "aria-[orientation=horizontal]:after:inset-x-0 aria-[orientation=horizontal]:after:top-1/2 aria-[orientation=horizontal]:after:h-3 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:-translate-y-1/2 aria-[orientation=horizontal]:after:translate-x-0",
        "aria-[orientation=horizontal]:before:inset-x-0 aria-[orientation=horizontal]:before:top-1/2 aria-[orientation=horizontal]:before:left-0 aria-[orientation=horizontal]:before:h-px aria-[orientation=horizontal]:before:w-full aria-[orientation=horizontal]:before:-translate-y-1/2 aria-[orientation=horizontal]:before:translate-x-0",
        "aria-[orientation=horizontal]:data-[separator=hover]:before:h-0.5 aria-[orientation=horizontal]:data-[separator=active]:before:h-0.5",
        "aria-[orientation=horizontal]:data-[separator=hover]:before:w-full aria-[orientation=horizontal]:data-[separator=active]:before:w-full",
        className,
      )}
      {...props}
    />
  );
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
export type { PanelProps as ResizablePanelProps };
