import {
  forwardRef,
  useCallback,
  useMemo,
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
import { SelectMenu } from "@/components/common/SelectMenu";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useHasAgentApiKey } from "@/hooks/useHasAgentApiKey";
import { cn } from "@/lib/utils";
import type { AgentMention, AgentMentionKind } from "@/types/ai";

/** 输入区最小高度（约 3 行） */
const COMPOSER_INPUT_MIN_CLASS = "min-h-[4.5rem]";
/** 输入区最大高度，超出后仅文本区滚动，底部控件不跟着滚 */
const COMPOSER_INPUT_MAX_CLASS = "max-h-[10.5rem]";

export interface AgentMentionOption extends Record<string, unknown> {
  id: string;
  display: string;
  kind: AgentMentionKind;
  /** 分支：是否远端；插件/项目可省略 */
  isRemote?: boolean;
  /** 是否在该项上方渲染分组标题（过滤后各组首条） */
  showGroupHeader?: boolean;
}

function compareMentionDisplay(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function mentionGroupOrder(option: AgentMentionOption): number {
  if (option.kind === "plugin") {
    return 0;
  }
  if (option.kind === "skill") {
    return 1;
  }
  if (option.kind === "project") {
    return 2;
  }
  return option.isRemote ? 4 : 3;
}

function mentionGroupLabelKey(option: {
  kind?: AgentMentionKind;
  isRemote?: boolean;
}): string {
  if (option.kind === "plugin") {
    return "agent.mentionGroupPlugins";
  }
  if (option.kind === "skill") {
    return "agent.mentionGroupSkills";
  }
  if (option.kind === "project") {
    return "multiAgent.mentionGroupProjects";
  }
  return option.isRemote ? "repo.remote" : "repo.local";
}

/** 插件 → 技能 → 项目 → 本地分支 → 远端分支；组内按名称；各组首条带分组标题 */
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

  const sorted = [...matched].sort((left, right) => {
    const groupDiff = mentionGroupOrder(left) - mentionGroupOrder(right);
    if (groupDiff !== 0) {
      return groupDiff;
    }
    return compareMentionDisplay(left.display, right.display);
  });

  let lastGroupKey = "";
  return sorted.map((option) => {
    const groupKey = `${option.kind}:${option.isRemote === true ? "remote" : "local"}`;
    const showGroupHeader = groupKey !== lastGroupKey;
    lastGroupKey = groupKey;
    return { ...option, showGroupHeader };
  });
}

/** 两侧各两个 NBSP ≈ 加大左右间隙（与 highlighter 同步，避免 padding 错位） */
const MENTION_DISPLAY_PAD = "\u00A0\u00A0";

function padMentionDisplay(_id: string | number, display?: string | null): string {
  return `${MENTION_DISPLAY_PAD}${display ?? ""}${MENTION_DISPLAY_PAD}`;
}

/** 去掉 displayTransform 注入的 NBSP，避免写入会话 mention.name */
function stripMentionDisplayPadding(display: string): string {
  return display.replace(/^\u00A0+|\u00A0+$/g, "");
}

function toAgentMention(
  mentionId: string,
  display: string,
  option: AgentMentionOption | undefined,
): AgentMention {
  const kind = option?.kind ?? "branch";
  const name = stripMentionDisplayPadding(display);
  // 技能与插件共用持久化 shape（type=plugin），便于历史会话兼容
  if (kind === "plugin" || kind === "skill") {
    const id = mentionId.startsWith("plugin:")
      ? mentionId.slice("plugin:".length)
      : mentionId;
    return { type: "plugin", id, name };
  }
  if (kind === "project") {
    const id = mentionId.startsWith("project:")
      ? mentionId.slice("project:".length)
      : mentionId;
    return { type: "project", id, name };
  }
  return { type: "branch", name: mentionId };
}

