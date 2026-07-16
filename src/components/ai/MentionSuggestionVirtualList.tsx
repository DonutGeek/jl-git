import {
  Children,
  isValidElement,
  useEffect,
  useMemo,
  type ReactElement,
  type ReactNode,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { ScrollArea } from "@/components/ui/scroll-area";
import { useScrollAreaViewport } from "@/hooks/useScrollAreaViewport";
import { cn } from "@/lib/utils";

const SUGGESTION_MAX_HEIGHT_PX = 288;
const SUGGESTION_ROW_ESTIMATE_PX = 36;
const SUGGESTION_VIRTUAL_OVERSCAN = 8;
const SUGGESTION_PAD_Y_PX = 8;

const scrollAreaClassName = cn(
  "w-full max-h-72 px-1 py-1",
  "[&_[data-slot=scroll-area-viewport]>div]:!block [&_[data-slot=scroll-area-viewport]>div]:!min-w-0 [&_[data-slot=scroll-area-viewport]>div]:w-full",
  "[&_[data-slot=scroll-area-scrollbar][data-state=hidden]]:hidden",
);

/** 从 listbox ul 直接取子节点（memo 候选项渲染前没有 role=option） */
function extractListboxChildren(node: ReactElement): ReactElement[] | null {
  const props = node.props as {
    children?: ReactNode;
    role?: string;
    "data-slot"?: string;
  };
  if (props.role !== "listbox" && props["data-slot"] !== "suggestions-list") {
    return null;
  }
  const result: ReactElement[] = [];
  Children.forEach(props.children, (child) => {
    if (isValidElement(child)) {
      result.push(child);
    }
  });
  return result;
}

function extractSuggestionItems(root: ReactElement): ReactElement[] {
  const direct = extractListboxChildren(root);
  if (direct) {
    return direct;
  }

  let found: ReactElement[] | null = null;
  function visit(node: ReactNode): void {
    if (found) {
      return;
    }
    Children.forEach(node, (child) => {
      if (found || !isValidElement(child)) {
        return;
      }
      const list = extractListboxChildren(child);
      if (list) {
        found = list;
        return;
      }
      visit((child.props as { children?: ReactNode }).children);
    });
  }
  visit(root);
  return found ?? [];
}

function findFocusedIndex(items: readonly ReactElement[]): number {
  return items.findIndex((item) => {
    const props = item.props as {
      focused?: boolean;
      "data-focused"?: string;
      "aria-selected"?: boolean;
    };
    // react-mentions-ts 候选项是 memo 组件，焦点在 focused prop 上
    return (
      props.focused === true ||
      props["data-focused"] === "true" ||
      props["aria-selected"] === true
    );
  });
}

interface MentionSuggestionVirtualListProps {
  children: ReactElement;
}

/**
 * Mentions 候选：ScrollArea + 虚拟列表。
 * 库的 SuggestionItem 不转发 style/ref，故用外层 div 承担定位与测高。
 */
export function MentionSuggestionVirtualList({
  children,
}: MentionSuggestionVirtualListProps) {
  const items = useMemo(() => extractSuggestionItems(children), [children]);
  const focusedIndex = useMemo(() => findFocusedIndex(items), [items]);
  const { viewport, bindScrollArea } = useScrollAreaViewport();
  const listAriaLabel = (children.props as { "aria-label"?: string })["aria-label"];

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => viewport,
    estimateSize: () => SUGGESTION_ROW_ESTIMATE_PX,
    overscan: SUGGESTION_VIRTUAL_OVERSCAN,
    measureElement: (element) => element.getBoundingClientRect().height,
  });

  useEffect(() => {
    if (focusedIndex < 0 || items.length === 0) {
      return;
    }
    virtualizer.scrollToIndex(focusedIndex, { align: "auto" });
  }, [focusedIndex, items.length, virtualizer]);

  if (items.length === 0) {
    return (
      <ScrollArea
        className={scrollAreaClassName}
        style={{ maxHeight: SUGGESTION_MAX_HEIGHT_PX }}
      >
        {children}
      </ScrollArea>
    );
  }

  const contentHeight =
    virtualizer.getTotalSize() || items.length * SUGGESTION_ROW_ESTIMATE_PX;
  const listHeight = Math.min(
    SUGGESTION_MAX_HEIGHT_PX,
    contentHeight + SUGGESTION_PAD_Y_PX,
  );

  return (
    <ScrollArea
      ref={bindScrollArea}
      className={scrollAreaClassName}
      style={{ height: listHeight, maxHeight: SUGGESTION_MAX_HEIGHT_PX }}
    >
      {/* 用 div 而非 ul：候选项本身已渲染为 li，避免嵌套 */}
      <div
        className="relative m-0 w-full min-w-0 p-0"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
        role="listbox"
        aria-label={listAriaLabel}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const item = items[virtualItem.index];
          if (!item) {
            return null;
          }
          return (
            <div
              key={String(virtualItem.key)}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 w-full"
              style={{ transform: `translateY(${virtualItem.start}px)` }}
            >
              {item}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
