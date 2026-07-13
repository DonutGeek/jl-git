import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

export interface DiffPreviewChange {
  /** modified 侧起始行（1-based，含） */
  startLine: number;
  /** modified 侧结束行（1-based，含）；纯删除时为 startLine - 1 */
  endLine: number;
  kind: "add" | "modify" | "delete";
}

interface DiffSidePreviewProps {
  /** 本地修改侧全文（用于画预览纹理） */
  text: string;
  changes: DiffPreviewChange[];
  className?: string;
  /** 明暗切换时触发重绘 */
  dark?: boolean;
  /** 跳转到 modified 侧某一行 */
  onJumpToLine: (lineNumber: number) => void;
  /** 当前视口：scrollTop / scrollHeight / clientHeight */
  viewport: {
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
  } | null;
}

const PREVIEW_WIDTH = 56;

/**
 * 差异视图最右侧代码预览图（只画本地修改侧），不依赖 Monaco 内置 minimap。
 */
export function DiffSidePreview({
  text,
  changes,
  className,
  dark = false,
  onJumpToLine,
  viewport,
}: DiffSidePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) {
      return;
    }

    const paint = (): void => {
      const dpr = window.devicePixelRatio || 1;
      const width = PREVIEW_WIDTH;
      const height = Math.max(1, Math.floor(container.clientHeight));
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const bg = resolveColor(container, "--background", "#ffffff");
      const border = resolveColor(container, "--border", "#e5e5e5");
      const added = resolveColor(container, "--git-added", "#16a34a");
      const deleted = resolveColor(container, "--git-deleted", "#dc2626");
      const modified = resolveColor(container, "--git-modified", "#2563eb");

      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      const lineCount = Math.max(1, text.length === 0 ? 1 : text.split("\n").length);
      const rowH = height / lineCount;

      for (const change of changes) {
        if (change.kind === "delete") {
          const y = ((Math.max(1, change.startLine) - 1) / lineCount) * height;
          ctx.fillStyle = deleted;
          ctx.globalAlpha = 0.7;
          ctx.fillRect(0, y, width, Math.max(3, rowH));
          ctx.globalAlpha = 1;
          continue;
        }
        const start = Math.max(1, change.startLine);
        const end = Math.max(start, change.endLine);
        const y = ((start - 1) / lineCount) * height;
        const h = Math.max(3, ((end - start + 1) / lineCount) * height);
        ctx.fillStyle = change.kind === "add" ? added : modified;
        ctx.globalAlpha = 0.65;
        ctx.fillRect(0, y, width, h);
        ctx.globalAlpha = 1;
      }

      // 视口区域：仅淡底，无描边外框
      if (viewport && viewport.scrollHeight > 0) {
        const ratio = viewport.clientHeight / viewport.scrollHeight;
        const thumbH = Math.max(12, height * Math.min(1, ratio));
        const maxTop = Math.max(0, height - thumbH);
        const denom = Math.max(1, viewport.scrollHeight - viewport.clientHeight);
        const thumbY = maxTop * (viewport.scrollTop / denom);
        ctx.fillStyle = border;
        ctx.globalAlpha = 0.28;
        ctx.fillRect(0, thumbY, width, thumbH);
        ctx.globalAlpha = 1;
      }
    };

    paint();
    const observer = new ResizeObserver(() => {
      paint();
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, [text, changes, viewport, dark]);

  function handlePointer(clientY: number): void {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const rect = container.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    const lineCount = text.length === 0 ? 1 : text.split("\n").length;
    const lineNumber = Math.max(1, Math.min(lineCount, Math.ceil(ratio * lineCount)));
    onJumpToLine(lineNumber);
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "border-border bg-muted/30 relative h-full shrink-0 cursor-pointer border-l",
        className,
      )}
      style={{ width: PREVIEW_WIDTH }}
      role="slider"
      aria-label="差异预览图"
      aria-valuemin={1}
      aria-valuemax={Math.max(1, text.split("\n").length)}
      tabIndex={0}
      title="点击跳转"
      onClick={(event) => {
        handlePointer(event.clientY);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onJumpToLine(1);
        }
      }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" aria-hidden="true" />
    </div>
  );
}

function resolveColor(
  element: HTMLElement,
  cssVar: string,
  fallback: string,
): string {
  const probe = document.createElement("span");
  probe.style.color = `var(${cssVar})`;
  probe.style.display = "none";
  element.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  element.removeChild(probe);
  return resolved || fallback;
}
