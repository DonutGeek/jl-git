import type { ComponentProps } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface DropdownMenuScrollAreaProps extends Omit<ComponentProps<typeof ScrollArea>, "style"> {
  itemCount: number;
  /** 单行预估高度，默认与 DropdownMenuItem 的 32px 高度一致 */
  itemHeight?: number;
  /** 列表最大高度 */
  maxHeight?: number;
  /** 搜索栏等固定内容占用的高度 */
  availableHeightOffset?: number;
}

/**
 * 下拉菜单长列表滚动区。
 * ScrollArea 仅设置 max-height 时无法为 Radix viewport 提供确定高度，
 * 因此根据条目数计算显式高度，并继续受屏幕可用空间约束。
 */
export function DropdownMenuScrollArea({
  itemCount,
  itemHeight = 32,
  maxHeight = 256,
  availableHeightOffset = 0,
  className,
  children,
  ...props
}: DropdownMenuScrollAreaProps) {
  const contentHeight = Math.min(Math.max(itemCount, 1) * itemHeight + 8, maxHeight);
  const availableHeight =
    availableHeightOffset > 0
      ? `max(2.5rem, calc(var(--radix-dropdown-menu-content-available-height) - ${availableHeightOffset}px))`
      : "var(--radix-dropdown-menu-content-available-height)";

  return (
    <ScrollArea
      className={cn(
        "[&_[data-slot=scroll-area-viewport]>div]:!block [&_[data-slot=scroll-area-viewport]>div]:!min-w-0 [&_[data-slot=scroll-area-viewport]>div]:w-full",
        className,
      )}
      style={{
        height: `min(${contentHeight}px, ${availableHeight})`,
      }}
      {...props}
    >
      {children}
    </ScrollArea>
  );
}
