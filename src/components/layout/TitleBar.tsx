import { ReactNode, type CSSProperties } from "react";

import { useWindowChromeLayout } from "@/hooks/useWindowChromeLayout";
import { cn } from "@/lib/utils";

interface TitleBarProps {
  left: ReactNode;
  right?: ReactNode;
  className?: string;
}

const noDragStyle = { WebkitAppRegion: "no-drag" } as CSSProperties;

/**
 * macOS Overlay 标题栏：中间空白区可拖拽；左右控件 no-drag 保证可点。
 * Win/Linux 不挂自绘 drag-region（系统标题栏拖移，避免 IPC 前摇）。
 */
export function TitleBar({ left, right, className }: TitleBarProps) {
  const { isMacOverlay } = useWindowChromeLayout();
  const dragProps = isMacOverlay
    ? ({ "data-tauri-drag-region": true } as const)
    : {};

  return (
    <header
      {...dragProps}
      className={cn(
        "border-border bg-background relative z-40 flex h-12 shrink-0 items-center border-b pr-3 pl-[72px]",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2" style={noDragStyle}>
        {left}
      </div>

      <div {...dragProps} className="h-full min-w-8 flex-1" />

      {right ? (
        <div className="flex shrink-0 items-center gap-1" style={noDragStyle}>
          {right}
        </div>
      ) : (
        <div {...dragProps} className="h-full w-3 shrink-0" />
      )}
    </header>
  );
}
