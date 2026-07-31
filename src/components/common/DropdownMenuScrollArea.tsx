import type { ComponentProps } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { SCROLL_AREA_LIST_CLASSNAME } from "@/utils/scrollListGutter";

interface DropdownMenuScrollAreaProps extends Omit<ComponentProps<typeof ScrollArea>, "style"> {
  itemCount: number;
  /** 单行预估高度，默认与 DropdownMenuItem 的 32px 高度一致 */
  itemHeight?: number;
  /** 分组标题等额外高度（随内容增高，避免只按条目数压矮） */
  extraHeight?: number;
  /** 列表最大高度；内容少时高度随内容，多时封顶并滚动 */
  maxHeight?: number;
  /**
   * 搜索栏等固定内容占用的高度。
   * 仅用于收紧视口上限，不再把短列表压成「一条多高」。
   */
  availableHeightOffset?: number;
}

/**
 * 下拉菜单长列表滚动区。
 * 高度随条目与额外区域增长，上限 maxHeight；内容超出后滚动。
 */
export function DropdownMenuScrollArea({
  itemCount,
  itemHeight = 32,
  extraHeight = 0,
  maxHeight = 256,
  availableHeightOffset = 0,
  className,
  children,
  ...props
}: DropdownMenuScrollAreaProps) {
  const estimated = Math.max(itemCount, 1) * itemHeight + Math.max(0, extraHeight) + 8;
  const contentHeight = Math.min(estimated, maxHeight);
  const viewportCap =
    availableHeightOffset > 0
      ? `min(${maxHeight}px, max(${contentHeight}px, calc(var(--radix-dropdown-menu-content-available-height, ${maxHeight}px) - ${availableHeightOffset}px)))`
      : `${maxHeight}px`;

  return (
    <ScrollArea
      className={cn(SCROLL_AREA_LIST_CLASSNAME, className)}
      style={{
        height: `${contentHeight}px`,
        maxHeight: viewportCap,
      }}
      {...props}
    >
      {children}
    </ScrollArea>
  );
}