interface AgentComposerProps {
  draftMarkup: string;
  draftPlainText: string;
  /** @ 候选：单仓为插件/技能/分支；多仓为插件/技能/项目等 */
  branchOptions: readonly AgentMentionOption[];
  /**
   * 是否启用 @ 提及。
   * 单仓 / 多仓鲸灵均为 true；纯文本场景传 false。
   */
  enableMentions?: boolean;
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
    mentions: readonly AgentMention[];
  }) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  /** 生成中点击停止（Abort 当前流式请求） */
  onStop?: () => void;
  /** 是否展示左下角「深度思考」开关（鲸灵） */
  showThinkingToggle?: boolean;
  thinkingEnabled?: boolean;
  onThinkingEnabledChange?: (enabled: boolean) => void;
  /** 是否展示模型选择（鲸灵；选项来自官方 /models） */
  showModelPicker?: boolean;
  modelOptions?: readonly { value: string; label: string; shortLabel?: string }[];
  modelId?: string;
  modelLoading?: boolean;
  onModelIdChange?: (modelId: string) => void;
}

const COMPOSER_INPUT_CLASS = cn(
  "placeholder:text-muted-foreground relative z-[1] block w-full min-w-0 resize-none overflow-hidden rounded-none border-0 bg-transparent px-3 py-2 text-xs leading-5 break-words whitespace-pre-wrap shadow-none outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50",
  COMPOSER_INPUT_MIN_CLASS,
);

