import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useMemo,
  type CSSProperties,
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
/** 超过该数量才启用虚拟列表，少量候选项随内容收缩高度 */
const SUGGESTION_VIRTUALIZE_THRESHOLD = 24;
const SUGGESTION_PAD_Y_PX = 8;

const scrollAreaClassName = cn(
  "w-full max-h-72 px-1 py-1",
  "[&_[data-slot=scroll-area-viewport]>div]:!block [&_[data-slot=scroll-area-viewport]>div]:!min-w-0 [&_[data-slot=scroll-area-viewport]>div]:w-full",
  "[&_[data-slot=scroll-area-scrollbar][data-state=hidden]]:hidden",
);

function isSuggestionItem(node: ReactElement): boolean {
  const props = node.props as { role?: string; "data-slot"?: string };
  return props.role === "option" || props["data-slot"] === "suggestion-item";
}

/** 从 Mentions 容器中取出候选 li（兼容 ul / 包装层） */
function extractSuggestionItems(root: ReactElement): ReactElement[] {
  const result: ReactElement[] = [];

  function visit(node: ReactNode): void {
    Children.forEach(node, (child) => {
      if (!isValidElement(child)) {
        return;
      }
      if (isSuggestionItem(child)) {
        result.push(child);
        return;
      }
      const nested = (child.props as { children?: ReactNode }).children;
      if (nested != null) {
        visit(nested);
      }
    });
  }

  visit(root);
  return result;
}

function findFocusedIndex(items: readonly ReactElement[]): number {
  return items.findIndex((item) => {
    const props = item.props as { "data-focused"?: string; "aria-selected"?: boolean };
    return props["data-focused"] === "true" || props["aria-selected"] === true;
  });
}

interface MentionSuggestionVirtualListProps {
  children: ReactElement;
}

/**
 * Mentions 候选：ScrollArea；条目多时再用虚拟列表。
 * 少量候选项按内容高度收缩，避免大块空白。
 */
export function MentionSuggestionVirtualList({
  children,
}: MentionSuggestionVirtualListProps) {
  const items = useMemo(() => extractSuggestionItems(children), [children]);
  const focusedIndex = useMemo(() => findFocusedIndex(items), [items]);
  const { viewport, bindScrollArea } = useScrollAreaViewport();
  const useVirtual = items.length >= SUGGESTION_VIRTUALIZE_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: useVirtual ? items.length : 0,
    getScrollElement: () => viewport,
    estimateSize: () => SUGGESTION_ROW_ESTIMATE_PX,
    overscan: SUGGESTION_VIRTUAL_OVERSCAN,
    measureElement: (element) => element.getBoundingClientRect().height,
  });

  useEffect(() => {
    if (!useVirtual || focusedIndex < 0 || items.length === 0) {
      return;
    }
    virtualizer.scrollToIndex(focusedIndex, { align: "auto" });
  }, [focusedIndex, items.length, useVirtual, virtualizer]);

  if (items.length === 0) {
    return <div className="px-1 py-1">{children}</div>;
  }

  if (!useVirtual) {
    // 少量条目：原生滚动 + 随内容高度，避免 ScrollArea 定高撑出大块空白
    return (
      <div className="max-h-72 overflow-y-auto overscroll-contain px-1 py-1">
        <ul className="m-0 w-full min-w-0 list-none p-0" role="listbox">
          {items}
        </ul>
      </div>
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
      <ul
        className="relative m-0 w-full min-w-0 list-none p-0"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
        role="listbox"
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const item = items[virtualItem.index];
          if (!item) {
            return null;
          }
          const itemProps = item.props as {
            className?: string;
            style?: CSSProperties;
          };
          return cloneElement(
            item,
            {
              key: String(virtualItem.key),
              "data-index": virtualItem.index,
              ref: virtualizer.measureElement,
              className: cn(itemProps.className, "absolute top-0 left-0 w-full"),
              style: {
                ...itemProps.style,
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              },
            } as never,
          );
        })}
      </ul>
    </ScrollArea>
  );
}
