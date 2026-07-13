import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

type Orientation = "horizontal" | "vertical";

interface SplitPaneProps {
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

/**
 * 双栏可拖分栏。
 * 注意：storageKey / defaultRatio 变化时必须重置 ratio（HMR 与换 key 都会踩坑）。
 */
export function SplitPane({
  orientation = "horizontal",
  defaultRatio = 30,
  minFirstPx = 160,
  minSecondPx = 200,
  storageKey,
  className,
  separatorClassName,
  first,
  second,
}: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(() => readRatio(storageKey, defaultRatio));
  const ratioRef = useRef(ratio);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startPos: number; startRatio: number } | null>(null);

  const isHorizontal = orientation === "horizontal";

  // storageKey / 默认比例变更时重新读取；用 layout 阶段同步，避免首帧错宽导致邻栏抖动
  useLayoutEffect(() => {
    const next = readRatio(storageKey, defaultRatio);
    setRatio(next);
    ratioRef.current = next;
  }, [storageKey, defaultRatio]);

  useEffect(() => {
    ratioRef.current = ratio;
  }, [ratio]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (!containerRef.current) {
        return;
      }

      const startPos = isHorizontal ? event.clientX : event.clientY;
      dragRef.current = { startPos, startRatio: ratioRef.current };
      setDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [isHorizontal],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragRef.current || !containerRef.current) {
        return;
      }

      const rect = containerRef.current.getBoundingClientRect();
      const size = isHorizontal ? rect.width : rect.height;
      if (size <= 0) {
        return;
      }

      const current = isHorizontal ? event.clientX : event.clientY;
      const deltaPx = current - dragRef.current.startPos;
      const deltaRatio = (deltaPx / size) * 100;
      let next = dragRef.current.startRatio + deltaRatio;

      const minFirstRatio = (minFirstPx / size) * 100;
      const minSecondRatio = (minSecondPx / size) * 100;
      next = Math.min(100 - minSecondRatio, Math.max(minFirstRatio, next));
      setRatio(next);
    },
    [isHorizontal, minFirstPx, minSecondPx],
  );

  const endDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) {
        return;
      }
      dragRef.current = null;
      setDragging(false);
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // ignore
      }
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, String(ratioRef.current));
        } catch {
          // ignore
        }
      }
      // 吞掉拖拽结束后的残影 click，避免点到下层列表误切换提交
      const suppressGhostClick = (clickEvent: MouseEvent): void => {
        clickEvent.preventDefault();
        clickEvent.stopPropagation();
        document.removeEventListener("click", suppressGhostClick, true);
      };
      document.addEventListener("click", suppressGhostClick, true);
      window.setTimeout(() => {
        document.removeEventListener("click", suppressGhostClick, true);
      }, 0);
    },
    [storageKey],
  );

  useEffect(() => {
    if (!dragging) {
      return;
    }
    const previous = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = isHorizontal ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = previous;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [dragging, isHorizontal]);

  // 首块按百分比；次块吃剩余空间，避免双百分比 + minWidth 互相顶死
  const firstStyle: CSSProperties = isHorizontal
    ? {
        flex: `0 0 ${ratio}%`,
        width: `${ratio}%`,
        minWidth: minFirstPx,
        maxWidth: `calc(100% - ${minSecondPx}px)`,
      }
    : {
        flex: `0 0 ${ratio}%`,
        height: `${ratio}%`,
        minHeight: minFirstPx,
        maxHeight: `calc(100% - ${minSecondPx}px)`,
      };

  const secondStyle: CSSProperties = isHorizontal
    ? {
        flex: "1 1 0%",
        minWidth: minSecondPx,
        width: 0,
      }
    : {
        flex: "1 1 0%",
        minHeight: minSecondPx,
        height: 0,
      };

  return (
    <div
      ref={containerRef}
      data-split-key={storageKey}
      data-split-ratio={ratio.toFixed(1)}
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-1",
        isHorizontal ? "flex-row" : "flex-col",
        className,
      )}
    >
      <div className="min-h-0 overflow-hidden" style={firstStyle}>
        {first}
      </div>

      <div
        role="separator"
        aria-orientation={isHorizontal ? "vertical" : "horizontal"}
        tabIndex={0}
        className={cn(
          "relative shrink-0 bg-transparent",
          isHorizontal ? "w-1.5 cursor-col-resize" : "h-1.5 cursor-row-resize",
          "before:bg-border before:absolute before:transition-[background-color,width,height]",
          isHorizontal
            ? "before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2"
            : "before:inset-x-0 before:top-1/2 before:h-px before:-translate-y-1/2",
          "hover:before:bg-primary",
          isHorizontal ? "hover:before:w-0.5" : "hover:before:h-0.5",
          dragging && "before:bg-primary",
          dragging && (isHorizontal ? "before:w-0.5" : "before:h-0.5"),
          "after:absolute",
          isHorizontal
            ? "after:inset-y-0 after:left-1/2 after:w-3 after:-translate-x-1/2"
            : "after:inset-x-0 after:top-1/2 after:h-3 after:-translate-y-1/2",
          separatorClassName,
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />

      <div className="min-h-0 overflow-hidden" style={secondStyle}>
        {second}
      </div>
    </div>
  );
}