/** Agent 输入区：随内容增高至上限后仅文本区滚动；底部控件固定 */
export const AgentComposer = forwardRef<HTMLFormElement, AgentComposerProps>(
  function AgentComposer(
    {
      draftMarkup,
      draftPlainText,
      branchOptions,
      enableMentions = true,
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
      showModelPicker = false,
      modelOptions = [],
      modelId = "",
      modelLoading = false,
      onModelIdChange,
    },
    ref,
  ) {
    const { t } = useTranslation();
    const hasApiKey = useHasAgentApiKey();
    const inputLocked = !hasApiKey;
    const effectiveCanSubmit = canSubmit && hasApiKey;
    const inputPlaceholder = inputLocked
      ? t("common.aiApiKeyRequired")
      : (placeholder ?? t("agent.inputPlaceholder"));
    const inputScrollRef = useRef<HTMLDivElement>(null);
    // enableMentions=false 时走纯文本（关闭 @）
    const mentionsOn = enableMentions;
    // 中文等 IME：选词回车时部分环境 isComposing 已是 false，需组合态标记 + keyCode 229
    const isComposingRef = useRef(false);
    const skipEnterSubmitRef = useRef(false);

    const mentionData = useCallback(
      (query: string) => buildMentionSuggestions(branchOptions, query),
      [branchOptions],
    );
    const optionsById = useMemo(() => {
      const map = new Map<string, AgentMentionOption>();
      for (const option of branchOptions) {
        map.set(option.id, option);
      }
      return map;
    }, [branchOptions]);
    const hasPluginOrProject = branchOptions.some(
      (option) =>
        option.kind === "plugin" ||
        option.kind === "skill" ||
        option.kind === "project",
    );
    const emptyMentionsKey = hasPluginOrProject
      ? "agent.noMentions"
      : "agent.noBranchMentions";
    const suggestionsA11yKey = hasPluginOrProject
      ? "agent.mentionsAria"
      : "agent.branchMentions";

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
      if (!effectiveCanSubmit || draftPlainText.trim().length === 0) {
        return;
      }
      event.currentTarget.form?.requestSubmit();
    }

    /** textarea 自身 overflow:hidden（配合 autoResize），滚轮交给文本滚动容器 */
    function handleInputWheel(
      event: WheelEvent<HTMLInputElement | HTMLTextAreaElement>,
    ): void {
      const viewport = inputScrollRef.current;
      if (!viewport) {
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

    function syncPlainTextareaHeight(element: HTMLTextAreaElement): void {
      element.style.height = "auto";
      element.style.height = `${element.scrollHeight}px`;
    }

    return (
      <form
        ref={ref}
        className="bg-background absolute inset-x-3 bottom-3 z-10 rounded-md"
        onSubmit={(event) => {
          if (!effectiveCanSubmit || draftPlainText.trim().length === 0) {
            event.preventDefault();
            return;
          }
          onSubmit(event);
        }}
      >
        {topAccessory ? (
          <div className="mb-2 flex min-w-0 flex-wrap items-center gap-1.5">
            {topAccessory}
          </div>
        ) : null}
        {/* 文本区可增高滚动；底部工具栏固定，互不遮挡 */}
        <div
          className={cn(
            "border-input dark:bg-input/30 flex w-full flex-col overflow-hidden rounded-md border bg-transparent shadow-none",
            "focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]",
          )}
        >
          <div
            ref={inputScrollRef}
            className={cn(
              "w-full min-w-0 overflow-x-hidden overflow-y-auto",
              COMPOSER_INPUT_MIN_CLASS,
              COMPOSER_INPUT_MAX_CLASS,
            )}
          >
            {mentionsOn ? (
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
                    mentions: mentions.map((mention) => {
                      const id = String(mention.id);
                      const display = String(mention.display ?? mention.id);
                      return toAgentMention(id, display, optionsById.get(id));
                    }),
                  });
                }}
                onKeyDown={handleInputKeyDown}
                onCompositionStart={handleCompositionStart}
                onCompositionEnd={handleCompositionEnd}
                onWheel={handleInputWheel}
                aria-label={inputPlaceholder}
                placeholder={inputPlaceholder}
                a11ySuggestionsListLabel={t(suggestionsA11yKey)}
                // 贴输入框左缘展开；库默认 portal+fixed，勿再写 absolute/bottom-full
                anchorMode="left"
                suggestionsPlacement="above"
                autoResize
                className="block w-full min-w-0"
                style={{ width: "100%" }}
                classNames={{
                  control: cn(
                    "relative block w-full min-w-0 rounded-md border-0 bg-transparent p-0 shadow-none",
                    COMPOSER_INPUT_MIN_CLASS,
                  ),
                  input: COMPOSER_INPUT_CLASS,
                  // 必须 absolute，与 textarea 叠字对齐
                  highlighter: cn(
                    "pointer-events-none absolute inset-0 box-border w-full min-w-0 overflow-hidden px-3 py-2 text-xs leading-5 break-words whitespace-pre-wrap",
                    COMPOSER_INPUT_MIN_CLASS,
                  ),
                  suggestions:
                    "bg-popover text-popover-foreground z-[100] mb-1 min-w-0 overflow-hidden rounded-md border p-0 shadow-md",
                  suggestionsList:
                    "m-0 max-h-none list-none overflow-visible p-0 !divide-y-0 divide-transparent",
                  suggestionItem:
                    "relative block cursor-default border-0 bg-transparent p-0 text-xs text-foreground outline-hidden select-none hover:!bg-transparent data-[focused=true]:!bg-transparent data-[focused=true]:!text-foreground",
                  suggestionItemFocused:
                    "!bg-transparent hover:!bg-transparent data-[focused=true]:!bg-transparent data-[focused=true]:!text-foreground",
                }}
                customSuggestionsContainer={(children) => (
                  <MentionSuggestionVirtualList>{children}</MentionSuggestionVirtualList>
                )}
                disabled={inputLocked}
              >
                <Mention<AgentMentionOption>
                  trigger="@"
                  data={mentionData}
                  appendSpaceOnAdd
                  maxSuggestions={Math.max(branchOptions.length, 1)}
                  // 左右间隙：displayTransform NBSP；单层 2px shadow 补上下缝，勿多层（会重影）
                  displayTransform={padMentionDisplay}
                  // 强制方圆角（覆盖库 rounded-md）：徽章 --radius-sm
                  className="box-decoration-clone !rounded-sm bg-primary/12 font-medium text-primary shadow-[0_0_0_2px_color-mix(in_oklab,var(--primary)_12%,transparent)]"
                  renderSuggestion={(option, _query, _highlighted, _index, focused) => {
                    const display = String(option.display ?? option.id);
                    const kind =
                      typeof option.kind === "string"
                        ? (option.kind as AgentMentionKind)
                        : undefined;
                    const isRemote = option.isRemote === true;
                    return (
                      <div className="min-w-0">
                        {option.showGroupHeader ? (
                          <div className="text-muted-foreground pointer-events-none px-1.5 pt-1.5 pb-1 text-[10px] font-medium tracking-wide">
                            {t(mentionGroupLabelKey({ kind, isRemote }))}
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
                      {t(emptyMentionsKey)}
                    </span>
                  )}
                />
              </MentionsInput>
            ) : (
              <textarea
                ref={(element) => {
                  if (typeof inputRef === "function") {
                    inputRef(element);
                  } else if (inputRef) {
                    inputRef.current = element;
                  }
                  if (element) {
                    syncPlainTextareaHeight(element);
                  }
                }}
                value={draftPlainText}
                onChange={(event) => {
                  const value = event.target.value;
                  syncPlainTextareaHeight(event.currentTarget);
                  onDraftChange({
                    markup: value,
                    plainText: value,
                    mentions: [],
                  });
                }}
                onKeyDown={handleInputKeyDown}
                onCompositionStart={handleCompositionStart}
                onCompositionEnd={handleCompositionEnd}
                onWheel={handleInputWheel}
                rows={1}
                aria-label={inputPlaceholder}
                placeholder={inputPlaceholder}
                disabled={inputLocked}
                className={COMPOSER_INPUT_CLASS}
              />
            )}
          </div>

          <div className="flex shrink-0 items-center justify-between gap-2 px-2 pt-1 pb-2">
            <div className="flex min-w-0 items-center gap-1.5">
              {showThinkingToggle ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className={cn(
                    // 与 ChangesPanel 等 h-6 工具按钮一致：走 Button 的 rounded-md
                    "border px-2 shadow-none transition-colors",
                    thinkingEnabled
                      ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                      : "border-border bg-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                  aria-pressed={thinkingEnabled}
                  aria-label={t("agent.deepThinkingToggle")}
                  disabled={inputLocked}
                  onClick={() => {
                    onThinkingEnabledChange?.(!thinkingEnabled);
                  }}
                >
                  <Atom className="size-3.5" aria-hidden="true" />
                  {t("agent.deepThinkingToggle")}
                </Button>
              ) : null}
              {showModelPicker && modelOptions.length > 0 ? (
                <SelectMenu
                  value={modelId}
                  options={modelOptions}
                  onChange={(value) => onModelIdChange?.(value)}
                  ariaLabel={t("agent.modelPickerAria")}
                  disabled={inputLocked || modelLoading}
                  size="sm"
                  // 与「深度思考」按钮同为 h-6：触发器内置 data-[size=sm]:h-8 优先级更高，需用同一 data 变体覆盖
                  triggerClassName="data-[size=sm]:h-6 w-auto min-w-0 max-w-[12.5rem] shrink"
                />
              ) : null}
            </div>
            {isReplying ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon-sm"
                    className="rounded-full"
                    aria-label={t("agent.stopReply")}
                    onClick={() => {
                      onStop?.();
                    }}
                  >
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
                  <span className="inline-flex">
                    <Button
                      type="submit"
                      size="icon-sm"
                      aria-label={
                        inputLocked
                          ? t("common.aiApiKeyRequired")
                          : t("agent.sendMessage")
                      }
                      disabled={
                        !effectiveCanSubmit || draftPlainText.trim().length === 0
                      }
                    >
                      <ArrowUp aria-hidden="true" />
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {inputLocked
                    ? t("common.aiApiKeyRequired")
                    : t("agent.sendMessage")}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </form>
    );
  },
);
