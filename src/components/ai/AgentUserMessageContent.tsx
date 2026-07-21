import { cn } from "@/lib/utils";
import type { AgentMention } from "@/types/ai";
import { splitContentByMentions } from "@/utils/agentMessageMentions";

interface AgentUserMessageContentProps {
  content: string;
  mentions?: readonly AgentMention[];
  className?: string;
}

/** 用户气泡：把 @提及还原为与输入区一致的标签样式 */
export function AgentUserMessageContent({
  content,
  mentions,
  className,
}: AgentUserMessageContentProps) {
  const segments = splitContentByMentions(content, mentions);

  return (
    <span className={cn("whitespace-pre-wrap", className)}>
      {segments.map((segment, index) => {
        if (segment.type === "text") {
          return <span key={`t-${index}`}>{segment.value}</span>;
        }
        return (
          <span
            key={`m-${segment.mention.type}-${segment.mention.name}-${index}`}
            className={cn(
              "box-decoration-clone rounded-sm px-1 py-px font-medium",
              // 用户气泡为 primary：用前景色半透明底，贴近输入区徽章观感
              "bg-primary-foreground/20 text-primary-foreground",
              "shadow-[0_0_0_2px_color-mix(in_oklab,var(--primary-foreground)_20%,transparent)]",
            )}
          >
            {segment.mention.name}
          </span>
        );
      })}
    </span>
  );
}
