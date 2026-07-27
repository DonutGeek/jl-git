import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { GitCompareArrows } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isRecord } from "@/types/error";

export interface CompareBranchesAction {
  type: "compareBranches";
  base: string;
  target: string;
}

interface ParsedAgentMessage {
  content: string;
  action: CompareBranchesAction | null;
}

interface AgentRichMessageProps extends ParsedAgentMessage {
  onCompareBranches: (action: CompareBranchesAction) => void;
  /** 流式输出时把光标挂在最后一个块级元素末尾，避免掉到正文下方单独一行 */
  trailingCursor?: boolean;
}

/** 挂在末段 p / 末条 li / 末级标题后的流式光标 */
const TRAILING_CURSOR_CLASS =
  "[&>p:last-child]:after:bg-foreground [&>p:last-child]:after:ml-0.5 [&>p:last-child]:after:inline-block [&>p:last-child]:after:h-3 [&>p:last-child]:after:w-0.5 [&>p:last-child]:after:animate-pulse [&>p:last-child]:after:align-middle [&>p:last-child]:after:content-[''] " +
  "[&>ul:last-child>li:last-child]:after:bg-foreground [&>ul:last-child>li:last-child]:after:ml-0.5 [&>ul:last-child>li:last-child]:after:inline-block [&>ul:last-child>li:last-child]:after:h-3 [&>ul:last-child>li:last-child]:after:w-0.5 [&>ul:last-child>li:last-child]:after:animate-pulse [&>ul:last-child>li:last-child]:after:align-middle [&>ul:last-child>li:last-child]:after:content-[''] " +
  "[&>ol:last-child>li:last-child]:after:bg-foreground [&>ol:last-child>li:last-child]:after:ml-0.5 [&>ol:last-child>li:last-child]:after:inline-block [&>ol:last-child>li:last-child]:after:h-3 [&>ol:last-child>li:last-child]:after:w-0.5 [&>ol:last-child>li:last-child]:after:animate-pulse [&>ol:last-child>li:last-child]:after:align-middle [&>ol:last-child>li:last-child]:after:content-[''] " +
  "[&>h1:last-child]:after:bg-foreground [&>h1:last-child]:after:ml-0.5 [&>h1:last-child]:after:inline-block [&>h1:last-child]:after:h-3 [&>h1:last-child]:after:w-0.5 [&>h1:last-child]:after:animate-pulse [&>h1:last-child]:after:align-middle [&>h1:last-child]:after:content-[''] " +
  "[&>h2:last-child]:after:bg-foreground [&>h2:last-child]:after:ml-0.5 [&>h2:last-child]:after:inline-block [&>h2:last-child]:after:h-3 [&>h2:last-child]:after:w-0.5 [&>h2:last-child]:after:animate-pulse [&>h2:last-child]:after:align-middle [&>h2:last-child]:after:content-[''] " +
  "[&>h3:last-child]:after:bg-foreground [&>h3:last-child]:after:ml-0.5 [&>h3:last-child]:after:inline-block [&>h3:last-child]:after:h-3 [&>h3:last-child]:after:w-0.5 [&>h3:last-child]:after:animate-pulse [&>h3:last-child]:after:align-middle [&>h3:last-child]:after:content-['']";

const ACTION_MARKER_PATTERN = /<!--\s*jlgit-action:(\{[\s\S]*?\})\s*-->\s*$/;

/** 从模型文本末尾提取只读动作，未识别内容仍按普通 Markdown 展示。 */
export function parseAgentMessage(content: string): ParsedAgentMessage {
  const matched = content.match(ACTION_MARKER_PATTERN);
  if (!matched) {
    return { content, action: null };
  }
  const action = parseCompareBranchesAction(matched[1]);
  return {
    content: content.slice(0, matched.index).trimEnd(),
    action,
  };
}

export function AgentRichMessage({
  content,
  action,
  onCompareBranches,
  trailingCursor = false,
}: AgentRichMessageProps) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        "agent-markdown text-xs leading-relaxed",
        // 「## 项目经历」后的第一个 ### 不要顶部分隔带，避免标题下多出一条灰块
        "[&>h2+h3]:mt-1.5 [&>h2+h3]:border-t-0 [&>h2+h3]:pt-0",
        "[&>h1+h3]:mt-1.5 [&>h1+h3]:border-t-0 [&>h1+h3]:pt-0",
        trailingCursor && TRAILING_CURSOR_CLASS,
      )}
    >
      {content ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href, children }) => {
              const safeHref = toSafeExternalHref(href);
              return safeHref ? (
                <a
                  href={safeHref}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline underline-offset-2"
                >
                  {children}
                </a>
              ) : (
                <span>{children}</span>
              );
            },
            code: ({ children, className }) => (
              <code
                className={
                  className
                    ? "block overflow-x-auto rounded bg-background/60 p-2"
                    : "rounded bg-background/60 px-1 py-0.5"
                }
              >
                {children}
              </code>
            ),
            h1: ({ children }) => (
              <h1 className="text-foreground mt-3 mb-2 border-border/60 border-b pb-1 text-sm font-semibold first:mt-0">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="text-foreground mt-3 mb-1.5 border-border/60 border-b pb-1 text-sm font-semibold first:mt-0">
                {children}
              </h2>
            ),
            // 项目标题：仅「第二个及以后的 ###」加顶部分隔，用于分清多项目边界
            h3: ({ children }) => (
              <h3 className="text-foreground border-border/50 mt-4 mb-1.5 border-t pt-3 text-[13px] font-semibold">
                {children}
              </h3>
            ),
            h4: ({ children }) => (
              <h4 className="text-foreground mt-2 mb-1 text-xs font-semibold first:mt-0">
                {children}
              </h4>
            ),
            strong: ({ children }) => (
              <strong className="text-foreground font-semibold">{children}</strong>
            ),
            ul: ({ children }) => <ul className="my-1.5 list-disc space-y-0.5 pl-4">{children}</ul>,
            ol: ({ children }) => (
              <ol className="my-1.5 list-decimal space-y-0.5 pl-4">{children}</ol>
            ),
            li: ({ children }) => <li className="my-0">{children}</li>,
            p: ({ children }) => <p className="my-1">{children}</p>,
            hr: () => <hr className="border-border/60 my-3" />,
          }}
        >
          {content}
        </ReactMarkdown>
      ) : null}
      {action ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="mt-2 h-7 gap-1.5 text-xs"
          onClick={() => onCompareBranches(action)}
        >
          <GitCompareArrows className="size-3.5" aria-hidden="true" />
          {t("agent.compareBranches", { base: action.base, target: action.target })}
        </Button>
      ) : null}
    </div>
  );
}

function parseCompareBranchesAction(raw: string): CompareBranchesAction | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!isCompareBranchesAction(value)) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function isCompareBranchesAction(value: unknown): value is CompareBranchesAction {
  if (!isRecord(value)) {
    return false;
  }
  return (
    value.type === "compareBranches" &&
    typeof value.base === "string" &&
    value.base.length > 0 &&
    typeof value.target === "string" &&
    value.target.length > 0
  );
}

function toSafeExternalHref(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}
