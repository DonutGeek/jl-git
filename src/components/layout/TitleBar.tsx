import { ReactNode, type CSSProperties } from "react";

import { cn } from "@/lib/utils";

interface TitleBarProps {
  left: ReactNode;
  right?: ReactNode;
  className?: string;
}

const noDragStyle = { WebkitAppRegion: "no-drag" } as CSSProperties;

/**
 * macOS Overlay 标题栏：中间空白区可拖拽；左右控件 no-drag 保证可点。
 * 需要 capabilities 含 core:window:allow-start-dragging。
 */
export function TitleBar({ left, right, className }: TitleBarProps) {
  return (
    <header
      data-tauri-drag-region
      className={cn(
        "border-border bg-background relative z-40 flex h-12 shrink-0 items-center border-b pr-3 pl-[72px]",
        className,
      )}
    >
      {/* 交互区：禁止拖拽，避免挡住下拉/按钮 */}
      <div className="flex min-w-0 items-center gap-2" style={noDragStyle}>
        {left}
      </div>

      {/* 中间留白：真正可拖动的区域（子元素也要带 drag-region） */}
      <div data-tauri-drag-region className="h-full min-w-8 flex-1" />

      {right ? (
        <div className="flex shrink-0 items-center gap-1" style={noDragStyle}>
          {right}
        </div>
      ) : (
        <div data-tauri-drag-region className="h-full w-3 shrink-0" />
      )}
    </header>
  );
}
