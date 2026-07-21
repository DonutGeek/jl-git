import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { flushSync } from "react-dom";
import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { AgentComposer, type AgentMentionOption } from "@/components/ai/AgentComposer";
import { AgentMessageList } from "@/components/ai/AgentMessageList";
import { AgentCatalogPanel } from "@/components/ai/AgentCatalogPanel";
import { MultiAgentSidebar } from "@/components/agent/MultiAgentSidebar";
import { useHasAgentApiKey } from "@/hooks/useHasAgentApiKey";
import {
  appendAgentMentionMarkup,
  agentProjectMentionId,
  buildAgentPluginTryMarkup,
  type AgentPluginDefinition,
} from "@/plugins/agent/registry";
import {
  deleteChatConversation,
  listChatConversations,
  reorderChatConversations,
  upsertChatConversation,
} from "@/services/ai/ai.chatPersist";
import { streamJinglingReply } from "@/services/ai";
import { toastAiFailure } from "@/services/ai/ai.httpError";
import { listAllGitAuthorsForMatching } from "@/services/git/git.accounts";
import {
  disableAgentPlugin,
  filterEnabledAgentPlugins,
  filterEnabledAgentSkills,
  getDisabledAgentPluginIds,
} from "@/services/agent/agent.plugins";
import {
  buildAgentProfiles,
  enrichProfilesWithCodeEvidence,
  filterProfilesByAuthor,
  prepareProfilesForAgentContext,
} from "@/services/agent/agent.profile";
import { projectService, workspaceService } from "@/services/project";
import { useLocaleStore } from "@/store/useLocaleStore";
import { scheduleFocusInputCaretAtEnd } from "@/utils/focusInputCaretAtEnd";
import {
  getActiveMultiAgentConversation,
  getActiveMultiAgentMessages,
  useMultiAgentStore,
} from "@/store/useMultiAgentStore";
import { toUserMessage } from "@/types/error";
import type {
  AgentChatMessage,
  AgentConversation,
  AgentMention,
} from "@/types/ai";
import type { AgentProjectProfile } from "@/types/agent";

interface SendResumeOptions {
  /** 仅这些仓库进入上下文（逐个写简历） */
  projectIds?: string[];
  /** 结构化提及（@插件 / @项目） */
  mentions?: readonly AgentMention[];
  /** 是否拉 diff 证据；列表类可关 */
  enrich?: boolean;
  /**
   * 成稿后再提示「无提交/失败未生成」的仓库。
   * 仅全量/列出类为 true；单项目成稿不要开，避免答非所问。
   */
  notifySkipped?: boolean;
}

const COMPOSER_BOTTOM_OFFSET_PX = 12;
/** 无快捷 chip 时的底栏预估高度 */
const COMPOSER_PAD_FALLBACK_PX = 140;

