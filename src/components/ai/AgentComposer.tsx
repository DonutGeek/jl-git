import {
  forwardRef,
  useCallback,
  useRef,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  type WheelEvent,
} from "react";
import { ArrowUp, Atom } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Mention, MentionsInput } from "react-mentions-ts";

import { MentionSuggestionVirtualList } from "@/components/ai/MentionSuggestionVirtualList";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { AgentBranchMention } from "@/types/ai";

export interface AgentMentionOption extends Record<string, unknown> {
  id: string;
  display: string;
  isRemote: boolean;
  /** 是否在该项上方渲染分组标题（过滤后各组首条） */
  showGroupHeader?: boolean;
}

function compareBranchDisplay(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

/** 本地组在前、远端组在后；组内按名称；各组首条带分组标题 */
function buildMentionSuggestions(
  options: readonly AgentMentionOption[],
  query: string,
): AgentMentionOption[] {
  const needle = query.trim().toLowerCase();
  const matched = options.filter((option) => {
    if (!needle) {
      return true;
    }
    return (
      option.display.toLowerCase().includes(needle) ||
      option.id.toLowerCase().includes(needle)
    );
  });

  const local = matched
    .filter((option) => !option.isRemote)
    .sort((a, b) => compareBranchDisplay(a.display, b.display));
  const remote = matched
    .filter((option) => option.isRemote)
    .sort((a, b) => compareBranchDisplay(a.display, b.display));

  return [
    ...local.map((option, index) => ({
      ...option,
      showGroupHeader: index === 0,
    })),
    ...remote.map((option, index) => ({
      ...option,
      showGroupHeader: index === 0,
    })),
  ];
}

interface AgentComposerProps {
  draftMarkup: string;
  draftPlainText: string;
  branchOptions: readonly AgentMentionOption[];
  isReplying: boolean;
  canSubmit: boolean;
  /** 覆盖默认占位文案 */
  placeholder?: string;
  /** 输入框上方附件区（如快捷操作），计入表单高度供消息列表垫底 */
  topAccessory?: ReactNode;
  inputRef?: Ref<HTMLInputElement | HTMLTextAreaElement>;
  onDraftChange: (next: {
    markup: string;
    plainText: string;
    mentions: readonly AgentBranchMention[];
  }) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  /** 生成中点击停止（Abort 当前流式请求） */
  onStop?: () => void;
  /** 是否展示左下角「深度思考」开关（鲸灵） */
  showThinkingToggle?: boolean;
  thinkingEnabled?: boolean;
  onThinkingEnabledChange?: (enabled: boolean) => void;
}

/** Agent 输入区：Mentions + shadcn ScrollArea + 发送 / 停止 */
export const AgentComposer = forwardRef<HTMLFormElement, AgentComposerProps>(
  function AgentComposer(
    {
      draftMarkup,
      draftPlainText,
      branchOptions,
      isReplying,
      canSubmit,
      placeholder,
      topAccessory,
      inputRef,
      onDraftChange,
      onSubmit,
      onStop,
      showThinkingToggle = false,
      thinkingEnabled = true,
      onThinkingEnabledChange,
    },
    ref,
  ) {
    const { t } = useTranslation();
    const inputPlaceholder = placeholder ?? t("agent.inputPlaceholder");
    const scrollAreaRef = useRef<HTMLDivElement>(null);
    // 中文等 IME：选词回车时部分环境 isComposing 已是 false，需组合态标记 + keyCode 229
    const isComposingRef = useRef(false);
    const skipEnterSubmitRef = useRef(false);

    const mentionData = useCallback(
      (query: string) => buildMentionSuggestions(branchOptions, query),
      [branchOptions],
    );

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
        {topAccessory ? (
          <div className="mb-2 flex min-w-0 flex-wrap items-center gap-1.5">
            {topAccessory}
          </div>
        ) : null}
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
                aria-label={inputPlaceholder}
                placeholder={inputPlaceholder}
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
                  // 滚动交给 MentionSuggestionVirtualList（ScrollArea + 虚拟列表）
                  suggestionsList:
                    "m-0 max-h-none list-none overflow-visible p-0 !divide-y-0 divide-transparent",
                  // 库默认给 li 加了 hover:bg-muted / data-[focused]:bg-primary/10；
                  // 分组标题与候选项同在一个 li 内，必须清掉外层背景，只高亮内层分支行
                  suggestionItem:
                    "relative block cursor-default border-0 bg-transparent p-0 text-xs text-foreground outline-hidden select-none hover:!bg-transparent data-[focused=true]:!bg-transparent data-[focused=true]:!text-foreground",
                  suggestionItemFocused:
                    "!bg-transparent hover:!bg-transparent data-[focused=true]:!bg-transparent data-[focused=true]:!text-foreground",
                }}
                customSuggestionsContainer={(children) => (
                  <MentionSuggestionVirtualList>{children}</MentionSuggestionVirtualList>
                )}
                disabled={isReplying}
              >
                <Mention<AgentMentionOption>
                  trigger="@"
                  data={mentionData}
                  appendSpaceOnAdd
                  maxSuggestions={Math.max(branchOptions.length, 1)}
                  // highlighter 与 textarea 叠字对齐：禁止 padding/inline-flex（会撑宽导致错位）
                  // 用同色 box-shadow 模拟 Badge 胶囊边距，不改文字度量
                  className="rounded-sm bg-secondary text-secondary-foreground shadow-[0_0_0_2px_var(--secondary)] box-decoration-clone"
                  renderSuggestion={(branch, _query, _highlighted, _index, focused) => {
                    const display = String(branch.display ?? branch.id);
                    return (
                      <div className="min-w-0">
                        {branch.showGroupHeader ? (
                          <div className="text-muted-foreground pointer-events-none px-1.5 pt-1.5 pb-1 text-[10px] font-medium tracking-wide">
                            {t(branch.isRemote ? "repo.remote" : "repo.local")}
                          </div>
                        ) : null}
                        <div
                          className={cn(
                            "flex min-w-0 items-center rounded-md px-1.5 py-1.5",
                            focused
                              ? "bg-accent text-accent-foreground"
                              : "hover:bg-accent/60",
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate">@{display}</span>
                        </div>
                      </div>
                    );
                  }}
                  renderEmpty={() => (
                    <span className="text-muted-foreground block px-2 py-1.5 text-xs">
                      {t("agent.noBranchMentions")}
                    </span>
                  )}
                />
              </MentionsInput>
            </ScrollArea>
          </div>
          {showThinkingToggle ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                "border-border absolute bottom-2 left-2 z-10 h-7 gap-1 px-2 text-[11px] shadow-none",
                thinkingEnabled
                  ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                  : "text-muted-foreground",
              )}
              aria-pressed={thinkingEnabled}
              aria-label={t("agent.deepThinkingToggle")}
              onClick={() => {
                onThinkingEnabledChange?.(!thinkingEnabled);
              }}
            >
              <Atom className="size-3.5" aria-hidden="true" />
              {t("agent.deepThinkingToggle")}
            </Button>
          ) : null}
          {isReplying ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon-sm"
                  className="absolute right-2 bottom-2 z-10 rounded-full"
                  aria-label={t("agent.stopReply")}
                  onClick={() => {
                    onStop?.();
                  }}
                >
                  {/* 实心方块：对齐常见「停止生成」视觉，不用描边图标 */}
                  <span
                    className="bg-primary-foreground block size-2.5 shrink-0"
                    aria-hidden="true"
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("agent.stopReply")}</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="submit"
                  size="icon-sm"
                  className="absolute right-2 bottom-2 z-10"
                  aria-label={t("agent.sendMessage")}
                  disabled={!canSubmit || draftPlainText.trim().length === 0}
                >
                  <ArrowUp aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("agent.sendMessage")}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </form>
    );
  },
);
