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
import { Button } from "@/components/ui/button";
import { streamResumeHelperReply } from "@/services/ai/ai.resume";
import { listAllGitAuthorsForMatching } from "@/services/git/git.accounts";
import {
  emptyResumeHelperIdentity,
  getResumeHelperIdentity,
  setResumeHelperIdentity,
} from "@/services/resume/resume.identity";
import {
  buildResumeProfiles,
  enrichProfilesWithCodeEvidence,
  filterProfilesByAuthor,
} from "@/services/resume/resume.profile";
import { projectService } from "@/services/project";
import { useLocaleStore } from "@/store/useLocaleStore";
import { useResumeHelperStore } from "@/store/useResumeHelperStore";
import { toUserMessage } from "@/types/error";
import type { AgentChatMessage } from "@/types/ai";
import type { ResumeProjectProfile } from "@/types/resumeHelper";

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

/** 简历帮子窗主界面：画像加载 + 对话 */
export function ResumeHelperWorkspace() {
  const { t } = useTranslation();
  const composerRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const replyAbortRef = useRef<AbortController | null>(null);
  const messageSeq = useRef(0);
  const greetedRef = useRef(false);
  /** 最近一次成稿目标仓，供「加强表述」复用 */
  const lastTargetProjectIdRef = useRef<string | null>(null);

  const [draftMarkup, setDraftMarkup] = useState("");
  const [draftPlainText, setDraftPlainText] = useState("");
  const [isReplying, setIsReplying] = useState(false);
  const [composerPadPx, setComposerPadPx] = useState(COMPOSER_PAD_FALLBACK_PX);
  const [gitAuthorsReady, setGitAuthorsReady] = useState(false);

  const locale = useLocaleStore((state) => state.locale);
  const profiles = useResumeHelperStore((state) => state.profiles);
  const profilesLoading = useResumeHelperStore((state) => state.profilesLoading);
  const profilesError = useResumeHelperStore((state) => state.profilesError);
  const messages = useResumeHelperStore((state) => state.messages);
  const identity = useResumeHelperStore((state) => state.identity);
  const identityReady = useResumeHelperStore((state) => state.identityReady);
  const gitAuthors = useResumeHelperStore((state) => state.gitAuthors);
  const setProfilesLoading = useResumeHelperStore((state) => state.setProfilesLoading);
  const setProfiles = useResumeHelperStore((state) => state.setProfiles);
  const setIdentity = useResumeHelperStore((state) => state.setIdentity);
  const patchIdentity = useResumeHelperStore((state) => state.patchIdentity);
  const setGitAuthors = useResumeHelperStore((state) => state.setGitAuthors);
  const appendMessage = useResumeHelperStore((state) => state.appendMessage);
  const updateMessage = useResumeHelperStore((state) => state.updateMessage);
  const removeMessage = useResumeHelperStore((state) => state.removeMessage);

  useEffect(() => {
    let active = true;
    void getResumeHelperIdentity()
      .then((next) => {
        if (active) setIdentity(next);
      })
      .catch(() => {
        if (active) setIdentity(emptyResumeHelperIdentity());
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
        buildResumeProfiles(projects, useResumeHelperStore.getState().gitAuthors),
      )
      .then((next) => {
        if (active) setProfiles(next);
      })
      .catch((error: unknown) => {
        if (active) {
          setProfiles([], toUserMessage(error) || t("resumeHelper.profileFailed"));
        }
      });
    return () => {
      active = false;
    };
  }, [gitAuthorsReady, authorsKey, setProfiles, setProfilesLoading, t]);

  useEffect(() => {
    if (
      profilesLoading ||
      !identityReady ||
      !gitAuthorsReady ||
      greetedRef.current ||
      messages.length > 0 ||
      profilesError
    ) {
      return;
    }
    greetedRef.current = true;
    const okCount = profiles.filter((item) => !item.error).length;
    const failCount = profiles.length - okCount;
    const hasAuthors = gitAuthors.some(
      (author) => author.name.trim() || author.email.trim(),
    );
    const greetingKey = hasAuthors
      ? "resumeHelper.greetingConfigured"
      : "resumeHelper.greeting";
    // 问候语只展示 Git 用户名（匹配仍用 name+email）
    const authorsLabel = gitAuthors
      .map((author) => author.name.trim())
      .filter((name) => name.length > 0)
      .join("；");
    const missingIdentity: string[] = [];
    if (!identity.displayName.trim()) {
      missingIdentity.push(t("resumeHelper.identityFieldName"));
    }
    if (!identity.phone.trim()) {
      missingIdentity.push(t("resumeHelper.identityFieldPhone"));
    }
    if (!identity.email.trim()) {
      missingIdentity.push(t("resumeHelper.identityFieldEmail"));
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
        ? `\n\n${t("resumeHelper.greetingIdentityMissing", {
            missing: missingIdentity.join("、"),
          })}`
        : "";
    appendMessage({
      id: nextMessageId(),
      role: "assistant",
      content: `${greetingBody}${identityHint}`,
      createdAt: new Date().toISOString(),
    });
  }, [
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
    void setResumeHelperIdentity(next).catch(() => {
      // 对话补全失败不阻断回复
    });
  }

  const matchedProfiles = useMemo(
    () => filterProfilesByAuthor(profiles, gitAuthors),
    [profiles, gitAuthors],
  );

  async function sendUserContent(
    content: string,
    options: SendResumeOptions = {},
  ): Promise<void> {
    const trimmed = content.trim();
    if (!trimmed || isReplying || profilesLoading) {
      return;
    }

    const currentAuthors = useResumeHelperStore.getState().gitAuthors;
    const filtered = filterProfilesByAuthor(
      useResumeHelperStore.getState().profiles,
      currentAuthors,
    );
    const targets = resolveTargetProfiles(filtered, trimmed, options.projectIds);
    if (targets.length === 0) {
      toast.message(t("resumeHelper.pickProjectHint"));
      return;
    }
    if (targets.length === 1) {
      lastTargetProjectIdRef.current = targets[0]!.projectId;
    }

    const askedAt = new Date().toISOString();
    const userMessage: AgentChatMessage = {
      id: nextMessageId(),
      role: "user",
      content: trimmed,
      createdAt: askedAt,
    };
    const assistantId = nextMessageId();

    // 先同步上屏用户消息与「思考中」，避免 enrich/模型请求拖住点击反馈
    flushSync(() => {
      absorbContactFromText(trimmed);
      clearDraft();
      appendMessage(userMessage);
      appendMessage({
        id: assistantId,
        role: "assistant",
        content: "",
        createdAt: askedAt,
        isStreaming: true,
      });
      setIsReplying(true);
    });

    // 等浏览器画出本帧后再拉代码证据 / 请求模型
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
    });

    const controller = new AbortController();
    replyAbortRef.current = controller;

    const currentIdentity = useResumeHelperStore.getState().identity;
    const history = [...useResumeHelperStore.getState().messages].filter(
      (message) => message.id !== assistantId,
    );

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
      // 默认只 enrich 目标仓；列表类可跳过 diff，降低内存与 IO
      const withCode =
        options.enrich === false
          ? targets
          : await enrichProfilesWithCodeEvidence(targets);
      await streamResumeHelperReply({
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
            const current = useResumeHelperStore
              .getState()
              .messages.find((message) => message.id === assistantId);
            updateMessage(assistantId, {
              reasoningContent: `${current?.reasoningContent ?? ""}${delta}`,
              isStreaming: true,
            });
          });
        },
        onDelta: (delta) => {
          // 正文开始视为深度思考结束
          settleReasoningDuration();
          flushSync(() => {
            const current = useResumeHelperStore
              .getState()
              .messages.find((message) => message.id === assistantId);
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

      // 仅全量/列出等显式开启时，再提示未生成的仓库；单项目成稿不追加
      if (options.notifySkipped === true) {
        const followUp = buildSkippedProjectsFollowUp(
          useResumeHelperStore.getState().profiles,
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
      removeMessage(assistantId);
      toast.error(toUserMessage(error) || t("resumeHelper.replyFailed"));
    } finally {
      if (replyAbortRef.current === controller) {
        replyAbortRef.current = null;
      }
      setIsReplying(false);
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
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

    const currentAuthors = useResumeHelperStore.getState().gitAuthors;
    const targets = filterProfilesByAuthor(
      useResumeHelperStore.getState().profiles,
      currentAuthors,
    );
    if (targets.length === 0) {
      toast.message(t("resumeHelper.pickProjectHint"));
      return;
    }

    const askedAt = new Date().toISOString();
    const userMessage: AgentChatMessage = {
      id: nextMessageId(),
      role: "user",
      content: t("resumeHelper.quickDraftAllPrompt"),
      createdAt: askedAt,
    };
    const progressId = nextMessageId();

    flushSync(() => {
      clearDraft();
      appendMessage(userMessage);
      appendMessage({
        id: progressId,
        role: "assistant",
        content: t("resumeHelper.sequentialProgress", {
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
    const currentIdentity = useResumeHelperStore.getState().identity;
    let completed = 0;

    try {
      for (let index = 0; index < targets.length; index += 1) {
        if (controller.signal.aborted) {
          break;
        }
        const profile = targets[index]!;
        lastTargetProjectIdRef.current = profile.projectId;

        updateMessage(progressId, {
          content: t("resumeHelper.sequentialProgress", {
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
            content: t("resumeHelper.quickDraftOnePrompt", {
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
          await streamResumeHelperReply({
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
                const current = useResumeHelperStore
                  .getState()
                  .messages.find((message) => message.id === draftId);
                updateMessage(draftId, {
                  reasoningContent: `${current?.reasoningContent ?? ""}${delta}`,
                  isStreaming: true,
                });
              });
            },
            onDelta: (delta) => {
              settleReasoningDuration();
              flushSync(() => {
                const current = useResumeHelperStore
                  .getState()
                  .messages.find((message) => message.id === draftId);
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
        } catch (error) {
          removeMessage(draftId);
          if (controller.signal.aborted) {
            throw error;
          }
          // 单仓失败不中断后续，提示后继续
          appendMessage({
            id: nextMessageId(),
            role: "assistant",
            content: t("resumeHelper.sequentialItemFailed", {
              name: profile.projectName,
              reason: toUserMessage(error) || t("resumeHelper.replyFailed"),
            }),
            createdAt: new Date().toISOString(),
          });
        }

        // 让出事件循环，避免长时间占满主线程
        await new Promise<void>((resolve) => {
          window.setTimeout(() => resolve(), 0);
        });
      }

      updateMessage(progressId, {
        content: t("resumeHelper.sequentialDone", { count: completed }),
        isStreaming: false,
        createdAt: new Date().toISOString(),
      });

      const followUp = buildSkippedProjectsFollowUp(
        useResumeHelperStore.getState().profiles,
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
    } catch (error) {
      updateMessage(progressId, {
        content: t("resumeHelper.sequentialAborted", { count: completed }),
        isStreaming: false,
      });
      toast.error(toUserMessage(error) || t("resumeHelper.replyFailed"));
    } finally {
      if (replyAbortRef.current === controller) {
        replyAbortRef.current = null;
      }
      setIsReplying(false);
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  const quickActionsDisabled = isReplying || profilesLoading;

  return (
    <main className="bg-background text-foreground flex h-screen min-h-0 w-full flex-col overflow-hidden">
      <header
        data-tauri-drag-region
        className="border-border bg-muted/40 flex h-11 shrink-0 items-center gap-2 border-b px-4 pl-[88px]"
      >
        <FileUser className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
        <span className="truncate text-sm font-semibold">{t("resumeHelper.windowTitle")}</span>
        {profilesLoading ? (
          <span className="text-muted-foreground ml-auto text-xs">
            {t("resumeHelper.scanning")}
          </span>
        ) : (
          <span className="text-muted-foreground ml-auto text-xs">
            {t("resumeHelper.projectCount", { count: profiles.length })}
            {matchedProfiles.length > 0
              ? ` · ${t("resumeHelper.matchedProjectCount", {
                  count: matchedProfiles.length,
                })}`
              : ""}
          </span>
        )}
      </header>

      {profilesError ? (
        <p className="text-destructive px-4 py-3 text-center text-sm">{profilesError}</p>
      ) : null}

      <div className="relative min-h-0 flex-1">
        <AgentMessageList
          messages={messages}
          conversationId="resume-helper"
          composerPadPx={composerPadPx}
          onCompareBranches={() => undefined}
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
          placeholder={t("resumeHelper.inputPlaceholder")}
          topAccessory={
            <div className="flex min-w-0 flex-col gap-1.5">
              <div
                className="flex min-w-0 flex-wrap items-center gap-1.5"
                role="group"
                aria-label={t("resumeHelper.quickActionsAria")}
              >
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-border h-7 shrink-0 gap-1 px-2 text-[11px] shadow-none"
                  disabled={quickActionsDisabled || matchedProfiles.length === 0}
                  title={t("resumeHelper.quickDraftAllHint")}
                  onClick={() => {
                    void draftAllProjectsSequentially();
                  }}
                >
                  <FileStack className="size-3.5" aria-hidden="true" />
                  {t("resumeHelper.quickDraftAll")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-border h-7 shrink-0 gap-1 px-2 text-[11px] shadow-none"
                  disabled={quickActionsDisabled}
                  title={t("resumeHelper.quickListProjectsHint")}
                  onClick={() => {
                    void sendUserContent(t("resumeHelper.quickListProjectsPrompt"), {
                      enrich: false,
                      projectIds: matchedProfiles.map((item) => item.projectId),
                      notifySkipped: true,
                    });
                  }}
                >
                  <ListTree className="size-3.5" aria-hidden="true" />
                  {t("resumeHelper.quickListProjects")}
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
                      toast.message(t("resumeHelper.pickProjectHint"));
                      return;
                    }
                    void sendUserContent(t("resumeHelper.quickRewriteEvidencePrompt"), {
                      enrich: false,
                      projectIds,
                      notifySkipped: false,
                    });
                  }}
                >
                  <FileCode2 className="size-3.5" aria-hidden="true" />
                  {t("resumeHelper.quickRewriteEvidence")}
                </Button>
              </div>
              {matchedProfiles.length > 0 ? (
                <div
                  className="flex max-h-16 min-w-0 flex-wrap gap-1 overflow-y-auto"
                  role="group"
                  aria-label={t("resumeHelper.projectPickerAria")}
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
                          t("resumeHelper.quickDraftOnePrompt", {
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
        />
      </div>
    </main>
  );
}

/**
 * 解析本轮目标仓库：优先显式 projectIds，其次消息里点名的项目名。
 * 多仓且未点名时返回空，迫使逐个点选，避免全量 enrich 打满机器。
 */
function resolveTargetProfiles(
  filtered: readonly ResumeProjectProfile[],
  content: string,
  projectIds?: string[],
): ResumeProjectProfile[] {
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
  profiles: readonly ResumeProjectProfile[],
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
      t("resumeHelper.skippedNoCommits", { names: noCommits.join("、") }),
    );
  }
  if (failed.length > 0) {
    parts.push(
      t("resumeHelper.skippedScanFailed", { names: failed.join("、") }),
    );
  }
  if (parts.length === 0) {
    return null;
  }
  return parts.join("\n");
}
