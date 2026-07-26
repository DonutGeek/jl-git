import { useMemo, type ReactNode } from "react";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { cn } from "@/lib/utils";

type Orientation = "horizontal" | "vertical";

interface ResizableSplitProps {
  orientation?: Orientation;
  /** 首块初始占比 0–100 */
  defaultRatio?: number;
  minFirstPx?: number;
  minSecondPx?: number;
  storageKey?: string;
  className?: string;
  /** 分隔条额外 class（如弹层打开时抬高 z-index） */
  separatorClassName?: string;
  first: ReactNode;
  second: ReactNode;
}

/**
 * 业务层统一的 Resizable 分隔线样式（组合官方 Handle，禁止改 ui/resizable）。
 * - 1px 细线；悬停 / 拖拽中变 primary 并略加粗（before 伪元素，不挤布局）
 * - focus 不高亮整条（仅官方 ring）；松手后 data-separator 回 inactive
 */
export const RESIZABLE_HANDLE_CLASSNAME = cn(
  "bg-transparent",
  "before:bg-border before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:transition-[background-color,width,height]",
  "hover:before:bg-primary hover:before:w-0.5",
  "data-[separator=active]:before:bg-primary data-[separator=active]:before:w-0.5",
  // Group 为 vertical 时 Separator 的 aria-orientation=horizontal（横条）
  "aria-[orientation=horizontal]:before:inset-x-0 aria-[orientation=horizontal]:before:top-1/2 aria-[orientation=horizontal]:before:bottom-auto aria-[orientation=horizontal]:before:left-0 aria-[orientation=horizontal]:before:h-px aria-[orientation=horizontal]:before:w-full aria-[orientation=horizontal]:before:translate-x-0 aria-[orientation=horizontal]:before:-translate-y-1/2",
  "aria-[orientation=horizontal]:hover:before:h-0.5 aria-[orientation=horizontal]:hover:before:w-full",
  "aria-[orientation=horizontal]:data-[separator=active]:before:h-0.5 aria-[orientation=horizontal]:data-[separator=active]:before:w-full",
);

function readRatio(storageKey: string | undefined, fallback: number): number {
  if (!storageKey) {
    return fallback;
  }
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return fallback;
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 5 || value >= 95) {
      return fallback;
    }
    return value;
  } catch {
    return fallback;
  }
}

function writeRatio(storageKey: string, ratio: number): void {
  try {
    localStorage.setItem(storageKey, String(ratio));
  } catch {
    // ignore
  }
}

/**
 * 双栏可拖分栏：组合 shadcn Resizable。
 * 持久化只在用户松手后写 localStorage，避免 useDefaultLayout 订阅写回成环。
 */
export function ResizableSplit({
  orientation = "horizontal",
  defaultRatio = 30,
  minFirstPx = 160,
  minSecondPx = 200,
  storageKey,
  className,
  separatorClassName,
  first,
  second,
}: ResizableSplitProps) {
  const ratio = useMemo(
    () => readRatio(storageKey, defaultRatio),
    [storageKey, defaultRatio],
  );

  const defaultLayout = useMemo(
    () => ({
      first: ratio,
      second: 100 - ratio,
    }),
    [ratio],
  );

  return (
    <ResizablePanelGroup
      key={`${storageKey ?? "nosave"}-${defaultRatio}`}
      id={storageKey}
      orientation={orientation}
      className={cn("h-full min-h-0 min-w-0", className)}
      defaultLayout={defaultLayout}
      onLayoutChanged={(layout, meta) => {
        if (!storageKey || !meta.isUserInteraction) {
          return;
        }
        const next = layout.first;
        if (typeof next === "number" && next > 5 && next < 95) {
          writeRatio(storageKey, next);
        }
      }}
    >
      <ResizablePanel
        id="first"
        defaultSize={`${ratio}%`}
        minSize={`${minFirstPx}px`}
        className="min-h-0 min-w-0"
      >
        {first}
      </ResizablePanel>

      <ResizableHandle
        className={cn(RESIZABLE_HANDLE_CLASSNAME, separatorClassName)}
      />

      <ResizablePanel
        id="second"
        defaultSize={`${100 - ratio}%`}
        minSize={`${minSecondPx}px`}
        className="min-h-0 min-w-0"
      >
        {second}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
