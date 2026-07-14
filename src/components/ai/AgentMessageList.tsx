import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useVirtualizer, type ReactVirtualizer } from "@tanstack/react-virtual";
import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AgentMessageItem } from "@/components/ai/AgentMessageItem";
import type { CompareBranchesAction } from "@/components/ai/AgentRichMessage";
import { EmptyState } from "@/components/common/EmptyState";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { AgentChatMessage } from "@/types/ai";

interface AgentMessageListProps {
  messages: readonly AgentChatMessage[];
  conversationId: string | undefined;
  composerPadPx: number;
  onCompareBranches: (action: CompareBranchesAction) => void;
}

/** 消息列表：虚拟滚动 + 粘底跟随流式输出 */
export function AgentMessageList({
  messages,
  conversationId,
  composerPadPx,
  onCompareBranches,
}: AgentMessageListProps) {
  const { t } = useTranslation();
  const stickToBottomRef = useRef(true);
  const messageViewportRef = useRef<HTMLDivElement | null>(null);
  const messagesLengthRef = useRef(0);
  const virtualizerRef = useRef<ReactVirtualizer<HTMLDivElement, HTMLDivElement> | null>(null);
  const messageRowElements = useRef<Map<number, HTMLDivElement>>(new Map());
  const messageRowResizeObserver = useRef<ResizeObserver | null>(null);
  const messageRowRefCallbacks = useRef<
    Map<number, (element: HTMLDivElement | null) => void>
  >(new Map());
  const [messageViewport, setMessageViewport] = useState<HTMLDivElement | null>(null);

  messagesLengthRef.current = messages.length;
  messageViewportRef.current = messageViewport;

  /** 贴底时滚到最末；虚拟列表高度常晚于内容更新，需在测量后再补一次 */
  const scrollToBottomIfSticky = useCallback((): void => {
    const viewport = messageViewportRef.current;
    if (!viewport || !stickToBottomRef.current) {
      return;
    }
    viewport.scrollTop = viewport.scrollHeight;
  }, []);

  /** ScrollArea Root 挂载后再取 Radix viewport，供虚拟列表滚动 */
  const bindMessageScrollArea = useCallback((node: HTMLDivElement | null) => {
    if (!node) {
      setMessageViewport(null);
      return;
    }
    const syncViewport = (): void => {
      const viewport = node.querySelector("[data-radix-scroll-area-viewport]");
      setMessageViewport(viewport instanceof HTMLDivElement ? viewport : null);
    };
    syncViewport();
    // Radix Viewport 可能晚一帧才挂上
    window.requestAnimationFrame(syncViewport);
  }, []);

  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: messages.length,
    getScrollElement: () => messageViewport,
    getItemKey: (index) => messages[index]?.id ?? index,
    estimateSize: (index) => {
      const content = messages[index]?.content ?? "";
      const lines = Math.max(1, Math.ceil(content.length / 40));
      return Math.min(24 + lines * 18, 2400);
    },
    measureElement: (element) => element.getBoundingClientRect().height,
    overscan: 8,
  });
  virtualizerRef.current = virtualizer;

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      let shouldCatchUp = false;
      entries.forEach((entry) => {
        const element = entry.target;
        const index = Number(element.getAttribute("data-index"));
        if (!Number.isInteger(index)) {
          return;
        }
        virtualizerRef.current?.resizeItem(
          index,
          Math.ceil(element.getBoundingClientRect().height),
        );
        // 末行变高时 scrollHeight 才更新，必须在测量后再贴底
        if (index === messagesLengthRef.current - 1) {
          shouldCatchUp = true;
        }
      });
      if (shouldCatchUp) {
        scrollToBottomIfSticky();
        window.requestAnimationFrame(scrollToBottomIfSticky);
      }
    });
    messageRowResizeObserver.current = observer;
    messageRowElements.current.forEach((element) => observer.observe(element));

    return () => {
      observer.disconnect();
      messageRowResizeObserver.current = null;
    };
  }, [scrollToBottomIfSticky]);

  const getMessageRowRef = useCallback(
    (index: number): ((element: HTMLDivElement | null) => void) => {
      const existingRef = messageRowRefCallbacks.current.get(index);
      if (existingRef) {
        return existingRef;
      }

      const ref = (element: HTMLDivElement | null): void => {
        const currentVirtualizer = virtualizerRef.current;
        if (!currentVirtualizer) {
          return;
        }

        const previousElement = messageRowElements.current.get(index);
        if (previousElement && previousElement !== element) {
          messageRowResizeObserver.current?.unobserve(previousElement);
        }
        currentVirtualizer.measureElement(element);
        if (element) {
          messageRowElements.current.set(index, element);
          messageRowResizeObserver.current?.observe(element);
          currentVirtualizer.resizeItem(index, Math.ceil(element.getBoundingClientRect().height));
        } else {
          messageRowElements.current.delete(index);
        }
      };
      messageRowRefCallbacks.current.set(index, ref);
      return ref;
    },
    [],
  );

  useLayoutEffect(() => {
    messageRowElements.current.forEach((element, index) => {
      virtualizer.resizeItem(index, Math.ceil(element.getBoundingClientRect().height));
    });
  }, [messages, virtualizer]);

  useEffect(() => {
    if (!messageViewport) {
      return;
    }
    const updateStickiness = (): void => {
      const remaining =
        messageViewport.scrollHeight - messageViewport.scrollTop - messageViewport.clientHeight;
      stickToBottomRef.current = remaining < 32;
    };
    updateStickiness();
    messageViewport.addEventListener("scroll", updateStickiness, { passive: true });
    return () => messageViewport.removeEventListener("scroll", updateStickiness);
  }, [messageViewport]);

  const lastMessage = messages[messages.length - 1];
  useEffect(() => {
    stickToBottomRef.current = true;
  }, [conversationId]);

  // 同步贴底 + 下一帧补滚；避免仅依赖双 rAF（流式过快时 cleanup 会取消未执行的滚动）
  useLayoutEffect(() => {
    if (!messageViewport || messages.length === 0 || !stickToBottomRef.current) {
      return;
    }
    scrollToBottomIfSticky();
    const frameId = window.requestAnimationFrame(scrollToBottomIfSticky);
    return () => window.cancelAnimationFrame(frameId);
  }, [
    conversationId,
    lastMessage?.content,
    lastMessage?.id,
    lastMessage?.isStreaming,
    messageViewport,
    messages.length,
    scrollToBottomIfSticky,
    virtualizer,
  ]);

  // 流式输出期间每帧贴底，跟上行高测量；用户上滑后 stick 为 false 则跳过
  useEffect(() => {
    if (!lastMessage?.isStreaming || !messageViewport) {
      return;
    }
    let cancelled = false;
    let frameId = 0;
    const loop = (): void => {
      if (cancelled) {
        return;
      }
      scrollToBottomIfSticky();
      frameId = window.requestAnimationFrame(loop);
    };
    frameId = window.requestAnimationFrame(loop);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
    };
  }, [lastMessage?.id, lastMessage?.isStreaming, messageViewport, scrollToBottomIfSticky]);

  // 流式结束后再补几次，消化最后一轮 resizeItem
  useEffect(() => {
    if (lastMessage?.isStreaming !== false || !messageViewport) {
      return;
    }
    scrollToBottomIfSticky();
    const timers = [0, 32, 80].map((delay) =>
      window.setTimeout(scrollToBottomIfSticky, delay),
    );
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [lastMessage?.id, lastMessage?.isStreaming, messageViewport, scrollToBottomIfSticky]);

  return (
    <ScrollArea ref={bindMessageScrollArea} className="h-full w-full">
      <div className="px-3 pt-2" style={{ paddingBottom: composerPadPx }}>
        {messages.length === 0 ? (
          <EmptyState
            compact
            className="h-full min-h-44"
            icon={<Sparkles />}
            title={t("agent.emptyState")}
            description={t("agent.emptyStateDescription")}
          />
        ) : null}
        <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const message = messages[virtualItem.index];
            return (
              <div
                key={message.id}
                data-index={virtualItem.index}
                ref={getMessageRowRef(virtualItem.index)}
                className="absolute top-0 left-0 w-full pb-3"
                style={{ transform: `translateY(${virtualItem.start}px)` }}
              >
                <AgentMessageItem message={message} onCompareBranches={onCompareBranches} />
              </div>
            );
          })}
        </div>
      </div>
    </ScrollArea>
  );
}
