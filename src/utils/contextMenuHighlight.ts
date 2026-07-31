import { cloneElement, useState, type ReactElement } from "react";

import { cn } from "@/lib/utils";

/** 列表项右键打开时的默认高亮（对齐常见选中态） */
export const CONTEXT_MENU_ITEM_HIGHLIGHT_CLASS = "bg-accent text-accent-foreground";

/**
 * 右键锚点用悬停态（不抢选中态）。
 * 变更列表等：右键 B 时 B 显示 hover，A 保持选中。
 */
export const CONTEXT_MENU_ITEM_HOVER_HIGHLIGHT_CLASS = "bg-accent/60";

/** 历史提交行：高亮在 li > button 上（与选中态 primary/15 对齐） */
export const CONTEXT_MENU_HISTORY_HIGHLIGHT_CLASS =
  "[&>button]:bg-primary/15 [&>button]:text-foreground";

/**
 * 跟踪 ContextMenu 开关；打开时可选回调（如选中该行）。
 * 配合 withContextMenuHighlight 给触发节点加高亮。
 */
export function useContextMenuOpen(onOpen?: () => void): {
  menuOpen: boolean;
  onOpenChange: (open: boolean) => void;
} {
  const [menuOpen, setMenuOpen] = useState(false);

  function onOpenChange(open: boolean): void {
    setMenuOpen(open);
    if (open) {
      onOpen?.();
    }
  }

  return { menuOpen, onOpenChange };
}

/** 菜单打开时给 asChild 触发节点追加高亮 class */
export function withContextMenuHighlight(
  child: ReactElement,
  menuOpen: boolean,
  highlightClassName: string = CONTEXT_MENU_ITEM_HIGHLIGHT_CLASS,
): ReactElement {
  const prevClassName =
    typeof child.props === "object" &&
    child.props != null &&
    "className" in child.props &&
    typeof child.props.className === "string"
      ? child.props.className
      : undefined;

  return cloneElement(child, {
    className: cn(prevClassName, menuOpen && highlightClassName),
    // 供样式 / 测试识别菜单锚点
    "data-context-menu-open": menuOpen ? "true" : undefined,
  } as never);
}
