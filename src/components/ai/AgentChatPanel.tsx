import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { AgentComposer } from "@/components/ai/AgentComposer";
import { AgentConversationTabs } from "@/components/ai/AgentConversationTabs";
import { AgentMessageList } from "@/components/ai/AgentMessageList";
import type { CompareBranchesAction } from "@/components/ai/AgentRichMessage";
import {
  deleteChatConversation,
  listChatConversations,
  reorderChatConversations,
  streamAgentReply,
  upsertChatConversation,
} from "@/services/ai";
import { openBranchCompareWindow } from "@/services/window/branchCompareWindow";
import { EMPTY_CONVERSATIONS, useAgentChatStore } from "@/store/useAgentChatStore";
import { useLocaleStore } from "@/store/useLocaleStore";
import { useRepoStore } from "@/store/useRepoStore";
import { toUserMessage } from "@/types/error";
import type { AgentBranchMention, AgentChatMessage, AgentConversation } from "@/types/ai";

const EMPTY_MESSAGES: readonly AgentChatMessage[] = [];

/** 对应 form 的 bottom-3（12px） */
const COMPOSER_BOTTOM_OFFSET_PX = 12;
/** 输入框高度尚未测到时的兜底 padding */
const COMPOSER_PAD_FALLBACK_PX = 144;

interface AgentChatPanelProps {
  projectId: string;
  repoPath: string;
}

