import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { AgentComposer } from "@/components/ai/AgentComposer";
import { AgentConversationTabs } from "@/components/ai/AgentConversationTabs";
import { AgentMessageList } from "@/components/ai/AgentMessageList";
import type { CompareBranchesAction } from "@/components/ai/AgentRichMessage";
import { streamAgentReply } from "@/services/ai";
import { openBranchCompareWindow } from "@/services/window/branchCompareWindow";
import { EMPTY_CONVERSATIONS, useAgentChatStore } from "@/store/useAgentChatStore";
import { useLocaleStore } from "@/store/useLocaleStore";
import { useRepoStore } from "@/store/useRepoStore";
import { toUserMessage } from "@/types/error";
import type { AgentBranchMention, AgentChatMessage } from "@/types/ai";

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
  const [composerPadPx, setComposerPadPx] = useState(COMPOSER_PAD_FALLBACK_PX);
  const locale = useLocaleStore((state) => state.locale);
  const branches = useRepoStore((state) => state.branches);
  const conversations = useAgentChatStore(
    (state) => state.conversationsByProjectId[projectId] ?? EMPTY_CONVERSATIONS,
  );
  const activeConversationId = useAgentChatStore(
    (state) => state.activeConversationIdByProjectId[projectId],
  );
  const createConversation = useAgentChatStore((state) => state.createConversation);
  const ensureDefaultConversation = useAgentChatStore(
    (state) => state.ensureDefaultConversation,
  );
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
    ensureDefaultConversation(projectId);
  }, [ensureDefaultConversation, projectId]);

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

  function clearDraft(): void {
    setDraftMarkup("");
    setDraftPlainText("");
    setBranchMentions([]);
  }

  function handleCreateConversation(): void {
    conversationSequence.current += 1;
    createConversation(projectId, {
      id: `conversation-${Date.now()}-${conversationSequence.current}`,
      title: "",
      messages: [],
    });
    clearDraft();
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const content = draftPlainText.trim();
    if (!content || !activeConversation || isReplying) {
      return;
    }

    messageSequence.current += 1;
    const askedAt = new Date().toISOString();
    const userMessage: AgentChatMessage = {
      id: `user-${Date.now()}-${messageSequence.current}`,
      role: "user",
      content,
      createdAt: askedAt,
      mentions: branchMentions,
    };
    messageSequence.current += 1;
    const assistantMessage: AgentChatMessage = {
      id: `assistant-${Date.now()}-${messageSequence.current}`,
      role: "assistant",
      content: "",
      // 流式结束时再写成完成时间
      createdAt: askedAt,
      isStreaming: true,
    };
    const conversationId = activeConversation.id;
    const historyForRequest = [...messages, userMessage];

    // 先同步上屏用户消息并清空输入，避免等 Git/模型时感觉「回车卡住」
    flushSync(() => {
      appendMessage(projectId, conversationId, userMessage);
      appendMessage(projectId, conversationId, assistantMessage);
      clearDraft();
      setIsReplying(true);
    });

    // 等浏览器画出本帧后再拉快照 / 请求模型
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
    });

    const controller = new AbortController();
    replyAbortControllerRef.current = controller;
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
        messages: historyForRequest,
        repoPath,
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
      updateMessage(projectId, conversationId, assistantMessage.id, {
        isStreaming: false,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      if (animationFrameId != null) {
        window.cancelAnimationFrame(animationFrameId);
        flushReply();
      }
      if (contentBuffer) {
        updateMessage(projectId, conversationId, assistantMessage.id, {
          isStreaming: false,
          createdAt: new Date().toISOString(),
        });
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
        onDelete={(conversationId) => deleteConversation(projectId, conversationId)}
      />

      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        <AgentMessageList
          messages={messages}
          conversationId={activeConversation?.id}
          composerPadPx={composerPadPx}
          onCompareBranches={handleCompareBranches}
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
          onDraftChange={({ markup, plainText, mentions }) => {
            setDraftMarkup(markup);
            setDraftPlainText(plainText);
            setBranchMentions(mentions);
          }}
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        />
      </div>
    </section>
  );
}