/** 多仓鲸灵子窗主界面：画像加载 + 对话（AgentHost = global） */
export function MultiAgentWorkspace() {
  const { t } = useTranslation();
  const hasApiKey = useHasAgentApiKey();
  const composerRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const replyAbortRef = useRef<AbortController | null>(null);
  const messageSeq = useRef(0);
  /** 最近一次成稿目标仓，供「加强表述」复用 */
  const lastTargetProjectIdRef = useRef<string | null>(null);

  const [draftMarkup, setDraftMarkup] = useState("");
  const [draftPlainText, setDraftPlainText] = useState("");
  const [draftMentions, setDraftMentions] = useState<readonly AgentMention[]>(
    [],
  );
  const [isReplying, setIsReplying] = useState(false);
  const [composerPadPx, setComposerPadPx] = useState(COMPOSER_PAD_FALLBACK_PX);
  const [gitAuthorsReady, setGitAuthorsReady] = useState(false);
  /** 与单仓一致：默认开启深度思考 */
  const [thinkingEnabled, setThinkingEnabled] = useState(true);
  /** 右侧主区：会话对话 | 插件列表 */
  const [mainView, setMainView] = useState<"chat" | "plugins">("chat");
  /** 已卸载插件 id（软隐藏） */
  const [disabledPluginIds, setDisabledPluginIds] = useState<string[]>([]);

  const locale = useLocaleStore((state) => state.locale);
  const profiles = useMultiAgentStore((state) => state.profiles);
  const profilesLoading = useMultiAgentStore((state) => state.profilesLoading);
  const profilesError = useMultiAgentStore((state) => state.profilesError);
  const conversations = useMultiAgentStore((state) => state.conversations);
  const activeConversationId = useMultiAgentStore(
    (state) => state.activeConversationId,
  );
  const activeConversation =
    conversations.find((item) => item.id === activeConversationId) ?? null;
  const messages = activeConversation?.messages ?? [];
  const gitAuthors = useMultiAgentStore((state) => state.gitAuthors);
  const setProfilesLoading = useMultiAgentStore((state) => state.setProfilesLoading);
  const setProfiles = useMultiAgentStore((state) => state.setProfiles);
  const setGitAuthors = useMultiAgentStore((state) => state.setGitAuthors);
  const hydrateConversations = useMultiAgentStore(
    (state) => state.hydrateConversations,
  );
  const ensureDefaultConversation = useMultiAgentStore(
    (state) => state.ensureDefaultConversation,
  );
  const createConversation = useMultiAgentStore((state) => state.createConversation);
  const setActiveConversation = useMultiAgentStore(
    (state) => state.setActiveConversation,
  );
  const deleteConversation = useMultiAgentStore((state) => state.deleteConversation);
  const renameConversation = useMultiAgentStore((state) => state.renameConversation);
  const setConversationPinned = useMultiAgentStore(
    (state) => state.setConversationPinned,
  );
  const reorderConversations = useMultiAgentStore(
    (state) => state.reorderConversations,
  );
  const appendMessage = useMultiAgentStore((state) => state.appendMessage);
  const updateMessage = useMultiAgentStore((state) => state.updateMessage);
  const removeMessage = useMultiAgentStore((state) => state.removeMessage);
  const resetConversation = useMultiAgentStore((state) => state.resetConversation);

  async function persistConversation(
    conversation: AgentConversation,
  ): Promise<void> {
    try {
      await upsertChatConversation({
        scope: "agent_global",
        conversation,
      });
    } catch (error) {
      console.error(error);
      toast.error(toUserMessage(error) || t("multiAgent.replyFailed"));
    }
  }

  async function persistActiveConversation(): Promise<void> {
    const conversation = getActiveMultiAgentConversation();
    if (conversation) {
      await persistConversation(conversation);
    }
  }

  async function persistConversationById(conversationId: string): Promise<void> {
    const conversation = useMultiAgentStore
      .getState()
      .conversations.find((item) => item.id === conversationId);
    if (conversation) {
      await persistConversation(conversation);
    }
  }

  async function persistOrder(): Promise<void> {
    const orderedIds = useMultiAgentStore
      .getState()
      .conversations.map((item) => item.id);
    if (orderedIds.length === 0) {
      return;
    }
    try {
      await reorderChatConversations({
        scope: "agent_global",
        orderedIds,
      });
    } catch (error) {
      console.error(error);
      toast.error(toUserMessage(error) || t("multiAgent.replyFailed"));
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function hydrate(): Promise<void> {
      try {
        const list = await listChatConversations({ scope: "agent_global" });
        if (cancelled) {
          return;
        }
        if (list.length > 0) {
          hydrateConversations(list);
          return;
        }
        ensureDefaultConversation();
        const created = getActiveMultiAgentConversation();
        if (created) {
          await persistConversation(created);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        console.error(error);
        ensureDefaultConversation();
        toast.error(toUserMessage(error) || t("multiAgent.replyFailed"));
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [ensureDefaultConversation, hydrateConversations, t]);

  useEffect(() => {
    let active = true;
    void listAllGitAuthorsForMatching()
      .then((authors) => {
        if (active) {
          setGitAuthors(authors);
          setGitAuthorsReady(true);
        }
      })
      .catch(() => {
        if (active) {
          setGitAuthors([]);
          setGitAuthorsReady(true);
        }
      });
    return () => {
      active = false;
    };
  }, [setGitAuthors]);

  // 作者账号就绪后再拉画像：有账号时走 --author 全量，避免他人提交占抽样预算
  const authorsKey = gitAuthors
    .map((author) => `${author.name.trim().toLowerCase()}<${author.email.trim().toLowerCase()}>`)
    .join("|");

  useEffect(() => {
    if (!gitAuthorsReady) {
      return;
    }
    let active = true;
    setProfilesLoading(true);
    void Promise.all([projectService.list(), workspaceService.list()])
      .then(([projects, workspaces]) =>
        buildAgentProfiles(
          projects,
          useMultiAgentStore.getState().gitAuthors,
          workspaces,
        ),
      )
      .then((next) => {
        if (active) setProfiles(next);
      })
      .catch((error: unknown) => {
        if (active) {
          setProfiles([], toUserMessage(error) || t("multiAgent.profileFailed"));
        }
      });
    return () => {
      active = false;
    };
  }, [gitAuthorsReady, authorsKey, setProfiles, setProfilesLoading, t]);

  useEffect(() => {
    return () => {
      replyAbortRef.current?.abort();
    };
  }, []);

  // 清理旧版自动开场白（仅助手、无用户消息）
  useEffect(() => {
    if (!activeConversationId || messages.length === 0) {
      return;
    }
    if (messages.some((message) => message.role === "user")) {
      return;
    }
    const isStaleGreeting = messages.every(
      (message) =>
        message.role === "assistant" &&
        (/已扫描\s*\d+/.test(message.content) ||
          /Scanned\s+\d+/.test(message.content)),
    );
    if (!isStaleGreeting) {
      return;
    }
    resetConversation();
    void persistActiveConversation();
  }, [activeConversationId, messages, resetConversation]);

  useLayoutEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    const update = (): void => {
      setComposerPadPx(Math.ceil(el.getBoundingClientRect().height + COMPOSER_BOTTOM_OFFSET_PX));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function nextMessageId(): string {
    messageSeq.current += 1;
    return `resume-msg-${Date.now()}-${messageSeq.current}`;
  }

  function clearDraft(): void {
    setDraftMarkup("");
    setDraftPlainText("");
    setDraftMentions([]);
  }

  const matchedProfiles = useMemo(
    () => filterProfilesByAuthor(profiles, gitAuthors),
    [profiles, gitAuthors],
  );

  const enabledPlugins = useMemo(
    () => filterEnabledAgentPlugins(disabledPluginIds),
    [disabledPluginIds],
  );
  const enabledSkills = useMemo(
    () => filterEnabledAgentSkills(disabledPluginIds),
    [disabledPluginIds],
  );

  const mentionOptions = useMemo((): AgentMentionOption[] => {
    const plugins: AgentMentionOption[] = enabledPlugins.map((plugin) => ({
      id: plugin.mentionId,
      display: t(plugin.mentionDisplayKey),
      kind: "plugin",
    }));
    const skills: AgentMentionOption[] = enabledSkills.map((skill) => ({
      id: skill.mentionId,
      display: t(skill.mentionDisplayKey),
      kind: "skill",
    }));
    // @项目列出全部已登记仓库，不做作者匹配 / 可写过滤
    const projects: AgentMentionOption[] = profiles.map((profile) => ({
      id: agentProjectMentionId(profile.projectId),
      display: profile.projectName,
      kind: "project",
    }));
    return [...plugins, ...skills, ...projects];
  }, [enabledPlugins, enabledSkills, profiles, t]);

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

  function applyPluginDraft(
    plugin: AgentPluginDefinition,
    markup: string,
  ): void {
    const display = t(plugin.mentionDisplayKey);
    setDraftMarkup(markup);
    setDraftPlainText(markupToPlain(markup));
    setDraftMentions([{ type: "plugin", id: plugin.id, name: display }]);
    scheduleFocusInputCaretAtEnd(() => inputRef.current);
  }

  function ensureEmptyConversationForTry(): void {
    const empty = conversations.find(
      (conversation) => conversation.messages.length === 0,
    );
    if (empty) {
      if (empty.id !== activeConversationId) {
        replyAbortRef.current?.abort();
        replyAbortRef.current = null;
        setIsReplying(false);
        setActiveConversation(empty.id);
      }
      return;
    }
    replyAbortRef.current?.abort();
    replyAbortRef.current = null;
    setIsReplying(false);
    const createdId = createConversation();
    void persistConversationById(createdId);
  }

  function handleInsertPlugin(plugin: AgentPluginDefinition): void {
    setMainView("chat");
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
    scheduleFocusInputCaretAtEnd(() => inputRef.current);
  }

  function handleTryPlugin(plugin: AgentPluginDefinition): void {
    setMainView("chat");
    ensureEmptyConversationForTry();
    const display = t(plugin.mentionDisplayKey);
    const nextMarkup = buildAgentPluginTryMarkup(
      display,
      plugin.mentionId,
      t(plugin.tryExampleKey),
    );
    applyPluginDraft(plugin, nextMarkup);
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

  /**
   * 在已有 history（含最新用户消息、不含助手气泡）上继续流式回复。
   * 供发送 / 重生成 / 编辑共用。
   */
  async function continueResumeFromHistory(
    history: readonly AgentChatMessage[],
    options: SendResumeOptions = {},
  ): Promise<void> {
    const lastUser = [...history].reverse().find((message) => message.role === "user");
    if (!lastUser || isReplying || profilesLoading) {
      return;
    }
    const trimmed = lastUser.content.trim();
    if (!trimmed) {
      return;
    }

    const currentAuthors = useMultiAgentStore.getState().gitAuthors;
    const allProfiles = useMultiAgentStore.getState().profiles;
    // 对话上下文：全部已登记仓（含无本人提交）；列举不再按「可写」截断
    const contextProfiles = prepareProfilesForAgentContext(
      allProfiles,
      currentAuthors,
    );
    // 显式 @项目 / projectIds 在全部已登记仓中解析
    const explicitTargets = resolveTargetProfiles(
      allProfiles,
      trimmed,
      options.projectIds,
      options.mentions ?? lastUser.mentions,
    );
    // 未锁定单仓时禁止 enrich，避免闲聊/未点名时全量拉 diff
    const shouldEnrich =
      options.enrich !== false && explicitTargets.length > 0;
    if (explicitTargets.length === 1) {
      lastTargetProjectIdRef.current = explicitTargets[0]!.projectId;
    }

    const askedAt = new Date().toISOString();
    const assistantId = nextMessageId();

    flushSync(() => {
      appendMessage({
        id: assistantId,
        role: "assistant",
        content: "",
        createdAt: askedAt,
        isStreaming: true,
      });
      setIsReplying(true);
    });

    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
    });

    const controller = new AbortController();
    replyAbortRef.current = controller;

    let reasoningStartedAt: number | null = null;
    let reasoningDurationSettled = false;
    const settleReasoningDuration = (): void => {
      if (reasoningDurationSettled || reasoningStartedAt == null) {
        return;
      }
      reasoningDurationSettled = true;
      updateMessage(assistantId, {
        reasoningDurationMs: Date.now() - reasoningStartedAt,
      });
    };

    try {
      let profilesForStream = contextProfiles;
      if (shouldEnrich) {
        const withCode = await enrichProfilesWithCodeEvidence(explicitTargets);
        const enrichedById = new Map(
          withCode.map((profile) => [profile.projectId, profile]),
        );
        profilesForStream = contextProfiles.map(
          (profile) => enrichedById.get(profile.projectId) ?? profile,
        );
      }
      if (controller.signal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      await streamJinglingReply({
        host: "global",
        messages: history,
        profiles: profilesForStream,
        gitAuthors: currentAuthors,
        locale,
        signal: controller.signal,
        enableThinking: thinkingEnabled,
        onReasoningDelta: (delta) => {
          if (reasoningStartedAt == null) {
            reasoningStartedAt = Date.now();
          }
          flushSync(() => {
            const current = getActiveMultiAgentMessages().find(
              (message) => message.id === assistantId,
            );
            updateMessage(assistantId, {
              reasoningContent: `${current?.reasoningContent ?? ""}${delta}`,
              isStreaming: true,
            });
          });
        },
        onDelta: (delta) => {
          settleReasoningDuration();
          flushSync(() => {
            const current = getActiveMultiAgentMessages().find(
              (message) => message.id === assistantId,
            );
            updateMessage(assistantId, {
              content: `${current?.content ?? ""}${delta}`,
              isStreaming: true,
            });
          });
        },
      });
      settleReasoningDuration();
      updateMessage(assistantId, {
        isStreaming: false,
        createdAt: new Date().toISOString(),
      });

      if (options.notifySkipped === true) {
        const followUp = buildSkippedProjectsFollowUp(
          useMultiAgentStore.getState().profiles,
          currentAuthors,
          t,
        );
        if (followUp) {
          appendMessage({
            id: nextMessageId(),
            role: "assistant",
            content: followUp,
            createdAt: new Date().toISOString(),
          });
        }
      }
    } catch (error) {
      const current = getActiveMultiAgentMessages().find(
        (message) => message.id === assistantId,
      );
      const hasPartial = Boolean(
        current?.content.trim() || current?.reasoningContent?.trim(),
      );
      if (controller.signal.aborted) {
        if (hasPartial) {
          settleReasoningDuration();
          updateMessage(assistantId, {
            isStreaming: false,
            createdAt: new Date().toISOString(),
          });
        } else {
          removeMessage(assistantId);
        }
      } else {
        removeMessage(assistantId);
        toastAiFailure(error, t("multiAgent.replyFailed"));
      }
    } finally {
      if (replyAbortRef.current === controller) {
        replyAbortRef.current = null;
      }
      setIsReplying(false);
      void persistActiveConversation();
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  async function sendUserContent(
    content: string,
    options: SendResumeOptions = {},
  ): Promise<void> {
    const trimmed = content.trim();
    if (!trimmed || isReplying || profilesLoading) {
      return;
    }

    const askedAt = new Date().toISOString();
    const mentions = options.mentions ?? draftMentions;
    const userMessage: AgentChatMessage = {
      id: nextMessageId(),
      role: "user",
      content: trimmed,
      createdAt: askedAt,
      ...(mentions.length > 0 ? { mentions } : {}),
    };
    const history = [...getActiveMultiAgentMessages(), userMessage];

    flushSync(() => {
      clearDraft();
      appendMessage(userMessage);
    });
    void persistActiveConversation();

    await continueResumeFromHistory(history, { ...options, mentions });
  }

  async function handleRegenerateLast(): Promise<void> {
    if (isReplying || profilesLoading) {
      return;
    }
    const current = getActiveMultiAgentMessages();
    const last = current[current.length - 1];
    if (!last || last.role !== "assistant" || last.isStreaming) {
      return;
    }
    const history = current.slice(0, -1);
    const lastUser = history[history.length - 1];
    if (!lastUser || lastUser.role !== "user") {
      return;
    }

    flushSync(() => {
      removeMessage(last.id);
    });
    void persistActiveConversation();

    replyAbortRef.current?.abort();
    replyAbortRef.current = null;

    await continueResumeFromHistory(history, {
      projectIds:
        lastTargetProjectIdRef.current != null
          ? [lastTargetProjectIdRef.current]
          : undefined,
      enrich: true,
      notifySkipped: false,
    });
  }

  async function handleEditUserMessage(
    messageId: string,
    content: string,
  ): Promise<void> {
    if (isReplying || profilesLoading) {
      return;
    }
    const trimmed = content.trim();
    if (!trimmed) {
      return;
    }

    const history = useMultiAgentStore
      .getState()
      .editUserMessageAndTruncate(messageId, trimmed);
    if (!history) {
      toast.error(t("multiAgent.replyFailed"));
      return;
    }
    void persistActiveConversation();

    replyAbortRef.current?.abort();
    replyAbortRef.current = null;

    await continueResumeFromHistory(history, {
      projectIds:
        lastTargetProjectIdRef.current != null
          ? [lastTargetProjectIdRef.current]
          : undefined,
      enrich: true,
      notifySkipped: false,
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const text = draftPlainText.trim();
    if (
      shouldDraftAllProjectsSequentially(text, draftMentions, matchedProfiles)
    ) {
      await draftAllProjectsSequentially(text);
      return;
    }
    await sendUserContent(text, { mentions: draftMentions });
  }

  /**
   * 全量成稿：按仓库串行 enrich + 请求模型（一次只打一个仓），
   * 宁可更久，避免并发把机器打满。
   */
  async function draftAllProjectsSequentially(
    userContent?: string,
  ): Promise<void> {
    if (isReplying || profilesLoading) {
      return;
    }

    const currentAuthors = useMultiAgentStore.getState().gitAuthors;
    const targets = filterProfilesByAuthor(
      useMultiAgentStore.getState().profiles,
      currentAuthors,
    );
    if (targets.length === 0) {
      toast.message(t("multiAgent.pickProjectHint"));
      return;
    }

    const askedAt = new Date().toISOString();
    const userMessage: AgentChatMessage = {
      id: nextMessageId(),
      role: "user",
      content: userContent?.trim() || t("multiAgent.quickDraftAllPrompt"),
      createdAt: askedAt,
      mentions: [{ type: "plugin", id: "resume", name: t("multiAgent.pluginResumeMention") }],
    };
    const progressId = nextMessageId();

    flushSync(() => {
      clearDraft();
      appendMessage(userMessage);
      appendMessage({
        id: progressId,
        role: "assistant",
        content: t("multiAgent.sequentialProgress", {
          current: 0,
          total: targets.length,
          name: "…",
        }),
        createdAt: askedAt,
        isStreaming: true,
      });
      setIsReplying(true);
    });

    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
    });

    const controller = new AbortController();
    replyAbortRef.current = controller;
    let completed = 0;

    try {
      for (let index = 0; index < targets.length; index += 1) {
        if (controller.signal.aborted) {
          break;
        }
        const profile = targets[index]!;
        lastTargetProjectIdRef.current = profile.projectId;

        updateMessage(progressId, {
          content: t("multiAgent.sequentialProgress", {
            current: index + 1,
            total: targets.length,
            name: profile.projectName,
          }),
          isStreaming: true,
        });

        // 一次只 enrich / 请求一个仓
        const withCode = await enrichProfilesWithCodeEvidence([profile]);
        if (controller.signal.aborted) {
          break;
        }

        const draftId = nextMessageId();
        const draftAskedAt = new Date().toISOString();
        flushSync(() => {
          appendMessage({
            id: draftId,
            role: "assistant",
            content: "",
            createdAt: draftAskedAt,
            isStreaming: true,
          });
        });

        const turnMessages: AgentChatMessage[] = [
          {
            id: `resume-seq-user-${index}`,
            role: "user",
            content: t("multiAgent.quickDraftOnePrompt", {
              name: profile.projectName,
            }),
            createdAt: draftAskedAt,
          },
        ];

        let reasoningStartedAt: number | null = null;
        let reasoningDurationSettled = false;
        const settleReasoningDuration = (): void => {
          if (reasoningDurationSettled || reasoningStartedAt == null) {
            return;
          }
          reasoningDurationSettled = true;
          updateMessage(draftId, {
            reasoningDurationMs: Date.now() - reasoningStartedAt,
          });
        };

        try {
          await streamJinglingReply({
            host: "global",
            messages: turnMessages,
            profiles: withCode,
            gitAuthors: currentAuthors,
            locale,
            signal: controller.signal,
            enableThinking: thinkingEnabled,
            onReasoningDelta: (delta) => {
              if (reasoningStartedAt == null) {
                reasoningStartedAt = Date.now();
              }
              flushSync(() => {
                const current = getActiveMultiAgentMessages().find(
                  (message) => message.id === draftId,
                );
                updateMessage(draftId, {
                  reasoningContent: `${current?.reasoningContent ?? ""}${delta}`,
                  isStreaming: true,
                });
              });
            },
            onDelta: (delta) => {
              settleReasoningDuration();
              flushSync(() => {
                const current = getActiveMultiAgentMessages().find(
                  (message) => message.id === draftId,
                );
                updateMessage(draftId, {
                  content: `${current?.content ?? ""}${delta}`,
                  isStreaming: true,
                });
              });
            },
          });
          settleReasoningDuration();
          updateMessage(draftId, {
            isStreaming: false,
            createdAt: new Date().toISOString(),
          });
          completed += 1;
          void persistActiveConversation();
        } catch (error) {
          if (controller.signal.aborted) {
            // 用户停止：保留已生成片段，不再继续后续仓库
            const current = getActiveMultiAgentMessages().find(
              (message) => message.id === draftId,
            );
            const hasPartial = Boolean(
              current?.content.trim() || current?.reasoningContent?.trim(),
            );
            if (hasPartial) {
              settleReasoningDuration();
              updateMessage(draftId, {
                isStreaming: false,
                createdAt: new Date().toISOString(),
              });
            } else {
              removeMessage(draftId);
            }
            throw error;
          }
          removeMessage(draftId);
          // 单仓失败不中断后续，提示后继续
          appendMessage({
            id: nextMessageId(),
            role: "assistant",
            content: t("multiAgent.sequentialItemFailed", {
              name: profile.projectName,
              reason: toUserMessage(error) || t("multiAgent.replyFailed"),
            }),
            createdAt: new Date().toISOString(),
          });
        }

        // 让出事件循环，避免长时间占满主线程
        await new Promise<void>((resolve) => {
          window.setTimeout(() => resolve(), 0);
        });
      }

      if (controller.signal.aborted) {
        updateMessage(progressId, {
          content: t("multiAgent.sequentialAborted", { count: completed }),
          isStreaming: false,
          createdAt: new Date().toISOString(),
        });
      } else {
        updateMessage(progressId, {
          content: t("multiAgent.sequentialDone", { count: completed }),
          isStreaming: false,
          createdAt: new Date().toISOString(),
        });

        const followUp = buildSkippedProjectsFollowUp(
          useMultiAgentStore.getState().profiles,
          currentAuthors,
          t,
        );
        if (followUp) {
          appendMessage({
            id: nextMessageId(),
            role: "assistant",
            content: followUp,
            createdAt: new Date().toISOString(),
          });
        }
      }
    } catch (error) {
      updateMessage(progressId, {
        content: t("multiAgent.sequentialAborted", { count: completed }),
        isStreaming: false,
        createdAt: new Date().toISOString(),
      });
      if (!controller.signal.aborted) {
        toastAiFailure(error, t("multiAgent.replyFailed"));
      }
    } finally {
      if (replyAbortRef.current === controller) {
        replyAbortRef.current = null;
      }
      setIsReplying(false);
      void persistActiveConversation();
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  function handleStopReply(): void {
    replyAbortRef.current?.abort();
  }


  return (
    <main className="bg-background text-foreground flex h-screen min-h-0 w-full flex-col overflow-hidden">
      <header
        data-tauri-drag-region
        className="border-border bg-muted/40 flex h-11 shrink-0 items-center gap-2 border-b px-4 pl-[88px]"
      >
        <Sparkles className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
        <span className="truncate text-sm font-semibold">{t("multiAgent.windowTitle")}</span>
      </header>

      {profilesError ? (
        <p className="text-destructive px-4 py-3 text-center text-sm">{profilesError}</p>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <MultiAgentSidebar
          conversations={conversations}
          activeConversationId={activeConversationId}
          pluginsActive={mainView === "plugins"}
          onSelect={(conversationId) => {
            setMainView("chat");
            if (conversationId === activeConversationId) {
              return;
            }
            replyAbortRef.current?.abort();
            replyAbortRef.current = null;
            setIsReplying(false);
            clearDraft();
            setActiveConversation(conversationId);
          }}
          onCreate={() => {
            setMainView("chat");
            replyAbortRef.current?.abort();
            replyAbortRef.current = null;
            setIsReplying(false);
            clearDraft();
            // 已有空会话时只切过去，避免叠多个空会话
            const empty = conversations.find(
              (conversation) => conversation.messages.length === 0,
            );
            if (empty) {
              setActiveConversation(empty.id);
              return;
            }
            const createdId = createConversation();
            void persistConversationById(createdId);
          }}
          onDelete={(conversationId) => {
            const before = useMultiAgentStore.getState().conversations;
            if (before.length <= 1) {
              return;
            }
            if (conversationId === activeConversationId) {
              replyAbortRef.current?.abort();
              replyAbortRef.current = null;
              setIsReplying(false);
            }
            deleteConversation(conversationId);
            void deleteChatConversation(conversationId).catch((error: unknown) => {
              console.error(error);
              toast.error(toUserMessage(error) || t("multiAgent.replyFailed"));
            });
          }}
          onRename={(conversationId, title) => {
            renameConversation(conversationId, title);
            void persistConversationById(conversationId);
          }}
          onPin={(conversationId, pinned) => {
            setConversationPinned(conversationId, pinned);
            void (async () => {
              await persistConversationById(conversationId);
              await persistOrder();
            })();
          }}
          onReorder={(activeId, overId) => {
            reorderConversations(activeId, overId);
            void persistOrder();
          }}
          onOpenPlugins={() => setMainView("plugins")}
        />

        {mainView === "plugins" ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col px-6 pb-6 pt-5">
            <AgentCatalogPanel
              variant="gallery"
              plugins={enabledPlugins}
              skills={enabledSkills}
              onSelectPlugin={handleInsertPlugin}
              onTryPlugin={handleTryPlugin}
              onUninstallPlugin={handleUninstallPlugin}
            />
          </div>
        ) : (
          <div className="relative min-h-0 min-w-0 flex-1">
            <AgentMessageList
              messages={messages}
              conversationId={activeConversationId ?? "agent-global"}
              composerPadPx={composerPadPx}
              onCompareBranches={() => undefined}
              actionsDisabled={isReplying || profilesLoading || !hasApiKey}
              emptyTitle={t("multiAgent.emptyState")}
              emptyDescription={t("multiAgent.emptyStateDescription")}
              onRegenerateLast={() => {
                void handleRegenerateLast();
              }}
              onEditUserMessage={(messageId, content) => {
                void handleEditUserMessage(messageId, content);
              }}
            />
            {/* 挡住输入区后方透出的消息，高度与底栏一致 */}
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
              canSubmit={!profilesLoading && draftPlainText.trim().length > 0}
              placeholder={t("multiAgent.inputPlaceholder")}
              showThinkingToggle
              thinkingEnabled={thinkingEnabled}
              onThinkingEnabledChange={setThinkingEnabled}
              onDraftChange={({ markup, plainText, mentions }) => {
                setDraftMarkup(markup);
                setDraftPlainText(plainText);
                setDraftMentions(mentions);
              }}
              onSubmit={(event) => {
                void handleSubmit(event);
              }}
              onStop={handleStopReply}
            />
          </div>
        )}
      </div>
    </main>
  );
}

/**
 * 解析本轮目标仓库：优先显式 projectIds / @项目，其次消息里点名的项目名。
 * 多仓且未点名时返回空，避免全量 enrich 打满机器。
 */
function resolveTargetProfiles(
  filtered: readonly AgentProjectProfile[],
  content: string,
  projectIds?: string[],
  mentions?: readonly AgentMention[],
): AgentProjectProfile[] {
  if (projectIds && projectIds.length > 0) {
    const idSet = new Set(projectIds);
    return filtered.filter((profile) => idSet.has(profile.projectId));
  }

  const mentionedIds = new Set(
    (mentions ?? [])
      .filter((item): item is Extract<AgentMention, { type: "project" }> =>
        item.type === "project",
      )
      .map((item) => item.id),
  );
  if (mentionedIds.size > 0) {
    return filtered.filter((profile) => mentionedIds.has(profile.projectId));
  }

  const named = filtered.filter((profile) => {
    const name = profile.projectName.trim();
    return name.length > 0 && content.includes(name);
  });
  if (named.length > 0) {
    return named;
  }

  if (filtered.length <= 1) {
    return [...filtered];
  }
  return [];
}

/** 用户是否在请求「全部/所有项目」简历（且未锁定单个项目） */
function shouldDraftAllProjectsSequentially(
  content: string,
  mentions: readonly AgentMention[],
  matched: readonly AgentProjectProfile[],
): boolean {
  if (matched.length <= 1) {
    return false;
  }
  if (mentions.some((item) => item.type === "project")) {
    return false;
  }
  const named = matched.filter((profile) => {
    const name = profile.projectName.trim();
    return name.length > 0 && content.includes(name);
  });
  if (named.length === 1) {
    return false;
  }
  const allHint = /全部|所有|all\s+projects?/i.test(content);
  const resumeHint = /简历|项目经历|resume|\bcv\b/i.test(content);
  return allHint && resumeHint;
}

type ResumeTranslate = (
  key: string,
  options?: Record<string, string | number>,
) => string;

/** 根据画像汇总「无更改记录 / 扫描失败」未生成清单，作为第二条助手消息 */
function buildSkippedProjectsFollowUp(
  profiles: readonly AgentProjectProfile[],
  authors: ReadonlyArray<{ name: string; email: string }>,
  t: ResumeTranslate,
): string | null {
  if (profiles.length === 0) {
    return null;
  }

  const matchedIds = new Set(
    filterProfilesByAuthor(profiles, authors).map((profile) => profile.projectId),
  );
  const noCommits: string[] = [];
  const failed: string[] = [];

  for (const profile of profiles) {
    if (profile.error) {
      failed.push(profile.projectName);
      continue;
    }
    if (!matchedIds.has(profile.projectId)) {
      noCommits.push(profile.projectName);
    }
  }

  const parts: string[] = [];
  if (noCommits.length > 0) {
    parts.push(
      t("multiAgent.skippedNoCommits", { names: noCommits.join("、") }),
    );
  }
  if (failed.length > 0) {
    parts.push(
      t("multiAgent.skippedScanFailed", { names: failed.join("、") }),
    );
  }
  if (parts.length === 0) {
    return null;
  }
  return parts.join("\n");
}
