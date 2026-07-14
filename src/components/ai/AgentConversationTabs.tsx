import { Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { AgentConversation } from "@/types/ai";

interface AgentConversationTabsProps {
  conversations: readonly AgentConversation[];
  activeConversationId: string | undefined;
  onSelect: (conversationId: string) => void;
  onCreate: () => void;
  onDelete: (conversationId: string) => void;
}

/** 会话 Tab 栏：切换 / 新建 / 删除 */
export function AgentConversationTabs({
  conversations,
  activeConversationId,
  onSelect,
  onCreate,
  onDelete,
}: AgentConversationTabsProps) {
  const { t } = useTranslation();

  return (
    <header className="flex h-10 shrink-0 items-center gap-1 px-3">
      <ScrollArea className="h-10 min-w-0 flex-1">
        <div className="flex h-10 w-max items-center gap-1 pr-1">
          {conversations.map((conversation) => (
            <div
              key={conversation.id}
              className={cn(
                "group relative max-w-32 shrink-0 rounded-md transition-colors",
                conversation.id === activeConversationId ? "bg-muted" : "hover:bg-accent",
              )}
            >
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-full bg-transparent px-2 text-xs transition-[padding] hover:bg-transparent group-hover:pr-7 group-focus-within:pr-7"
                aria-pressed={conversation.id === activeConversationId}
                onClick={() => onSelect(conversation.id)}
              >
                <span className="truncate">
                  {conversation.title || t("agent.newConversation")}
                </span>
              </Button>
              <button
                type="button"
                className={cn(
                  "text-muted-foreground focus-visible:ring-ring absolute top-0 right-0 flex size-7 items-center justify-center bg-transparent p-0 opacity-0 outline-none transition-[opacity,color,transform] focus-visible:ring-1 group-hover:opacity-100 group-focus-within:opacity-100",
                  conversations.length > 1
                    ? "cursor-pointer hover:text-foreground hover:scale-110"
                    : "cursor-not-allowed group-hover:opacity-35 group-focus-within:opacity-35",
                )}
                aria-label={t("agent.deleteConversation")}
                disabled={conversations.length <= 1}
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete(conversation.id);
                }}
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground size-7 shrink-0"
            aria-label={t("agent.createConversation")}
            onClick={onCreate}
          >
            <Plus aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("agent.createConversation")}</TooltipContent>
      </Tooltip>
    </header>
  );
}
