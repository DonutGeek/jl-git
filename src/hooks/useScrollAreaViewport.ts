import { useCallback, useState } from "react";

/**
 * 绑定 shadcn ScrollArea Root，解析 Radix viewport 供 @tanstack/react-virtual 使用。
 */
export function useScrollAreaViewport(): {
  viewport: HTMLDivElement | null;
  bindScrollArea: (node: HTMLDivElement | null) => void;
} {
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);

  const bindScrollArea = useCallback((node: HTMLDivElement | null) => {
    if (!node) {
      setViewport(null);
      return;
    }

    const syncViewport = (): void => {
      const next = node.querySelector("[data-radix-scroll-area-viewport]");
      setViewport(next instanceof HTMLDivElement ? next : null);
    };

    syncViewport();
    // Radix Viewport 可能晚一帧才挂上
    window.requestAnimationFrame(syncViewport);
  }, []);

  return { viewport, bindScrollArea };
}
