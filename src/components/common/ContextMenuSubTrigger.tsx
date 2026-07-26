import type { ComponentProps } from "react";

import { ContextMenuSubTrigger as UiContextMenuSubTrigger } from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";

type ContextMenuSubTriggerProps = ComponentProps<typeof UiContextMenuSubTrigger>;

/**
 * 右键二级菜单触发项。
 * 官方 ContextMenuSubTrigger 未带 gap-2，带图标时会与文案贴死；
 * 此处与 ContextMenuItem / DropdownMenuSubTrigger 对齐。
 */
export function ContextMenuSubTrigger({
  className,
  ...props
}: ContextMenuSubTriggerProps) {
  return (
    <UiContextMenuSubTrigger className={cn("gap-2", className)} {...props} />
  );
}
