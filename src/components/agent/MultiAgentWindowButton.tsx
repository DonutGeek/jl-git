import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useHasAgentApiKey } from "@/hooks/useHasAgentApiKey";
import { cn } from "@/lib/utils";
import { openMultiAgentWindow } from "@/services/window/multiAgentWindow";
import { toUserMessage } from "@/types/error";

interface MultiAgentWindowButtonProps {
  label: string;
  className?: string;
  iconClassName?: string;
  tooltipSide?: "top" | "right" | "bottom" | "left";
}

/** 打开或聚焦多仓鲸灵单例窗口。 */
export function MultiAgentWindowButton({
  label,
  className,
  iconClassName,
  tooltipSide = "top",
}: MultiAgentWindowButtonProps) {
  const { t } = useTranslation();
  const hasApiKey = useHasAgentApiKey();
  const accessibleLabel = hasApiKey
    ? label
    : t("common.aiApiKeyRequired");

  async function handleOpen(): Promise<void> {
    if (!hasApiKey) {
      return;
    }
    try {
      await openMultiAgentWindow();
    } catch (error) {
      toast.error(toUserMessage(error) || t("multiAgent.openFailed"));
    }
  }

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn("text-muted-foreground", className)}
            aria-label={accessibleLabel}
            disabled={!hasApiKey}
            onClick={() => {
              void handleOpen();
            }}
          >
            <Sparkles className={iconClassName} aria-hidden="true" />
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent side={tooltipSide}>{accessibleLabel}</TooltipContent>
    </Tooltip>
  );
}
