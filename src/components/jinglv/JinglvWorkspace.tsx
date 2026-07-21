import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { flushSync } from "react-dom";
import { FileCode2, FileStack, FileUser, ListTree } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { AgentComposer } from "@/components/ai/AgentComposer";
import { AgentMessageList } from "@/components/ai/AgentMessageList";
import { JinglvConversationSidebar } from "@/components/jinglv/JinglvConversationSidebar";
import { Button } from "@/components/ui/button";
import {
  deleteChatConversation,
  listChatConversations,
  reorderChatConversations,
  upsertChatConversation,
} from "@/services/ai/ai.chatPersist";
import { streamJinglvReply } from "@/services/ai/ai.jinglv";
import { listAllGitAuthorsForMatching } from "@/services/git/git.accounts";
import {
  emptyJinglvIdentity,
  getJinglvIdentity,
  setJinglvIdentity,
} from "@/services/jinglv/jinglv.identity";
import {
  buildJinglvProfiles,
  enrichProfilesWithCodeEvidence,
  filterProfilesByAuthor,
} from "@/services/jinglv/jinglv.profile";
import { projectService } from "@/services/project";
import { useLocaleStore } from "@/store/useLocaleStore";
import {
  getActiveJinglvConversation,
  getActiveJinglvMessages,
  useJinglvStore,
} from "@/store/useJinglvStore";
import { toUserMessage } from "@/types/error";
import type { AgentChatMessage, AgentConversation } from "@/types/ai";
import type { JinglvProjectProfile } from "@/types/jinglv";

interface SendResumeOptions {
  /** 仅这些仓库进入上下文（逐个写简历） */
  projectIds?: string[];
  /** 是否拉 diff 证据；列表类可关 */
  enrich?: boolean;
  /**
   * 成稿后再提示「无提交/失败未生成」的仓库。
   * 仅全量/列出类为 true；单项目成稿不要开，避免答非所问。
   */
  notifySkipped?: boolean;
}

const COMPOSER_BOTTOM_OFFSET_PX = 12;
/** 含快捷操作行的底栏预估高度，避免首帧消息被遮挡 */
/** 含快捷操作 + 项目点选行的底栏预估高度 */
const COMPOSER_PAD_FALLBACK_PX = 220;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

