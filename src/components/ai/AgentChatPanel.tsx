import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useVirtualizer, type ReactVirtualizer } from "@tanstack/react-virtual";
import { ArrowUp, LoaderCircle, Plus, Sparkles, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { streamAgentReply } from "@/services/ai";
import { EMPTY_CONVERSATIONS, useAgentChatStore } from "@/store/useAgentChatStore";
import { useLocaleStore } from "@/store/useLocaleStore";

import { toUserMessage } from "@/types/error";
import type { AgentChatMessage } from "@/types/ai";

const EMPTY_MESSAGES: readonly AgentChatMessage[] = [];

/** 对应 form 的 bottom-3（12px） */
const COMPOSER_BOTTOM_OFFSET_PX = 12;
/** 输入框高度尚未测到时的兜底 padding */
const COMPOSER_PAD_FALLBACK_PX = 144;

interface AgentChatPanelProps {
  projectId: string;
}

/** Agent 对话入口。模型与仓库上下文会在后续能力中通过 AiService 接入。 */
export function AgentChatPanel({ projectId }: AgentChatPanelProps) {
  const { t } = useTranslation();
  const composerRef = useRef<HTMLFormElement>(null);
  const stickToBottomRef = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const replyAbortControllerRef = useRef<AbortController | null>(null);
  const virtualizerRef = useRef<ReactVirtualizer<HTMLDivElement, HTMLDivElement> | null>(null);
  const messageRowElements = useRef<Map<number, HTMLDivElement>>(new Map());
  const messageRowResizeObserver = useRef<ResizeObserver | null>(null);
  const messageRowRefCallbacks = useRef<
    Map<number, (element: HTMLDivElement | null) => void>
  >(new Map());
  const messageSequence = useRef(0);
  const conversationSequence = useRef(0);
  const [draft, setDraft] = useState("");
  const [isReplying, setIsReplying] = useState(false);
  const [composerPadPx, setComposerPadPx] = useState(COMPOSER_PAD_FALLBACK_PX);
  const [messageViewport, setMessageViewport] = useState<HTMLDivElement | null>(null);
  const locale = useLocaleStore((state) => state.locale);
  const conversations = useAgentChatStore(
    (state) => state.conversationsByProjectId[projectId] ?? EMPTY_CONVERSATIONS,
  );
  const activeConversationId = useAgentChatStore(
    (state) => state.activeConversationIdByProjectId[projectId],
  );
  const createConversation = useAgentChatStore((state) => state.createConversation);
  const setActiveConversation = useAgentChatStore((state) => state.setActiveConversation);
  const deleteConversation = useAgentChatStore((state) => state.deleteConversation);
  const appendMessage = useAgentChatStore((state) => state.appendMessage);
  const updateMessage = useAgentChatStore((state) => state.updateMessage);
  const removeMessage = useAgentChatStore((state) => state.removeMessage);
  const activeConversation =
    conversations.find((conversation) => conversation.id === activeConversationId) ??
    conversations[0] ??
    null;
  const messages = activeConversation?.messages ?? EMPTY_MESSAGES;

  useEffect(() => {
    if (conversations.length > 0) {
      return;
    }
    conversationSequence.current += 1;
    createConversation(projectId, {
      id: `conversation-${Date.now()}-${conversationSequence.current}`,
      title: "",
      messages: [],
    });
  }, [conversations.length, createConversation, projectId]);

  useEffect(() => {
    return () => {
      replyAbortControllerRef.current?.abort();
    };
  }, []);

  /** 实测输入框高度，为消息列表预留底部空间，避免被浮层遮挡 */
  useLayoutEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    const update = (): void => {
      const height = el.getBoundingClientRect().height;
      setComposerPadPx(Math.ceil(height + COMPOSER_BOTTOM_OFFSET_PX));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
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
      entries.forEach((entry) => {
        const element = entry.target;
        const index = Number(element.getAttribute("data-index"));
        if (Number.isInteger(index)) {
          virtualizerRef.current?.resizeItem(
            index,
            Math.ceil(element.getBoundingClientRect().height),
          );
        }
      });
    });
    messageRowResizeObserver.current = observer;
    messageRowElements.current.forEach((element) => observer.observe(element));

    return () => {
      observer.disconnect();
      messageRowResizeObserver.current = null;
    };
  }, []);

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
  }, [activeConversation?.id]);

  useLayoutEffect(() => {
    if (!messageViewport || messages.length === 0 || !stickToBottomRef.current) {
      return;
    }
    let followUpFrameId: number | null = null;
    const frameId = window.requestAnimationFrame(() => {
      followUpFrameId = window.requestAnimationFrame(() => {
        if (stickToBottomRef.current) {
          messageViewport.scrollTop = messageViewport.scrollHeight;
        }
      });
    });
    return () => {
      window.cancelAnimationFrame(frameId);
      if (followUpFrameId != null) {
        window.cancelAnimationFrame(followUpFrameId);
      }
    };
  }, [
    activeConversation?.id,
    lastMessage?.content,
    lastMessage?.id,
    lastMessage?.isStreaming,
    messageViewport,
    messages.length,
    virtualizer,
  ]);

  function handleCreateConversation(): void {
    conversationSequence.current += 1;
    createConversation(projectId, {
      id: `conversation-${Date.now()}-${conversationSequence.current}`,
      title: "",
      messages: [],
    });
    setDraft("");
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  function handleDeleteConversation(conversationId: string): void {
    deleteConversation(projectId, conversationId);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const content = draft.trim();
    if (!content || !activeConversation || isReplying) {
      return;
    }

    messageSequence.current += 1;
    const userMessage: AgentChatMessage = {
      id: `user-${Date.now()}-${messageSequence.current}`,
      role: "user",
      content,
    };
    messageSequence.current += 1;
    const assistantMessage: AgentChatMessage = {
      id: `assistant-${Date.now()}-${messageSequence.current}`,
      role: "assistant",
      content: "",
      isStreaming: true,
    };
    const conversationId = activeConversation.id;
    appendMessage(projectId, conversationId, userMessage);
    appendMessage(projectId, conversationId, assistantMessage);
    setDraft("");

    const controller = new AbortController();
    replyAbortControllerRef.current = controller;
    setIsReplying(true);
    let contentBuffer = "";
    let animationFrameId: number | null = null;
    const flushReply = (): void => {
      animationFrameId = null;
      updateMessage(projectId, conversationId, assistantMessage.id, {
        content: contentBuffer,
      });
    };

    try {
      await streamAgentReply({
        messages: [...messages, userMessage],
        locale,
        signal: controller.signal,
        onDelta: (delta) => {
          contentBuffer += delta;
          if (animationFrameId == null) {
            animationFrameId = window.requestAnimationFrame(flushReply);
          }
        },
      });
      if (animationFrameId != null) {
        window.cancelAnimationFrame(animationFrameId);
        flushReply();
      }
      updateMessage(projectId, conversationId, assistantMessage.id, { isStreaming: false });
    } catch (error) {
      if (animationFrameId != null) {
        window.cancelAnimationFrame(animationFrameId);
        flushReply();
      }
      if (contentBuffer) {
        updateMessage(projectId, conversationId, assistantMessage.id, { isStreaming: false });
      } else {
        removeMessage(projectId, conversationId, assistantMessage.id);
      }
      if (!controller.signal.aborted) {
        toast.error(toUserMessage(error) || t("agent.replyFailed"));
      }
    } finally {
      if (replyAbortControllerRef.current === controller) {
        replyAbortControllerRef.current = null;
      }
      setIsReplying(false);
    }
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  return (
    <section
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
      aria-label={t("agent.title")}
    >
      <header className="flex h-10 shrink-0 items-center gap-1 px-3">
        <ScrollArea className="h-10 min-w-0 flex-1">
          <div className="flex h-10 w-max items-center gap-1 pr-1">
            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={cn(
                  "group relative max-w-32 shrink-0 rounded-md transition-colors",
                  conversation.id === activeConversation?.id ? "bg-muted" : "hover:bg-accent",
                )}
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-full bg-transparent px-2 text-xs transition-[padding] hover:bg-transparent group-hover:pr-7 group-focus-within:pr-7"
                  aria-pressed={conversation.id === activeConversation?.id}
                  onClick={() => setActiveConversation(projectId, conversation.id)}
                >
                  <span className="truncate">{conversation.title || t("agent.newConversation")}</span>
                </Button>
                <button
                  type="button"
                  className={cn(
                    "text-muted-foreground focus-visible:ring-ring absolute top-0 right-0 flex size-7 items-center justify-center bg-transparent p-0 opacity-0 outline-none transition-[opacity,color,transform] focus-visible:ring-1 group-hover:opacity-100 group-focus-within:opacity-100",
                    conversations.length > 1
                      ? "cursor-pointer hover:text-foreground hover:scale-110"
                      : "cursor-not-allowed group-hover:opacity-35 group-focus-within:opacity-35",
                  )}
                  aria-label={t("agent.deleteConversation")}
                  disabled={conversations.length <= 1}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleDeleteConversation(conversation.id);
                  }}
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground size-7 shrink-0"
              aria-label={t("agent.createConversation")}
              onClick={handleCreateConversation}
            >
              <Plus aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("agent.createConversation")}</TooltipContent>
        </Tooltip>
      </header>

      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
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
            <div
              className="relative w-full"
              style={{ height: `${virtualizer.getTotalSize()}px` }}
            >
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const message = messages[virtualItem.index];
                const isUser = message.role === "user";
                return (
                  <div
                    key={message.id}
                    data-index={virtualItem.index}
                    ref={getMessageRowRef(virtualItem.index)}
                    className="absolute top-0 left-0 w-full pb-3"
                    style={{ transform: `translateY(${virtualItem.start}px)` }}
                  >
                    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
                      <div
                        className={cn(
                          "w-fit max-w-[88%] whitespace-pre-wrap wrap-break-word rounded-lg px-3 py-2 text-xs leading-relaxed",
                          isUser
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground",
                        )}
                      >
                        {message.content ? <span>{message.content}</span> : null}
                        {message.isStreaming ? (
                          <span
                            className={cn(
                              "items-center gap-1.5",
                              message.content ? "ml-1 inline-flex" : "flex",
                            )}
                          >
                            <LoaderCircle className="size-3 animate-spin" aria-hidden="true" />
                            {!message.content ? <span>{t("agent.thinking")}</span> : null}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </ScrollArea>

        <form
          ref={composerRef}
          className="bg-background absolute inset-x-3 bottom-3 z-10 rounded-md"
          onSubmit={handleSubmit}
        >
          <div className="relative">
            <Textarea
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleInputKeyDown}
              aria-label={t("agent.inputPlaceholder")}
              placeholder={t("agent.inputPlaceholder")}
              className="h-28 min-h-28 resize-none px-3 py-2 pr-11 text-xs"
              disabled={isReplying}
            />
            <Button
              type="submit"
              size="icon"
              className="absolute right-2 bottom-2 size-8"
              aria-label={t("agent.sendMessage")}
              disabled={!activeConversation || draft.trim().length === 0 || isReplying}
            >
              {isReplying ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : (
                <ArrowUp aria-hidden="true" />
              )}
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
