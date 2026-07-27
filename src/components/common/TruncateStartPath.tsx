import { useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

interface TruncateStartPathProps {
  path: string;
  className?: string;
  /** 悬停完整路径；默认等于 path；传空字符串可禁用原生 title */
  title?: string;
  /**
   * 为 true 时不做省略、直接显示全文（用于「展开分支名」）。
   * 切换时保持同一组件实例，避免卸载/挂载导致列表闪烁。
   */
  disabled?: boolean;
}

const ELLIPSIS = "…";
/** 额外留白，避免刚好贴边时亚像素仍裁半个字 */
const MEASURE_SAFETY_PX = 2;

/** 历史行等场景：祖先节点标记省略预算宽度（通常为 flex-1 标签槽） */
export const TRUNCATE_BUDGET_ATTR = "data-truncate-budget";

/** 与真实 DOM 同字体测量，避免 canvas.measureText 偏乐观导致右侧裁半字 */
let measureSpan: HTMLSpanElement | null = null;

function ensureMeasureSpan(): HTMLSpanElement {
  if (!measureSpan) {
    measureSpan = document.createElement("span");
    measureSpan.setAttribute("aria-hidden", "true");
    measureSpan.style.cssText =
      "position:absolute;left:-99999px;top:0;visibility:hidden;pointer-events:none;white-space:nowrap;";
    document.body.appendChild(measureSpan);
  }
  return measureSpan;
}

function syncMeasureFont(from: HTMLElement): void {
  const span = ensureMeasureSpan();
  const style = getComputedStyle(from);
  span.style.fontStyle = style.fontStyle;
  span.style.fontWeight = style.fontWeight;
  span.style.fontSize = style.fontSize;
  span.style.fontFamily = style.fontFamily;
  span.style.letterSpacing = style.letterSpacing;
  span.style.fontFeatureSettings = style.fontFeatureSettings;
}

function measureDomTextWidth(text: string): number {
  if (typeof document === "undefined") {
    return text.length * 7;
  }
  const span = ensureMeasureSpan();
  span.textContent = text;
  return span.getBoundingClientRect().width;
}

function truncatePathStart(path: string, available: number): string {
  if (available <= 0) {
    return ELLIPSIS;
  }
  if (measureDomTextWidth(path) <= available) {
    return path;
  }

  let low = 0;
  let high = path.length;
  while (low < high) {
    const mid = low + Math.ceil((high - low) / 2);
    const candidate = `${ELLIPSIS}${path.slice(path.length - mid)}`;
    if (measureDomTextWidth(candidate) <= available) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  if (low <= 0) {
    return ELLIPSIS;
  }

  return `${ELLIPSIS}${path.slice(path.length - low)}`;
}

/**
 * 文本可用宽 = 预算槽宽 − 同壳图标/+N/padding/gap。
 * 药丸保持 w-max，只借用槽宽判断是否省略。
 */
function readBudgetTextWidth(element: HTMLElement): number {
  const budget = element.closest(`[${TRUNCATE_BUDGET_ATTR}]`);
  if (!(budget instanceof HTMLElement)) {
    return 0;
  }

  const shell = element.parentElement;
  const budgetWidth = budget.getBoundingClientRect().width;
  if (!shell) {
    return Math.floor(budgetWidth - MEASURE_SAFETY_PX);
  }

  let reserved = 0;
  for (const child of Array.from(shell.children)) {
    if (child === element || !(child instanceof HTMLElement)) {
      continue;
    }
    reserved += child.getBoundingClientRect().width;
  }

  const styles = getComputedStyle(shell);
  const gap = Number.parseFloat(styles.columnGap || styles.gap || "0") || 0;
  reserved += gap * Math.max(0, shell.children.length - 1);
  reserved +=
    (Number.parseFloat(styles.paddingLeft) || 0) + (Number.parseFloat(styles.paddingRight) || 0);

  return Math.max(0, Math.floor(budgetWidth - reserved - MEASURE_SAFETY_PX));
}

/**
 * 路径过长时从左侧省略，优先露出尾部。
 *
 * 为何曾出现「左侧有 …、右侧又被裁成半个字」：
 * canvas 量宽偏窄 → 截断串实际更宽 → 父级 max-w + overflow 从右边裁切，末字（如 0）变成「(」状残影。
 * 现改为与页面同字体的 DOM 测量，保证截断串真实放得下。
 */
export function TruncateStartPath({
  path,
  className,
  title,
  disabled = false,
}: TruncateStartPathProps) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(path);

  useLayoutEffect(() => {
    if (disabled) {
      setDisplay((prev) => (prev === path ? prev : path));
      return;
    }

    const element = containerRef.current;
    if (!element) {
      return;
    }

    const budget = element.closest(`[${TRUNCATE_BUDGET_ATTR}]`);
    const observeTarget = budget instanceof HTMLElement ? budget : element;

    const update = (): void => {
      syncMeasureFont(element);
      const fromBudget = readBudgetTextWidth(element);

      if (fromBudget > 0) {
        const next = truncatePathStart(path, fromBudget);
        setDisplay((prev) => (prev === next ? prev : next));
        return;
      }

      // 无预算槽：默认全文；仅 flex 限宽（如文件路径）且明显不够时才省略
      const selfWidth = element.clientWidth;
      const fullWidth = measureDomTextWidth(path);
      if (selfWidth >= 8 && selfWidth + MEASURE_SAFETY_PX < fullWidth) {
        const next = truncatePathStart(
          path,
          Math.max(0, Math.floor(selfWidth - MEASURE_SAFETY_PX)),
        );
        setDisplay((prev) => (prev === next ? prev : next));
        return;
      }

      setDisplay((prev) => (prev === path ? prev : path));
    };

    update();
    const observer = new ResizeObserver(() => {
      update();
    });
    observer.observe(observeTarget);
    return () => {
      observer.disconnect();
    };
  }, [path, disabled]);

  if (disabled) {
    return (
      <span
        className={cn("text-left text-xs whitespace-nowrap", className)}
        title={title === undefined ? path : title || undefined}
      >
        {path}
      </span>
    );
  }

  return (
    <span
      ref={containerRef}
      className={cn("text-left text-xs whitespace-nowrap", className)}
      title={title === undefined ? path : title || undefined}
    >
      {display}
    </span>
  );
}