/** 鲸履子窗主界面：画像加载 + 对话 */
export function JinglvWorkspace() {
  const { t } = useTranslation();
  const composerRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const replyAbortRef = useRef<AbortController | null>(null);
  const messageSeq = useRef(0);
  /** 已写入问候语的会话，避免切换回来重复插入 */
  const greetedConversationIdsRef = useRef(new Set<string>());
  /** 最近一次成稿目标仓，供「加强表述」复用 */
  const lastTargetProjectIdRef = useRef<string | null>(null);

  const [draftMarkup, setDraftMarkup] = useState("");
  const [draftPlainText, setDraftPlainText] = useState("");
  const [isReplying, setIsReplying] = useState(false);
  const [composerPadPx, setComposerPadPx] = useState(COMPOSER_PAD_FALLBACK_PX);
  const [gitAuthorsReady, setGitAuthorsReady] = useState(false);

  const locale = useLocaleStore((state) => state.locale);
  const profiles = useJinglvStore((state) => state.profiles);
  const profilesLoading = useJinglvStore((state) => state.profilesLoading);
  const profilesError = useJinglvStore((state) => state.profilesError);
  const conversations = useJinglvStore((state) => state.conversations);
  const activeConversationId = useJinglvStore(
    (state) => state.activeConversationId,
  );
  const activeConversation =
    conversations.find((item) => item.id === activeConversationId) ?? null;
  const messages = activeConversation?.messages ?? [];
  const identity = useJinglvStore((state) => state.identity);
  const identityReady = useJinglvStore((state) => state.identityReady);
  const gitAuthors = useJinglvStore((state) => state.gitAuthors);
  const setProfilesLoading = useJinglvStore((state) => state.setProfilesLoading);
  const setProfiles = useJinglvStore((state) => state.setProfiles);
  const setIdentity = useJinglvStore((state) => state.setIdentity);
  const patchIdentity = useJinglvStore((state) => state.patchIdentity);
  const setGitAuthors = useJinglvStore((state) => state.setGitAuthors);
  const hydrateConversations = useJinglvStore(
    (state) => state.hydrateConversations,
  );
  const ensureDefaultConversation = useJinglvStore(
    (state) => state.ensureDefaultConversation,
  );
  const createConversation = useJinglvStore((state) => state.createConversation);
  const setActiveConversation = useJinglvStore(
    (state) => state.setActiveConversation,
  );
  const deleteConversation = useJinglvStore((state) => state.deleteConversation);
  const renameConversation = useJinglvStore((state) => state.renameConversation);
  const setConversationPinned = useJinglvStore(
    (state) => state.setConversationPinned,
  );
  const reorderConversations = useJinglvStore(
    (state) => state.reorderConversations,
  );
  const appendMessage = useJinglvStore((state) => state.appendMessage);
  const updateMessage = useJinglvStore((state) => state.updateMessage);
  const removeMessage = useJinglvStore((state) => state.removeMessage);

  async function persistConversation(
    conversation: AgentConversation,
  ): Promise<void> {
    try {
      await upsertChatConversation({
        scope: "jinglv",
        conversation,
      });
    } catch (error) {
      console.error(error);
      toast.error(toUserMessage(error) || t("jinglv.replyFailed"));
    }
  }

  async function persistActiveConversation(): Promise<void> {
    const conversation = getActiveJinglvConversation();
    if (conversation) {
      await persistConversation(conversation);
    }
  }

  async function persistConversationById(conversationId: string): Promise<void> {
    const conversation = useJinglvStore
      .getState()
      .conversations.find((item) => item.id === conversationId);
    if (conversation) {
      await persistConversation(conversation);
    }
  }

  async function persistOrder(): Promise<void> {
    const orderedIds = useJinglvStore
      .getState()
      .conversations.map((item) => item.id);
    if (orderedIds.length === 0) {
      return;
    }
    try {
      await reorderChatConversations({
        scope: "jinglv",
        orderedIds,
      });
    } catch (error) {
      console.error(error);
      toast.error(toUserMessage(error) || t("jinglv.replyFailed"));
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function hydrate(): Promise<void> {
      try {
        const list = await listChatConversations({ scope: "jinglv" });
        if (cancelled) {
          return;
        }
        if (list.length > 0) {
          hydrateConversations(list);
          return;
        }
        ensureDefaultConversation();
        const created = getActiveJinglvConversation();
        if (created) {
          await persistConversation(created);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        console.error(error);
        ensureDefaultConversation();
        toast.error(toUserMessage(error) || t("jinglv.replyFailed"));
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [ensureDefaultConversation, hydrateConversations, t]);

  useEffect(() => {
    let active = true;
    void getJinglvIdentity()
      .then((next) => {
        if (active) setIdentity(next);
      })
      .catch(() => {
        if (active) setIdentity(emptyJinglvIdentity());
      });
    return () => {
      active = false;
    };
  }, [setIdentity]);

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
    void projectService
      .list()
      .then((projects) =>
        buildJinglvProfiles(projects, useJinglvStore.getState().gitAuthors),
      )
      .then((next) => {
        if (active) setProfiles(next);
      })
      .catch((error: unknown) => {
        if (active) {
          setProfiles([], toUserMessage(error) || t("jinglv.profileFailed"));
        }
      });
    return () => {
      active = false;
    };
  }, [gitAuthorsReady, authorsKey, setProfiles, setProfilesLoading, t]);

  useEffect(() => {
    if (
      !activeConversationId ||
      profilesLoading ||
      !identityReady ||
      !gitAuthorsReady ||
      profilesError
    ) {
      return;
    }
    if (greetedConversationIdsRef.current.has(activeConversationId)) {
      return;
    }
    if (messages.length > 0) {
      greetedConversationIdsRef.current.add(activeConversationId);
      return;
    }
    greetedConversationIdsRef.current.add(activeConversationId);
    const okCount = profiles.filter((item) => !item.error).length;
    const failCount = profiles.length - okCount;
    const hasAuthors = gitAuthors.some(
      (author) => author.name.trim() || author.email.trim(),
    );
    const greetingKey = hasAuthors
      ? "jinglv.greetingConfigured"
      : "jinglv.greeting";
    // 问候语只展示 Git 用户名（匹配仍用 name+email）
    const authorsLabel = gitAuthors
      .map((author) => author.name.trim())
      .filter((name) => name.length > 0)
      .join("；");
    const missingIdentity: string[] = [];
    if (!identity.displayName.trim()) {
      missingIdentity.push(t("jinglv.identityFieldName"));
    }
    if (!identity.phone.trim()) {
      missingIdentity.push(t("jinglv.identityFieldPhone"));
    }
    if (!identity.email.trim()) {
      missingIdentity.push(t("jinglv.identityFieldEmail"));
    }
    const greetingBody = t(greetingKey, {
      total: profiles.length,
      ok: okCount,
      fail: failCount,
      authors: authorsLabel || "—",
      authorCount: gitAuthors.filter(
        (author) => author.name.trim() || author.email.trim(),
      ).length,
    });
    const identityHint =
      missingIdentity.length > 0
        ? `\n\n${t("jinglv.greetingIdentityMissing", {
            missing: missingIdentity.join("、"),
          })}`
        : "";
    appendMessage({
      id: nextMessageId(),
      role: "assistant",
      content: `${greetingBody}${identityHint}`,
      createdAt: new Date().toISOString(),
    });
    void persistActiveConversation();
  }, [
    activeConversationId,
    appendMessage,
    gitAuthors,
    gitAuthorsReady,
    identity,
    identityReady,
    messages.length,
    profiles,
    profilesError,
    profilesLoading,
    t,
  ]);

  useEffect(() => {
    return () => {
      replyAbortRef.current?.abort();
    };
  }, []);

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
  }

  function absorbContactFromText(text: string): void {
    const emailMatch = text.match(EMAIL_PATTERN)?.[0] ?? null;
    if (!emailMatch || identity.email) {
      return;
    }
    const next = { ...identity, email: emailMatch };
    patchIdentity(next);
    void setJinglvIdentity(next).catch(() => {
      // 对话补全失败不阻断回复
    });
  }

  const matchedProfiles = useMemo(
    () => filterProfilesByAuthor(profiles, gitAuthors),
    [profiles, gitAuthors],
  );

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

    const currentAuthors = useJinglvStore.getState().gitAuthors;
    const allProfiles = useJinglvStore.getState().profiles;
    const filtered = filterProfilesByAuthor(allProfiles, currentAuthors);
    // 显式点名 / projectIds 才锁定成稿目标；否则仍发消息，用可写仓清单作轻量上下文
    const explicitTargets = resolveTargetProfiles(
      filtered,
      trimmed,
      options.projectIds,
    );
    const targets =
      explicitTargets.length > 0
        ? explicitTargets
        : filtered.length > 0
          ? filtered
          : allProfiles;
    // 未锁定单仓时禁止 enrich，避免闲聊/未点名时全量拉 diff
    const shouldEnrich =
      options.enrich !== false && explicitTargets.length > 0;
    if (explicitTargets.length === 1) {
      lastTargetProjectIdRef.current = explicitTargets[0]!.projectId;
    }

    const askedAt = new Date().toISOString();
    const assistantId = nextMessageId();

    flushSync(() => {
      absorbContactFromText(trimmed);
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
    const currentIdentity = useJinglvStore.getState().identity;

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
      const withCode = shouldEnrich
        ? await enrichProfilesWithCodeEvidence(explicitTargets)
        : targets;
      if (controller.signal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      await streamJinglvReply({
        messages: history,
        profiles: withCode,
        identity: currentIdentity,
        gitAuthors: currentAuthors,
        locale,
        signal: controller.signal,
        onReasoningDelta: (delta) => {
          if (reasoningStartedAt == null) {
            reasoningStartedAt = Date.now();
          }
          flushSync(() => {
            const current = getActiveJinglvMessages().find(
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
            const current = getActiveJinglvMessages().find(
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
          useJinglvStore.getState().profiles,
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
      const current = getActiveJinglvMessages().find(
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
        toast.error(toUserMessage(error) || t("jinglv.replyFailed"));
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
    const userMessage: AgentChatMessage = {
      id: nextMessageId(),
      role: "user",
      content: trimmed,
      createdAt: askedAt,
    };
    const history = [...getActiveJinglvMessages(), userMessage];

    flushSync(() => {
      clearDraft();
      appendMessage(userMessage);
    });
    void persistActiveConversation();

    await continueResumeFromHistory(history, options);
  }

  async function handleRegenerateLast(): Promise<void> {
    if (isReplying || profilesLoading) {
      return;
    }
    const current = getActiveJinglvMessages();
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

    const history = useJinglvStore
      .getState()
      .editUserMessageAndTruncate(messageId, trimmed);
    if (!history) {
      toast.error(t("jinglv.replyFailed"));
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
    await sendUserContent(draftPlainText);
  }

  /**
   * 全量成稿：按仓库串行 enrich + 请求模型（一次只打一个仓），
   * 宁可更久，避免并发把机器打满。
   */
  async function draftAllProjectsSequentially(): Promise<void> {
    if (isReplying || profilesLoading) {
      return;
    }

    const currentAuthors = useJinglvStore.getState().gitAuthors;
    const targets = filterProfilesByAuthor(
      useJinglvStore.getState().profiles,
      currentAuthors,
    );
    if (targets.length === 0) {
      toast.message(t("jinglv.pickProjectHint"));
      return;
    }

    const askedAt = new Date().toISOString();
    const userMessage: AgentChatMessage = {
      id: nextMessageId(),
      role: "user",
      content: t("jinglv.quickDraftAllPrompt"),
      createdAt: askedAt,
    };
    const progressId = nextMessageId();

    flushSync(() => {
      clearDraft();
      appendMessage(userMessage);
      appendMessage({
        id: progressId,
        role: "assistant",
        content: t("jinglv.sequentialProgress", {
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
    const currentIdentity = useJinglvStore.getState().identity;
    let completed = 0;

    try {
      for (let index = 0; index < targets.length; index += 1) {
        if (controller.signal.aborted) {
          break;
        }
        const profile = targets[index]!;
        lastTargetProjectIdRef.current = profile.projectId;

        updateMessage(progressId, {
          content: t("jinglv.sequentialProgress", {
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
            content: t("jinglv.quickDraftOnePrompt", {
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
          await streamJinglvReply({
            messages: turnMessages,
            profiles: withCode,
            identity: currentIdentity,
            gitAuthors: currentAuthors,
            locale,
            signal: controller.signal,
            onReasoningDelta: (delta) => {
              if (reasoningStartedAt == null) {
                reasoningStartedAt = Date.now();
              }
              flushSync(() => {
                const current = getActiveJinglvMessages().find(
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
                const current = getActiveJinglvMessages().find(
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
            const current = getActiveJinglvMessages().find(
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
            content: t("jinglv.sequentialItemFailed", {
              name: profile.projectName,
              reason: toUserMessage(error) || t("jinglv.replyFailed"),
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
          content: t("jinglv.sequentialAborted", { count: completed }),
          isStreaming: false,
          createdAt: new Date().toISOString(),
        });
      } else {
        updateMessage(progressId, {
          content: t("jinglv.sequentialDone", { count: completed }),
          isStreaming: false,
          createdAt: new Date().toISOString(),
        });

        const followUp = buildSkippedProjectsFollowUp(
          useJinglvStore.getState().profiles,
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
        content: t("jinglv.sequentialAborted", { count: completed }),
        isStreaming: false,
        createdAt: new Date().toISOString(),
      });
      if (!controller.signal.aborted) {
        toast.error(toUserMessage(error) || t("jinglv.replyFailed"));
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

  const quickActionsDisabled = isReplying || profilesLoading;

  return (
    <main className="bg-background text-foreground flex h-screen min-h-0 w-full flex-col overflow-hidden">
      <header
        data-tauri-drag-region
        className="border-border bg-muted/40 flex h-11 shrink-0 items-center gap-2 border-b px-4 pl-[88px]"
      >
        <FileUser className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
        <span className="truncate text-sm font-semibold">{t("jinglv.windowTitle")}</span>
        {profilesLoading ? (
          <span className="text-muted-foreground ml-auto text-xs">
            {t("jinglv.scanning")}
          </span>
        ) : (
          <span className="text-muted-foreground ml-auto text-xs">
            {t("jinglv.projectCount", { count: profiles.length })}
            {matchedProfiles.length > 0
              ? ` · ${t("jinglv.matchedProjectCount", {
                  count: matchedProfiles.length,
                })}`
              : ""}
          </span>
        )}
      </header>

      {profilesError ? (
        <p className="text-destructive px-4 py-3 text-center text-sm">{profilesError}</p>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <JinglvConversationSidebar
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelect={(conversationId) => {
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
            const before = useJinglvStore.getState().conversations;
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
              toast.error(toUserMessage(error) || t("jinglv.replyFailed"));
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
        />

        <div className="relative min-h-0 min-w-0 flex-1">
        <AgentMessageList
          messages={messages}
          conversationId={activeConversationId ?? "jinglv"}
          composerPadPx={composerPadPx}
          onCompareBranches={() => undefined}
          actionsDisabled={isReplying || profilesLoading}
          onRegenerateLast={() => {
            void handleRegenerateLast();
          }}
          onEditUserMessage={(messageId, content) => {
            void handleEditUserMessage(messageId, content);
          }}
        />
        {/* 挡住输入区后方透出的消息，高度与整块底栏（快捷操作+输入）一致 */}
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
          branchOptions={[]}
          isReplying={isReplying}
          canSubmit={!profilesLoading && draftPlainText.trim().length > 0}
          placeholder={t("jinglv.inputPlaceholder")}
          topAccessory={
            <div className="flex min-w-0 flex-col gap-1.5">
              <div
                className="flex min-w-0 flex-wrap items-center gap-1.5"
                role="group"
                aria-label={t("jinglv.quickActionsAria")}
              >
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-border h-7 shrink-0 gap-1 px-2 text-[11px] shadow-none"
                  disabled={quickActionsDisabled || matchedProfiles.length === 0}
                  title={t("jinglv.quickDraftAllHint")}
                  onClick={() => {
                    void draftAllProjectsSequentially();
                  }}
                >
                  <FileStack className="size-3.5" aria-hidden="true" />
                  {t("jinglv.quickDraftAll")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-border h-7 shrink-0 gap-1 px-2 text-[11px] shadow-none"
                  disabled={quickActionsDisabled}
                  title={t("jinglv.quickListProjectsHint")}
                  onClick={() => {
                    void sendUserContent(t("jinglv.quickListProjectsPrompt"), {
                      enrich: false,
                      projectIds: matchedProfiles.map((item) => item.projectId),
                      notifySkipped: true,
                    });
                  }}
                >
                  <ListTree className="size-3.5" aria-hidden="true" />
                  {t("jinglv.quickListProjects")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-border h-7 shrink-0 gap-1 px-2 text-[11px] shadow-none"
                  disabled={quickActionsDisabled}
                  onClick={() => {
                    const lastId = lastTargetProjectIdRef.current;
                    const projectIds = lastId
                      ? [lastId]
                      : matchedProfiles.length === 1
                        ? [matchedProfiles[0]!.projectId]
                        : undefined;
                    if (!projectIds) {
                      toast.message(t("jinglv.pickOneProjectHint"));
                      return;
                    }
                    void sendUserContent(t("jinglv.quickRewriteEvidencePrompt"), {
                      enrich: false,
                      projectIds,
                      notifySkipped: false,
                    });
                  }}
                >
                  <FileCode2 className="size-3.5" aria-hidden="true" />
                  {t("jinglv.quickRewriteEvidence")}
                </Button>
              </div>
              {matchedProfiles.length > 0 ? (
                <div
                  className="flex max-h-16 min-w-0 flex-wrap gap-1 overflow-y-auto"
                  role="group"
                  aria-label={t("jinglv.projectPickerAria")}
                >
                  {matchedProfiles.map((profile) => (
                    <Button
                      key={profile.projectId}
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-7 max-w-[11rem] shrink-0 truncate px-2 text-[11px] shadow-none"
                      disabled={quickActionsDisabled}
                      title={profile.projectName}
                      onClick={() => {
                        void sendUserContent(
                          t("jinglv.quickDraftOnePrompt", {
                            name: profile.projectName,
                          }),
                          {
                            projectIds: [profile.projectId],
                            enrich: true,
                            notifySkipped: false,
                          },
                        );
                      }}
                    >
                      {profile.projectName}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
          }
          onDraftChange={({ markup, plainText }) => {
            setDraftMarkup(markup);
            setDraftPlainText(plainText);
          }}
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
          onStop={handleStopReply}
        />
        </div>
      </div>
    </main>
  );
}

/**
 * 解析本轮目标仓库：优先显式 projectIds，其次消息里点名的项目名。
 * 多仓且未点名时返回空，迫使逐个点选，避免全量 enrich 打满机器。
 */
function resolveTargetProfiles(
  filtered: readonly JinglvProjectProfile[],
  content: string,
  projectIds?: string[],
): JinglvProjectProfile[] {
  if (projectIds && projectIds.length > 0) {
    const idSet = new Set(projectIds);
    return filtered.filter((profile) => idSet.has(profile.projectId));
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

type ResumeTranslate = (
  key: string,
  options?: Record<string, string | number>,
) => string;

/** 根据画像汇总「无更改记录 / 扫描失败」未生成清单，作为第二条助手消息 */
function buildSkippedProjectsFollowUp(
  profiles: readonly JinglvProjectProfile[],
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
      t("jinglv.skippedNoCommits", { names: noCommits.join("、") }),
    );
  }
  if (failed.length > 0) {
    parts.push(
      t("jinglv.skippedScanFailed", { names: failed.join("、") }),
    );
  }
  if (parts.length === 0) {
    return null;
  }
  return parts.join("\n");
}
