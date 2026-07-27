import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

/** 相对滚动内容高度的色块（0–1），对齐示例客户端的红删 / 绿增预览条 */
export interface DiffPreviewChange {
  topRatio: number;
  heightRatio: number;
  kind: "add" | "delete";
}

interface DiffSidePreviewProps {
  changes: DiffPreviewChange[];
  className?: string;
  /** 明暗切换时触发重绘 */
  dark?: boolean;
  /** 按预览条纵向比例跳转（0–1） */
  onJumpRatio: (ratio: number) => void;
  /** 当前视口：scrollTop / scrollHeight / clientHeight */
  viewport: {
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
  } | null;
}

/** 双列预览条：左删 / 右增（略加宽便于辨认） */
const PREVIEW_WIDTH = 24;
const COLUMN_GAP = 2;

/**
 * 差异视图最右侧预览条：左红右绿两列色块 + 淡视口，不画代码纹理。
 */
export function DiffSidePreview({
  changes,
  className,
  dark = false,
  onJumpRatio,
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

      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      // 左列删除、右列新增（与示例双轨一致）
      const colW = Math.max(1, Math.floor((width - COLUMN_GAP) / 2));
      const deleteX = 0;
      const addX = colW + COLUMN_GAP;

      for (const change of changes) {
        const y = Math.max(0, change.topRatio) * height;
        const h = Math.max(2, change.heightRatio * height);
        ctx.globalAlpha = 0.8;
        if (change.kind === "delete") {
          ctx.fillStyle = deleted;
          ctx.fillRect(deleteX, y, colW, h);
        } else {
          ctx.fillStyle = added;
          ctx.fillRect(addX, y, colW, h);
        }
        ctx.globalAlpha = 1;
      }

      // 视口指示：半透明灰块（对齐示例，无描边）
      if (viewport && viewport.scrollHeight > 0) {
        const ratio = viewport.clientHeight / viewport.scrollHeight;
        const thumbH = Math.max(10, height * Math.min(1, ratio));
        const maxTop = Math.max(0, height - thumbH);
        const denom = Math.max(1, viewport.scrollHeight - viewport.clientHeight);
        const thumbY = maxTop * (viewport.scrollTop / denom);
        ctx.fillStyle = border;
        ctx.globalAlpha = 0.35;
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
  }, [changes, viewport, dark]);

  function handlePointer(clientY: number): void {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const rect = container.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    onJumpRatio(ratio);
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "border-border bg-muted/20 relative h-full shrink-0 cursor-pointer border-l",
        className,
      )}
      style={{ width: PREVIEW_WIDTH }}
      role="slider"
      aria-label="差异预览图"
      aria-valuemin={0}
      aria-valuemax={100}
      tabIndex={0}
      title="点击跳转"
      onClick={(event) => {
        handlePointer(event.clientY);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onJumpRatio(0);
        }
      }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" aria-hidden="true" />
    </div>
  );
}

function resolveColor(element: HTMLElement, cssVar: string, fallback: string): string {
  const probe = document.createElement("span");
  probe.style.color = `var(${cssVar})`;
  probe.style.display = "none";
  element.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  element.removeChild(probe);
  return resolved || fallback;
}
