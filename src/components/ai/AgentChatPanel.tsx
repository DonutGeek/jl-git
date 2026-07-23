import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { AgentComposer, type AgentMentionOption } from "@/components/ai/AgentComposer";
import { AgentConversationTabs } from "@/components/ai/AgentConversationTabs";
import { AgentMessageList } from "@/components/ai/AgentMessageList";
import { AgentCatalogPanel } from "@/components/ai/AgentCatalogPanel";
import type { CompareBranchesAction } from "@/components/ai/AgentRichMessage";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAgentModel } from "@/hooks/useAgentModel";
import { useHasAgentApiKey } from "@/hooks/useHasAgentApiKey";
import {
  appendAgentMentionMarkup,
  buildAgentPluginTryMarkup,
  type AgentPluginDefinition,
} from "@/plugins/agent/registry";
import {
  deleteChatConversation,
  formatDeepSeekModelLabel,
  formatDeepSeekModelShortLabel,
  listChatConversations,
  modelSupportsThinking,
  reorderChatConversations,
  streamJinglingReply,
  toastAiFailure,
  upsertChatConversation,
} from "@/services/ai";
import {
  disableAgentPlugin,
  filterEnabledAgentPlugins,
  filterEnabledAgentSkills,
  getDisabledAgentPluginIds,
} from "@/services/agent/agent.plugins";
import { openBranchCompareWindow } from "@/services/window/branchCompareWindow";
import { EMPTY_CONVERSATIONS, useAgentChatStore } from "@/store/useAgentChatStore";
import { useLocaleStore } from "@/store/useLocaleStore";
import { useRepoStore } from "@/store/useRepoStore";
import { toUserMessage } from "@/types/error";
import type { AgentChatMessage, AgentConversation, AgentMention } from "@/types/ai";
import { scheduleFocusInputCaretAtEnd } from "@/utils/focusInputCaretAtEnd";

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
  const hasApiKey = useHasAgentApiKey();
  const composerRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  /** 流式请求绑定会话，切换 Tab 后仍写回原 conversationId */
  const replySessionRef = useRef<{
    conversationId: string;
    controller: AbortController;
  } | null>(null);
  const messageSequence = useRef(0);
  const conversationSequence = useRef(0);
  const [draftMarkup, setDraftMarkup] = useState("");
  const [draftPlainText, setDraftPlainText] = useState("");
  const [draftMentions, setDraftMentions] = useState<readonly AgentMention[]>(
    [],
  );
  const [pluginsOpen, setPluginsOpen] = useState(false);
  const [replyingConversationId, setReplyingConversationId] = useState<
    string | null
  >(null);
  const [thinkingEnabled, setThinkingEnabled] = useState(true);
  const [composerPadPx, setComposerPadPx] = useState(COMPOSER_PAD_FALLBACK_PX);
  const [disabledPluginIds, setDisabledPluginIds] = useState<string[]>([]);
  const {
    models,
    modelId,
    setModelId,
    loading: modelsLoading,
  } = useAgentModel();
  const modelOptions = useMemo(
    () =>
      models.map((model) => ({
        value: model.id,
        label: formatDeepSeekModelLabel(model.id),
        shortLabel: formatDeepSeekModelShortLabel(model.id),
      })),
    [models],
  );
  const thinkingSupported = modelSupportsThinking(modelId);

  const enabledPlugins = useMemo(
    () => filterEnabledAgentPlugins(disabledPluginIds),
    [disabledPluginIds],
  );
  const enabledSkills = useMemo(
    () => filterEnabledAgentSkills(disabledPluginIds),
    [disabledPluginIds],
  );

  const locale = useLocaleStore((state) => state.locale);
  const branches = useRepoStore((state) => state.branches);

  /** 单仓 @：插件 / 技能 / 本地与远端分支 */
  const mentionOptions = useMemo((): AgentMentionOption[] => {
    const plugins = enabledPlugins.map((plugin) => ({
      id: plugin.mentionId,
      display: t(plugin.mentionDisplayKey),
      kind: "plugin" as const,
    }));
    const skills = enabledSkills.map((skill) => ({
      id: skill.mentionId,
      display: t(skill.mentionDisplayKey),
      kind: "skill" as const,
    }));
    const branchOptions = branches.map((branch) => ({
      id: branch.name,
      display: branch.name,
      kind: "branch" as const,
      isRemote: branch.isRemote,
    }));
    return [...plugins, ...skills, ...branchOptions];
  }, [branches, enabledPlugins, enabledSkills, t]);
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
  const isReplying =
    replyingConversationId != null &&
    replyingConversationId === activeConversation?.id;

  function abortReplySession(): void {
    replySessionRef.current?.controller.abort();
  }

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
    abortReplySession();

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
      abortReplySession();
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
    setDraftMentions([]);
  }

  useEffect(() => {
    let active = true;
    void getDisabledAgentPluginIds()
      .then((ids) => {
        if (active) {
          setDisabledPluginIds(ids);
        }
      })
      .catch((error: unknown) => {
        console.error(error);
      });
    return () => {
      active = false;
    };
  }, []);

  function markupToPlain(markup: string): string {
    return markup.replace(
      /@\[([^\]]+)\]\([^)]+\)/g,
      (_full, name: string) => `@${name}`,
    );
  }

  function handleInsertPlugin(plugin: AgentPluginDefinition): void {
    const display = t(plugin.mentionDisplayKey);
    const nextMarkup = appendAgentMentionMarkup(
      draftMarkup,
      display,
      plugin.mentionId,
    );
    setDraftMarkup(nextMarkup);
    setDraftPlainText(markupToPlain(nextMarkup));
    setDraftMentions((prev) => {
      if (prev.some((item) => item.type === "plugin" && item.id === plugin.id)) {
        return prev;
      }
      return [...prev, { type: "plugin", id: plugin.id, name: display }];
    });
    setPluginsOpen(false);
    scheduleFocusInputCaretAtEnd(() => inputRef.current);
  }

  function handleTryPlugin(plugin: AgentPluginDefinition): void {
    // 已有空会话则切过去，否则新建
    const emptyConversation = conversations.find(
      (conversation) => conversation.messages.length === 0,
    );
    if (emptyConversation) {
      if (emptyConversation.id !== activeConversation?.id) {
        setActiveConversation(projectId, emptyConversation.id);
      }
    } else {
      conversationSequence.current += 1;
      const created: AgentConversation = {
        id: `conversation-${Date.now()}-${conversationSequence.current}`,
        title: "",
        messages: [],
      };
      createConversation(projectId, created);
      void persistConversation(created);
    }

    const display = t(plugin.mentionDisplayKey);
    const nextMarkup = buildAgentPluginTryMarkup(
      display,
      plugin.mentionId,
      t(plugin.tryExampleKey),
    );
    setDraftMarkup(nextMarkup);
    setDraftPlainText(markupToPlain(nextMarkup));
    setDraftMentions([{ type: "plugin", id: plugin.id, name: display }]);
    setPluginsOpen(false);
    scheduleFocusInputCaretAtEnd(() => inputRef.current);
  }

  function handleUninstallPlugin(plugin: AgentPluginDefinition): void {
    void (async () => {
      try {
        await disableAgentPlugin(plugin.id);
        setDisabledPluginIds((prev) =>
          prev.includes(plugin.id) ? prev : [...prev, plugin.id],
        );
        toast.success(
          t("agent.pluginUninstalled", { name: t(plugin.titleKey) }),
        );
      } catch (error: unknown) {
        console.error(error);
        toast.error(toUserMessage(error) || t("agent.pluginUninstallFailed"));
      }
    })();
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
    // 编辑/重生成或其它会话开新流时中断上一轮
    if (replySessionRef.current) {
      replySessionRef.current.controller.abort();
    }

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
      setReplyingConversationId(conversationId);
    });

    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
    });

    const controller = new AbortController();
    replySessionRef.current = { conversationId, controller };
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
      await streamJinglingReply({
        host: "project",
        messages: historyForRequest,
        repoPath,
        locale,
        model: modelId,
        enableThinking: thinkingSupported && thinkingEnabled,
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
        toastAiFailure(error, t("agent.replyFailed"));
      }
    } finally {
      if (replySessionRef.current?.controller === controller) {
        replySessionRef.current = null;
        setReplyingConversationId(null);
      }
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
      ...(draftMentions.length > 0 ? { mentions: draftMentions } : {}),
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
    if (replySessionRef.current?.conversationId === conversationId) {
      abortReplySession();
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
        onOpenPlugins={() => setPluginsOpen(true)}
      />

      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        <AgentMessageList
          messages={messages}
          conversationId={activeConversation?.id}
          composerPadPx={composerPadPx}
          onCompareBranches={handleCompareBranches}
          actionsDisabled={isReplying || !hasApiKey}
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
          branchOptions={mentionOptions}
          enableMentions
          isReplying={isReplying}
          canSubmit={Boolean(activeConversation)}
          showThinkingToggle={thinkingSupported}
          thinkingEnabled={thinkingEnabled}
          onThinkingEnabledChange={setThinkingEnabled}
          showModelPicker
          modelOptions={modelOptions}
          modelId={modelId}
          modelLoading={modelsLoading}
          onModelIdChange={setModelId}
          onDraftChange={({ markup, plainText, mentions }) => {
            setDraftMarkup(markup);
            setDraftPlainText(plainText);
            setDraftMentions(mentions);
          }}
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
          onStop={() => {
            abortReplySession();
          }}
        />
      </div>

      <Dialog open={pluginsOpen} onOpenChange={setPluginsOpen}>
        <DialogContent className="flex max-h-[min(82vh,32rem)] flex-col gap-3 p-4 sm:max-w-[34rem]">
          <DialogHeader className="pr-8">
            <DialogTitle className="text-base">
              {t("agent.catalogSwitchAria")}
            </DialogTitle>
          </DialogHeader>
          <AgentCatalogPanel
            variant="compact"
            showHint
            className="min-h-0"
            plugins={enabledPlugins}
            skills={enabledSkills}
            onSelectPlugin={handleInsertPlugin}
            onTryPlugin={handleTryPlugin}
            onUninstallPlugin={handleUninstallPlugin}
          />
        </DialogContent>
      </Dialog>
    </section>
  );
}
