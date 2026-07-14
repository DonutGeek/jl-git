import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowUp, Plus, Sparkles, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { EMPTY_CONVERSATIONS, useAgentChatStore } from "@/store/useAgentChatStore";

import type { AgentChatMessage } from "@/types/ai";

const EMPTY_MESSAGES: readonly AgentChatMessage[] = [];

interface AgentChatPanelProps {
  projectId: string;
}

/** Agent 对话入口。模型与仓库上下文会在后续能力中通过 AiService 接入。 */
export function AgentChatPanel({ projectId }: AgentChatPanelProps) {
  const { t } = useTranslation();
  const messageScrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messageSequence = useRef(0);
  const conversationSequence = useRef(0);
  const [draft, setDraft] = useState("");
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
  const activeConversation =
    conversations.find((conversation) => conversation.id === activeConversationId) ??
    conversations[0] ??
    null;
  const messages = activeConversation?.messages ?? EMPTY_MESSAGES;

  function getMessageViewport(): HTMLDivElement | null {
    const viewport = messageScrollAreaRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]",
    );
    return viewport instanceof HTMLDivElement ? viewport : null;
  }

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

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: getMessageViewport,
    estimateSize: () => 72,
    overscan: 8,
  });

  useEffect(() => {
    if (messages.length === 0) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      virtualizer.scrollToIndex(messages.length - 1, { align: "end" });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [activeConversation?.id, messages.length, virtualizer]);

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

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const content = draft.trim();
    if (!content) {
      return;
    }

    messageSequence.current += 1;
    const message: AgentChatMessage = {
      id: `user-${Date.now()}-${messageSequence.current}`,
      role: "user",
      content,
    };
    if (!activeConversation) {
      return;
    }
    appendMessage(projectId, activeConversation.id, message);
    setDraft("");
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
      className="relative h-full min-h-0 min-w-0 overflow-hidden"
      aria-label={t("agent.title")}
    >
      <header className="absolute inset-x-0 top-0 z-20 flex h-10 items-center gap-1 px-3">
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
      <ScrollArea
        ref={messageScrollAreaRef}
        className="absolute inset-x-0 top-10 bottom-0"
      >
        <div className="min-h-full px-3 pt-4 pb-44">
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
                  ref={virtualizer.measureElement}
                  className="absolute top-0 left-0 w-full pb-3"
                  style={{ transform: `translateY(${virtualItem.start}px)` }}
                >
                  <div className={isUser ? "ml-auto max-w-[88%]" : "max-w-[92%]"}>
                    <p
                      className={
                        isUser
                          ? "bg-primary text-primary-foreground whitespace-pre-wrap wrap-break-word rounded-lg px-3 py-2 text-xs leading-relaxed"
                          : "bg-muted text-foreground whitespace-pre-wrap wrap-break-word rounded-lg px-3 py-2 text-xs leading-relaxed"
                      }
                    >
                      {message.content}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </ScrollArea>

      <form className="absolute inset-x-3 bottom-3 z-10" onSubmit={handleSubmit}>
        <div className="relative">
          <Textarea
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleInputKeyDown}
            aria-label={t("agent.inputPlaceholder")}
            placeholder={t("agent.inputPlaceholder")}
            className="h-28 min-h-28 resize-none px-3 py-2 pr-11 text-xs"
          />
          <Button
            type="submit"
            size="icon"
            className="absolute right-2 bottom-2 size-8"
            aria-label={t("agent.sendMessage")}
            disabled={!activeConversation || draft.trim().length === 0}
          >
            <ArrowUp aria-hidden="true" />
          </Button>
        </div>
      </form>
    </section>
  );
}
