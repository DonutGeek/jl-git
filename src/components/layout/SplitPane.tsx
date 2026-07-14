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
  const [containerSize, setContainerSize] = useState(0);
  const separatorPx = 6;

  // storageKey / 默认比例变更时重新读取；用 layout 阶段同步，避免首帧错宽导致邻栏抖动
  useLayoutEffect(() => {
    const next = readRatio(storageKey, defaultRatio);
    setRatio(next);
    ratioRef.current = next;
  }, [storageKey, defaultRatio]);

  useEffect(() => {
    ratioRef.current = ratio;
  }, [ratio]);

  // 实测容器尺寸：窗口过窄时按比例缩小两侧 min，并夹紧 ratio
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const update = (): void => {
      const rect = el.getBoundingClientRect();
      setContainerSize(isHorizontal ? rect.width : rect.height);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [isHorizontal]);

  const available = Math.max(0, containerSize - separatorPx);
  const totalMin = minFirstPx + minSecondPx;
  const minScale =
    available > 0 && totalMin > available ? available / totalMin : 1;
  const effMinFirst = Math.max(0, Math.floor(minFirstPx * minScale));
  const effMinSecond = Math.max(0, Math.floor(minSecondPx * minScale));

  // 容器变窄后夹紧 ratio，保证次栏至少留下 effMinSecond，避免右缘被 overflow 裁掉
  useLayoutEffect(() => {
    if (containerSize <= 0 || available <= 0) {
      return;
    }
    const minFirstRatio = (effMinFirst / containerSize) * 100;
    const maxFirstRatio = ((available - effMinSecond) / containerSize) * 100;
    const clamped = Math.min(
      Math.max(minFirstRatio, ratioRef.current),
      Math.max(minFirstRatio, maxFirstRatio),
    );
    if (Math.abs(clamped - ratioRef.current) > 0.05) {
      ratioRef.current = clamped;
      setRatio(clamped);
    }
  }, [available, containerSize, effMinFirst, effMinSecond]);

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

      const avail = Math.max(0, size - separatorPx);
      const scale =
        avail > 0 && minFirstPx + minSecondPx > avail
          ? avail / (minFirstPx + minSecondPx)
          : 1;
      const effFirst = minFirstPx * scale;
      const effSecond = minSecondPx * scale;
      const minFirstRatio = (effFirst / size) * 100;
      const maxFirstRatio = ((avail - effSecond) / size) * 100;
      next = Math.min(Math.max(minFirstRatio, next), Math.max(minFirstRatio, maxFirstRatio));
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

  // 首块按比例但允许收缩（flex-shrink:1）；次栏 minWidth 用 0，空间靠首块 maxWidth 预留
  // 避免「两侧都硬顶 minWidth」时总宽溢出、右栏边距被 overflow 裁掉
  const firstStyle: CSSProperties = isHorizontal
    ? {
        flex: `0 1 ${ratio}%`,
        width: `${ratio}%`,
        minWidth: 0,
        maxWidth: `calc(100% - ${effMinSecond + separatorPx}px)`,
      }
    : {
        flex: `0 1 ${ratio}%`,
        height: `${ratio}%`,
        minHeight: 0,
        maxHeight: `calc(100% - ${effMinSecond + separatorPx}px)`,
      };

  const secondStyle: CSSProperties = isHorizontal
    ? {
        flex: "1 1 0%",
        minWidth: 0,
        width: 0,
      }
    : {
        flex: "1 1 0%",
        minHeight: 0,
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
      <div
        className={cn("min-h-0 overflow-hidden", isHorizontal && "min-w-0")}
        style={firstStyle}
      >
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

      <div
        className={cn("min-h-0 overflow-hidden", isHorizontal && "min-w-0")}
        style={secondStyle}
      >
        {second}
      </div>
    </div>
  );
}
