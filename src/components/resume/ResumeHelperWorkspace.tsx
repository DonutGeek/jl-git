import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
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

const COMPOSER_BOTTOM_OFFSET_PX = 12;
/** 含快捷操作行的底栏预估高度，避免首帧消息被遮挡 */
const COMPOSER_PAD_FALLBACK_PX = 188;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

/** 简历帮子窗主界面：画像加载 + 对话 */
export function ResumeHelperWorkspace() {
  const { t } = useTranslation();
  const composerRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const replyAbortRef = useRef<AbortController | null>(null);
  const messageSeq = useRef(0);
  const greetedRef = useRef(false);

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

  useEffect(() => {
    let active = true;
    setProfilesLoading(true);
    void projectService
      .list()
      .then((projects) => buildResumeProfiles(projects))
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
  }, [setProfiles, setProfilesLoading, t]);

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
    // 避免用 <>，i18next 会把尖括号当 HTML 标签吃掉
    const authorsLabel = gitAuthors
      .filter((author) => author.name.trim() || author.email.trim())
      .map((author) => `${author.name || "—"} / ${author.email || "—"}`)
      .join("；");
    appendMessage({
      id: nextMessageId(),
      role: "assistant",
      content: t(greetingKey, {
        total: profiles.length,
        ok: okCount,
        fail: failCount,
        authors: authorsLabel || "—",
        authorCount: gitAuthors.filter(
          (author) => author.name.trim() || author.email.trim(),
        ).length,
      }),
      createdAt: new Date().toISOString(),
    });
  }, [
    appendMessage,
    gitAuthors,
    gitAuthorsReady,
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

  async function sendUserContent(content: string): Promise<void> {
    const trimmed = content.trim();
    if (!trimmed || isReplying || profilesLoading) {
      return;
    }

    absorbContactFromText(trimmed);
    const userMessage: AgentChatMessage = {
      id: nextMessageId(),
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    const assistantId = nextMessageId();
    clearDraft();
    appendMessage(userMessage);
    appendMessage({
      id: assistantId,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      isStreaming: true,
    });

    const controller = new AbortController();
    replyAbortRef.current = controller;
    setIsReplying(true);

    const currentIdentity = useResumeHelperStore.getState().identity;
    const currentAuthors = useResumeHelperStore.getState().gitAuthors;
    const filtered = filterProfilesByAuthor(profiles, currentAuthors);
    const history = [...useResumeHelperStore.getState().messages].filter(
      (message) => message.id !== assistantId,
    );

    try {
      // 只读拉取提交改动文件与 diff 摘录，禁止任何写操作
      const withCode = await enrichProfilesWithCodeEvidence(filtered);
      await streamResumeHelperReply({
        messages: history,
        profiles: withCode,
        identity: currentIdentity,
        gitAuthors: currentAuthors,
        locale,
        signal: controller.signal,
        onDelta: (delta) => {
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
      updateMessage(assistantId, {
        isStreaming: false,
        createdAt: new Date().toISOString(),
      });
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

  const quickActionsDisabled = isReplying || profilesLoading;
  const quickActions = [
    {
      id: "draft-all",
      label: t("resumeHelper.quickDraftAll"),
      prompt: t("resumeHelper.quickDraftAllPrompt"),
      icon: FileStack,
    },
    {
      id: "list-projects",
      label: t("resumeHelper.quickListProjects"),
      prompt: t("resumeHelper.quickListProjectsPrompt"),
      icon: ListTree,
    },
    {
      id: "rewrite-evidence",
      label: t("resumeHelper.quickRewriteEvidence"),
      prompt: t("resumeHelper.quickRewriteEvidencePrompt"),
      icon: FileCode2,
    },
  ] as const;

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
            <div
              className="flex min-w-0 flex-wrap items-center gap-1.5"
              role="group"
              aria-label={t("resumeHelper.quickActionsAria")}
            >
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <Button
                    key={action.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-border h-7 shrink-0 gap-1 px-2 text-[11px] shadow-none"
                    disabled={quickActionsDisabled}
                    onClick={() => {
                      void sendUserContent(action.prompt);
                    }}
                  >
                    <Icon className="size-3.5" aria-hidden="true" />
                    {action.label}
                  </Button>
                );
              })}
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
