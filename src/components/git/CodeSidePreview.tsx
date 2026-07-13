import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

interface CodeSidePreviewProps {
  /** 文件全文，用于绘制代码纹理 */
  text: string;
  className?: string;
  dark?: boolean;
  onJumpRatio: (ratio: number) => void;
  viewport: {
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
  } | null;
}

/** 文件视图右侧代码缩略图宽度（略宽于差异双列条） */
const PREVIEW_WIDTH = 72;

/**
 * 文件视图右侧缩略图：绘制代码纹理 + 视口指示，点击可跳转。
 */
export function CodeSidePreview({
  text,
  className,
  dark = false,
  onJumpRatio,
  viewport,
}: CodeSidePreviewProps) {
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
      const ink = resolveColor(container, "--muted-foreground", "#737373");

      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      const lines = text.length === 0 ? [""] : text.split("\n");
      const lineCount = Math.max(1, lines.length);
      const rowH = height / lineCount;
      const barH = Math.max(1, Math.min(2.5, rowH * 0.75));

      ctx.fillStyle = ink;
      ctx.globalAlpha = dark ? 0.45 : 0.35;

      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i] ?? "";
        const y = i * rowH + Math.max(0, (rowH - barH) / 2);
        let x = 3;
        for (let c = 0; c < line.length && x < width - 3; c += 1) {
          const ch = line[c]!;
          if (ch === "\t") {
            x += 4;
            continue;
          }
          if (ch === " ") {
            x += 1.2;
            continue;
          }
          ctx.fillRect(x, y, 1.4, barH);
          x += 1.5;
        }
      }
      ctx.globalAlpha = 1;

      if (viewport && viewport.scrollHeight > 0) {
        const ratio = viewport.clientHeight / viewport.scrollHeight;
        const thumbH = Math.max(12, height * Math.min(1, ratio));
        const maxTop = Math.max(0, height - thumbH);
        const denom = Math.max(1, viewport.scrollHeight - viewport.clientHeight);
        const thumbY = maxTop * (viewport.scrollTop / denom);
        ctx.fillStyle = border;
        ctx.globalAlpha = 0.4;
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
  }, [text, viewport, dark]);

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
      aria-label="文件缩略图"
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
