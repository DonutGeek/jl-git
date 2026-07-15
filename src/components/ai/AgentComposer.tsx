import {
  forwardRef,
  useRef,
  type FormEvent,
  type KeyboardEvent,
  type Ref,
  type WheelEvent,
} from "react";
import { ArrowUp, LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Mention, MentionsInput } from "react-mentions-ts";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { AgentBranchMention } from "@/types/ai";

export interface AgentMentionOption extends Record<string, unknown> {
  id: string;
  display: string;
  isRemote: boolean;
}

interface AgentComposerProps {
  draftMarkup: string;
  draftPlainText: string;
  branchOptions: readonly AgentMentionOption[];
  isReplying: boolean;
  canSubmit: boolean;
  inputRef?: Ref<HTMLInputElement | HTMLTextAreaElement>;
  onDraftChange: (next: {
    markup: string;
    plainText: string;
    mentions: readonly AgentBranchMention[];
  }) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

/** Agent 输入区：Mentions + shadcn ScrollArea + 发送 */
export const AgentComposer = forwardRef<HTMLFormElement, AgentComposerProps>(
  function AgentComposer(
    {
      draftMarkup,
      draftPlainText,
      branchOptions,
      isReplying,
      canSubmit,
      inputRef,
      onDraftChange,
      onSubmit,
    },
    ref,
  ) {
    const { t } = useTranslation();
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    // 中文等 IME：选词回车时部分环境 isComposing 已是 false，需组合态标记 + keyCode 229
    const isComposingRef = useRef(false);
    const skipEnterSubmitRef = useRef(false);

    function handleCompositionStart(): void {
      isComposingRef.current = true;
    }

    function handleCompositionEnd(): void {
      isComposingRef.current = false;
      // compositionend 常早于确认选词的 Enter keydown，跳过紧随其后的一次发送
      skipEnterSubmitRef.current = true;
      window.setTimeout(() => {
        skipEnterSubmitRef.current = false;
      }, 0);
    }

    function handleInputKeyDown(
      event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    ): void {
      if (event.defaultPrevented) return;
      if (event.key !== "Enter" || event.shiftKey) {
        return;
      }
      const native = event.nativeEvent;
      if (
        isComposingRef.current ||
        skipEnterSubmitRef.current ||
        native.isComposing ||
        native.keyCode === 229
      ) {
        return;
      }
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }

    /** textarea 自身不滚动时，把滚轮交给外层 shadcn ScrollArea */
    function handleInputWheel(
      event: WheelEvent<HTMLInputElement | HTMLTextAreaElement>,
    ): void {
      const viewport = scrollAreaRef.current?.querySelector(
        '[data-slot="scroll-area-viewport"]',
      );
      if (!(viewport instanceof HTMLElement)) {
        return;
      }
      const { scrollTop, scrollHeight, clientHeight } = viewport;
      const maxScroll = scrollHeight - clientHeight;
      if (maxScroll <= 0) {
        return;
      }
      const next = Math.min(maxScroll, Math.max(0, scrollTop + event.deltaY));
      if (next === scrollTop) {
        return;
      }
      viewport.scrollTop = next;
      event.preventDefault();
    }

    return (
      <form
        ref={ref}
        className="bg-background absolute inset-x-3 bottom-3 z-10 rounded-md"
        onSubmit={onSubmit}
      >
        <div className="relative">
          {/* 边框在外层，避免 h-28+border 把内部 min-h-28 挤出视口从而空态也出滚动条 */}
          <div
            className={cn(
              "border-input dark:bg-input/30 h-28 w-full overflow-hidden rounded-md border bg-transparent shadow-none",
              "focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]",
            )}
          >
            <ScrollArea
              ref={scrollAreaRef}
              className={cn(
                "h-full w-full",
                // 无可滚内容时隐藏轨道（Radix 用 data-state=hidden）
                "[&_[data-slot=scroll-area-scrollbar][data-state=hidden]]:hidden",
                "[&_[data-slot=scroll-area-viewport]>div]:!block [&_[data-slot=scroll-area-viewport]>div]:!min-w-0 [&_[data-slot=scroll-area-viewport]>div]:w-full",
              )}
            >
              <MentionsInput<AgentMentionOption>
                inputRef={(element) => {
                  if (typeof inputRef === "function") {
                    inputRef(element);
                  } else if (inputRef) {
                    inputRef.current = element;
                  }
                }}
                value={draftMarkup}
                onMentionsChange={({ value, plainTextValue, mentions }) => {
                  onDraftChange({
                    markup: value,
                    plainText: plainTextValue,
                    mentions: mentions.map((mention) => ({
                      type: "branch",
                      name: String(mention.id),
                    })),
                  });
                }}
              onKeyDown={handleInputKeyDown}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
              onWheel={handleInputWheel}
                aria-label={t("agent.inputPlaceholder")}
                placeholder={t("agent.inputPlaceholder")}
                a11ySuggestionsListLabel={t("agent.branchMentions")}
                // 贴输入框左缘展开；库默认 portal+fixed，勿再写 absolute/bottom-full
                anchorMode="left"
                suggestionsPlacement="above"
                autoResize
                className="block w-full min-w-0"
                style={{ width: "100%" }}
                classNames={{
                  control:
                    "relative block min-h-full w-full min-w-0 rounded-md border-0 bg-transparent p-0 shadow-none",
                  // 空态贴满视口；内容变高后由外层 ScrollArea 滚动
                  input:
                    "placeholder:text-muted-foreground relative z-[1] block min-h-full w-full min-w-0 resize-none overflow-hidden rounded-none border-0 bg-transparent px-3 pt-2 pb-10 text-xs leading-5 break-words whitespace-pre-wrap shadow-none outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50",
                  // 必须 absolute，否则与 textarea 叠高，空态也会溢出
                  highlighter:
                    "pointer-events-none absolute inset-0 box-border min-h-full w-full min-w-0 overflow-hidden px-3 pt-2 pb-10 text-xs leading-5 break-words whitespace-pre-wrap",
                  suggestions:
                    "bg-popover text-popover-foreground z-[100] mb-1 min-w-0 overflow-hidden rounded-md border p-0 shadow-md",
                  // 强制去掉库默认 divide-y 分隔线
                  suggestionsList:
                    "m-0 max-h-none list-none overflow-visible p-0 !divide-y-0 divide-transparent",
                  suggestionItem:
                    "relative flex cursor-default items-center rounded-sm border-0 px-2 py-1.5 text-xs outline-hidden select-none hover:bg-accent hover:text-accent-foreground",
                  suggestionItemFocused: "bg-accent text-accent-foreground",
                }}
                customSuggestionsContainer={(children) => (
                  <div className="max-h-72 overflow-y-scroll overscroll-contain p-1">
                    {children}
                  </div>
                )}
                disabled={isReplying}
              >
                <Mention<AgentMentionOption>
                  trigger="@"
                  data={branchOptions}
                  appendSpaceOnAdd
                  maxSuggestions={branchOptions.length}
                  // highlighter 与 textarea 叠字对齐：禁止 padding/inline-flex（会撑宽导致错位）
                  // 用同色 box-shadow 模拟 Badge 胶囊边距，不改文字度量
                  className="rounded-sm bg-secondary text-secondary-foreground shadow-[0_0_0_2px_var(--secondary)] box-decoration-clone"
                  renderSuggestion={(branch) => (
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 flex-1 truncate">@{branch.display}</span>
                      <span className="bg-muted text-muted-foreground shrink-0 rounded px-1.5 py-0.5 text-[10px] leading-none">
                        {t(branch.isRemote ? "agent.remoteBranch" : "agent.localBranch")}
                      </span>
                    </div>
                  )}
                  renderEmpty={() => (
                    <span className="text-muted-foreground block px-2 py-1.5 text-xs">
                      {t("agent.noBranchMentions")}
                    </span>
                  )}
                />
              </MentionsInput>
            </ScrollArea>
          </div>
          <Button
            type="submit"
            size="icon-sm"
            className="absolute right-2 bottom-2 z-10"
            aria-label={t("agent.sendMessage")}
            disabled={!canSubmit || draftPlainText.trim().length === 0 || isReplying}
          >
            {isReplying ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : (
              <ArrowUp aria-hidden="true" />
            )}
          </Button>
        </div>
      </form>
    );
  },
);
