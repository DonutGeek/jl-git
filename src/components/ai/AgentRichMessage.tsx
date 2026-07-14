import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { GitCompareArrows } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
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
}

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

export function AgentRichMessage({ content, action, onCompareBranches }: AgentRichMessageProps) {
  const { t } = useTranslation();
  return (
    <div className="agent-markdown text-xs leading-relaxed">
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
              <code className={className ? "block overflow-x-auto rounded bg-background/60 p-2" : "rounded bg-background/60 px-1 py-0.5"}>
                {children}
              </code>
            ),
            ul: ({ children }) => <ul className="my-1 list-disc pl-4">{children}</ul>,
            ol: ({ children }) => <ol className="my-1 list-decimal pl-4">{children}</ol>,
            li: ({ children }) => <li className="my-0">{children}</li>,
            p: ({ children }) => <p className="my-0">{children}</p>,
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
