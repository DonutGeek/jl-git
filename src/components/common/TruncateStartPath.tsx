import { useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

interface TruncateStartPathProps {
  path: string;
  className?: string;
  /** 悬停完整路径；默认等于 path */
  title?: string;
}

const ELLIPSIS = "…";

let measureCanvas: HTMLCanvasElement | null = null;

/** 用 canvas 测量文本像素宽度（与 DOM 字体一致时足够准） */
function measureTextWidth(text: string, font: string): number {
  if (typeof document === "undefined") {
    return text.length * 7;
  }
  if (!measureCanvas) {
    measureCanvas = document.createElement("canvas");
  }
  const context = measureCanvas.getContext("2d");
  if (!context) {
    return text.length * 7;
  }
  context.font = font;
  return context.measureText(text).width;
}

function readElementFont(element: HTMLElement): string {
  const style = getComputedStyle(element);
  return `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
}

/**
 * 按实际可用宽度尽量多保留尾部路径。
 * 先做字符级贴满，再在浪费不大时收成 …/segment，避免按整段跳截导致右侧空洞过大。
 */
function truncatePathStart(
  path: string,
  available: number,
  font: string,
): string {
  if (measureTextWidth(path, font) <= available) {
    return path;
  }

  // 字符二分：在可用宽度内保留最长后缀
  let low = 0;
  let high = path.length;
  while (low < high) {
    const mid = low + Math.ceil((high - low) / 2);
    const candidate = `${ELLIPSIS}${path.slice(path.length - mid)}`;
    if (measureTextWidth(candidate, font) <= available) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  if (low <= 0) {
    return ELLIPSIS;
  }

  const cut = path.length - low;
  const filled = `${ELLIPSIS}${path.slice(cut)}`;

  // 若截在段中间，尝试收到下一个 '/' 变成 …/xxx；仅当多出来的空白不大时才收
  const nextSlash = path.indexOf("/", cut);
  if (nextSlash > cut) {
    const atSep = `${ELLIPSIS}${path.slice(nextSlash)}`;
    if (
      measureTextWidth(atSep, font) <= available &&
      available - measureTextWidth(atSep, font) <= 24
    ) {
      return atSep;
    }
  }

  return filled;
}

/**
 * 路径过长时从左侧省略，优先露出文件名 / 尾部路径段。
 */
export function TruncateStartPath({
  path,
  className,
  title,
}: TruncateStartPathProps) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(path);

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const update = (): void => {
      const available = element.clientWidth;
      if (available <= 0) {
        setDisplay(path);
        return;
      }
      setDisplay(truncatePathStart(path, available, readElementFont(element)));
    };

    update();
    const observer = new ResizeObserver(() => {
      update();
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [path]);

  return (
    <span
      ref={containerRef}
      className={cn(
        // basis-0：在 flex 行内占满剩余宽度，避免按全文把父级撑开导致无法省略
        "min-w-0 flex-1 basis-0 overflow-hidden text-left text-xs whitespace-nowrap",
        className,
      )}
      title={title ?? path}
    >
      {display}
    </span>
  );
}