/** Agent 对话入口：编排会话 / 消息列表 / 输入区；模型与仓库上下文经 AiService 接入。 */
export function AgentChatPanel({ projectId, repoPath }: AgentChatPanelProps) {
  const { t } = useTranslation();
  const composerRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const replyAbortControllerRef = useRef<AbortController | null>(null);
  const messageSequence = useRef(0);
  const conversationSequence = useRef(0);
  const [draftMarkup, setDraftMarkup] = useState("");
  const [draftPlainText, setDraftPlainText] = useState("");
  const [branchMentions, setBranchMentions] = useState<readonly AgentBranchMention[]>([]);
  const [isReplying, setIsReplying] = useState(false);
  const [thinkingEnabled, setThinkingEnabled] = useState(true);
  const [composerPadPx, setComposerPadPx] = useState(COMPOSER_PAD_FALLBACK_PX);
  const locale = useLocaleStore((state) => state.locale);
  const branches = useRepoStore((state) => state.branches);
  const conversations = useAgentChatStore(
    (state) => state.conversationsByProjectId[projectId] ?? EMPTY_CONVERSATIONS,
  );
  const activeConversationId = useAgentChatStore(
    (state) => state.activeConversationIdByProjectId[projectId],
  );
  const hydrateProject = useAgentChatStore((state) => state.hydrateProject);
  const createConversation = useAgentChatStore((state) => state.createConversation);
  const ensureDefaultConversation = useAgentChatStore(
    (state) => state.ensureDefaultConversation,
  );
  const setActiveConversation = useAgentChatStore((state) => state.setActiveConversation);
  const deleteConversation = useAgentChatStore((state) => state.deleteConversation);
  const renameConversation = useAgentChatStore((state) => state.renameConversation);
  const setConversationPinned = useAgentChatStore((state) => state.setConversationPinned);
  const reorderConversations = useAgentChatStore((state) => state.reorderConversations);
  const appendMessage = useAgentChatStore((state) => state.appendMessage);
  const updateMessage = useAgentChatStore((state) => state.updateMessage);
  const removeMessage = useAgentChatStore((state) => state.removeMessage);
  const activeConversation =
    conversations.find((conversation) => conversation.id === activeConversationId) ??
    conversations[0] ??
    null;
  const messages = activeConversation?.messages ?? EMPTY_MESSAGES;
  const branchMentionData = useMemo(
    () =>
      branches.map((branch) => ({
        id: branch.name,
        display: branch.name,
        isRemote: branch.isRemote,
      })),
    [branches],
  );

  function handleCompareBranches(action: CompareBranchesAction): void {
    const branchNames = new Set(branches.map((branch) => branch.name));
    if (!branchNames.has(action.base) || !branchNames.has(action.target)) {
      toast.error(t("agent.compareBranchesUnavailable"));
      return;
    }
    void openBranchCompareWindow({
      projectId,
      mode: "branch",
      base: action.base,
      target: action.target,
    }).catch((error: unknown) => {
      toast.error(toUserMessage(error) || t("agent.compareBranchesFailed"));
    });
  }

  useEffect(() => {
    let cancelled = false;
    replyAbortControllerRef.current?.abort();

    async function hydrate(): Promise<void> {
      try {
        const list = await listChatConversations({
          scope: "agent",
          projectId,
        });
        if (cancelled) {
          return;
        }
        if (list.length > 0) {
          hydrateProject(projectId, list);
          return;
        }
        ensureDefaultConversation(projectId);
        const created =
          useAgentChatStore.getState().conversationsByProjectId[projectId]?.[0];
        if (created) {
          await persistConversation(created);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        console.error(error);
        ensureDefaultConversation(projectId);
        toast.error(toUserMessage(error) || t("agent.replyFailed"));
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [ensureDefaultConversation, hydrateProject, projectId, t]);

  useEffect(() => {
    return () => {
      replyAbortControllerRef.current?.abort();
    };
  }, []);

  async function persistConversation(
    conversation: AgentConversation,
  ): Promise<void> {
    try {
      await upsertChatConversation({
        scope: "agent",
        projectId,
        conversation,
      });
    } catch (error) {
      console.error(error);
      toast.error(toUserMessage(error) || t("agent.replyFailed"));
    }
  }

  async function persistActiveConversation(conversationId: string): Promise<void> {
    const conversation = useAgentChatStore
      .getState()
      .conversationsByProjectId[projectId]
      ?.find((item) => item.id === conversationId);
    if (conversation) {
      await persistConversation(conversation);
    }
  }

  async function persistOrder(): Promise<void> {
    const orderedIds =
      useAgentChatStore.getState().conversationsByProjectId[projectId]?.map(
        (item) => item.id,
      ) ?? [];
    if (orderedIds.length === 0) {
      return;
    }
    try {
      await reorderChatConversations({
        scope: "agent",
        projectId,
        orderedIds,
      });
    } catch (error) {
      console.error(error);
      toast.error(toUserMessage(error) || t("agent.replyFailed"));
    }
  }

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

  function clearDraft(): void {
    setDraftMarkup("");
    setDraftPlainText("");
    setBranchMentions([]);
  }

  function nextMessageId(prefix: "user" | "assistant"): string {
    messageSequence.current += 1;
    return `${prefix}-${Date.now()}-${messageSequence.current}`;
  }

  function handleCreateConversation(): void {
    // 已有「新对话」（尚无消息）时只切换过去，避免叠多个空会话
    const emptyConversation = conversations.find(
      (conversation) => conversation.messages.length === 0,
    );
    if (emptyConversation) {
      if (emptyConversation.id !== activeConversation?.id) {
        setActiveConversation(projectId, emptyConversation.id);
        clearDraft();
      }
      window.requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }

    conversationSequence.current += 1;
    const created: AgentConversation = {
      id: `conversation-${Date.now()}-${conversationSequence.current}`,
      title: "",
      messages: [],
    };
    createConversation(projectId, created);
    void persistConversation(created);
    clearDraft();
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  /** 在已有 history（含最新用户消息、不含助手气泡）上追加流式回复 */
  async function streamAssistantForHistory(
    conversationId: string,
    historyForRequest: readonly AgentChatMessage[],
  ): Promise<void> {
    // 编辑/重生成前先中断上一轮，避免旧流写回错误气泡
    replyAbortControllerRef.current?.abort();
    replyAbortControllerRef.current = null;

    const askedAt = new Date().toISOString();
    const assistantMessage: AgentChatMessage = {
      id: nextMessageId("assistant"),
      role: "assistant",
      content: "",
      createdAt: askedAt,
      isStreaming: true,
    };

    flushSync(() => {
      appendMessage(projectId, conversationId, assistantMessage);
      setIsReplying(true);
    });

    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
    });

    const controller = new AbortController();
    replyAbortControllerRef.current = controller;
    let contentBuffer = "";
    let reasoningBuffer = "";
    let animationFrameId: number | null = null;
    let reasoningStartedAt: number | null = null;
    let reasoningDurationSettled = false;
    const settleReasoningDuration = (): void => {
      if (reasoningDurationSettled || reasoningStartedAt == null) {
        return;
      }
      reasoningDurationSettled = true;
      updateMessage(projectId, conversationId, assistantMessage.id, {
        reasoningDurationMs: Date.now() - reasoningStartedAt,
      });
    };
    const flushReply = (): void => {
      animationFrameId = null;
      updateMessage(projectId, conversationId, assistantMessage.id, {
        content: contentBuffer,
        ...(reasoningBuffer ? { reasoningContent: reasoningBuffer } : {}),
      });
    };

    try {
      await streamAgentReply({
        messages: historyForRequest,
        repoPath,
        locale,
        enableThinking: thinkingEnabled,
        signal: controller.signal,
        onReasoningDelta: (delta) => {
          if (reasoningStartedAt == null) {
            reasoningStartedAt = Date.now();
          }
          reasoningBuffer += delta;
          if (animationFrameId == null) {
            animationFrameId = window.requestAnimationFrame(flushReply);
          }
        },
        onDelta: (delta) => {
          settleReasoningDuration();
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
      settleReasoningDuration();
      updateMessage(projectId, conversationId, assistantMessage.id, {
        isStreaming: false,
        createdAt: new Date().toISOString(),
      });
      await persistActiveConversation(conversationId);
    } catch (error) {
      if (animationFrameId != null) {
        window.cancelAnimationFrame(animationFrameId);
        flushReply();
      }
      settleReasoningDuration();
      if (contentBuffer || reasoningBuffer) {
        updateMessage(projectId, conversationId, assistantMessage.id, {
          isStreaming: false,
          createdAt: new Date().toISOString(),
        });
        await persistActiveConversation(conversationId);
      } else {
        removeMessage(projectId, conversationId, assistantMessage.id);
        // 保留已发送的用户消息
        await persistActiveConversation(conversationId);
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const content = draftPlainText.trim();
    if (!content || !activeConversation || isReplying) {
      return;
    }

    const askedAt = new Date().toISOString();
    const userMessage: AgentChatMessage = {
      id: nextMessageId("user"),
      role: "user",
      content,
      createdAt: askedAt,
      mentions: branchMentions,
    };
    const conversationId = activeConversation.id;
    const historyForRequest = [...messages, userMessage];

    flushSync(() => {
      appendMessage(projectId, conversationId, userMessage);
      clearDraft();
    });
    void persistActiveConversation(conversationId);

    await streamAssistantForHistory(conversationId, historyForRequest);
  }

  async function handleRegenerateLast(): Promise<void> {
    if (!activeConversation || isReplying) {
      return;
    }
    const conversationId = activeConversation.id;
    const currentMessages =
      useAgentChatStore
        .getState()
        .conversationsByProjectId[projectId]
        ?.find((conversation) => conversation.id === conversationId)?.messages ?? [];
    const last = currentMessages[currentMessages.length - 1];
    if (!last || last.role !== "assistant" || last.isStreaming) {
      return;
    }
    const historyForRequest = currentMessages.slice(0, -1);
    const lastUser = historyForRequest[historyForRequest.length - 1];
    if (!lastUser || lastUser.role !== "user") {
      return;
    }

    flushSync(() => {
      removeMessage(projectId, conversationId, last.id);
    });
    void persistActiveConversation(conversationId);

    await streamAssistantForHistory(conversationId, historyForRequest);
  }

  async function handleEditUserMessage(
    messageId: string,
    content: string,
  ): Promise<void> {
    if (!activeConversation || isReplying) {
      return;
    }
    const trimmed = content.trim();
    if (!trimmed) {
      return;
    }
    const conversationId = activeConversation.id;

    // 经 getState 调用，避免闭包拿到旧 action；单次 set 保证截断与改文案同事务
    const historyForRequest = useAgentChatStore
      .getState()
      .editUserMessageAndTruncate(
        projectId,
        conversationId,
        messageId,
        trimmed,
      );
    if (!historyForRequest) {
      toast.error(t("agent.replyFailed"));
      return;
    }
    void persistActiveConversation(conversationId);

    await streamAssistantForHistory(conversationId, historyForRequest);
  }

  async function handleDeleteConversation(conversationId: string): Promise<void> {
    const before =
      useAgentChatStore.getState().conversationsByProjectId[projectId] ?? [];
    if (before.length <= 1) {
      return;
    }
    deleteConversation(projectId, conversationId);
    try {
      await deleteChatConversation(conversationId);
    } catch (error) {
      console.error(error);
      toast.error(toUserMessage(error) || t("agent.replyFailed"));
    }
  }

  return (
    <section
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
      aria-label={t("agent.title")}
    >
      <AgentConversationTabs
        conversations={conversations}
        activeConversationId={activeConversation?.id}
        onSelect={(conversationId) => setActiveConversation(projectId, conversationId)}
        onCreate={handleCreateConversation}
        onDelete={(conversationId) => {
          void handleDeleteConversation(conversationId);
        }}
        onRename={(conversationId, title) => {
          renameConversation(projectId, conversationId, title);
          void persistActiveConversation(conversationId);
        }}
        onPin={(conversationId, pinned) => {
          setConversationPinned(projectId, conversationId, pinned);
          void (async () => {
            await persistActiveConversation(conversationId);
            await persistOrder();
          })();
        }}
        onReorder={(activeId, overId) => {
          reorderConversations(projectId, activeId, overId);
          void persistOrder();
        }}
      />

      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        <AgentMessageList
          messages={messages}
          conversationId={activeConversation?.id}
          composerPadPx={composerPadPx}
          onCompareBranches={handleCompareBranches}
          actionsDisabled={isReplying}
          onRegenerateLast={() => {
            void handleRegenerateLast();
          }}
          onEditUserMessage={(messageId, content) => {
            void handleEditUserMessage(messageId, content);
          }}
        />

        {/* 与输入框同宽；高度覆盖输入区+底边，挡住圆角后方透出的消息，不盖滚动条 */}
        <div
          className="bg-background pointer-events-none absolute inset-x-3 bottom-0 z-[5]"
          style={{ height: composerPadPx }}
          aria-hidden="true"
        />

        <AgentComposer
          ref={composerRef}
          inputRef={inputRef}
          draftMarkup={draftMarkup}
          draftPlainText={draftPlainText}
          branchOptions={branchMentionData}
          isReplying={isReplying}
          canSubmit={Boolean(activeConversation)}
          showThinkingToggle
          thinkingEnabled={thinkingEnabled}
          onThinkingEnabledChange={setThinkingEnabled}
          onDraftChange={({ markup, plainText, mentions }) => {
            setDraftMarkup(markup);
            setDraftPlainText(plainText);
            setBranchMentions(mentions);
          }}
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
          onStop={() => {
            replyAbortControllerRef.current?.abort();
          }}
        />
      </div>
    </section>
  );
}
