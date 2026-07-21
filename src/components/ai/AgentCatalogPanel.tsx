import { useState } from "react";
import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AgentPluginList } from "@/components/ai/AgentPluginList";
import { EmptyState } from "@/components/common/EmptyState";
import type { AgentPluginDefinition } from "@/plugins/agent/registry";
import { cn } from "@/lib/utils";

export type AgentCatalogTab = "plugins" | "skills";

interface AgentCatalogPanelProps {
  plugins: readonly AgentPluginDefinition[];
  onSelectPlugin: (plugin: AgentPluginDefinition) => void;
  onTryPlugin?: (plugin: AgentPluginDefinition) => void;
  onUninstallPlugin?: (plugin: AgentPluginDefinition) => void;
  /** gallery：多仓主区；compact：单仓 Dialog */
  variant?: "gallery" | "compact";
  className?: string;
  /** 是否展示标题区说明（多仓主区用） */
  showHint?: boolean;
}

/** 鲸灵扩展目录：插件 / 技能分段切换（单仓 Dialog、多仓主区共用） */
export function AgentCatalogPanel({
  plugins,
  onSelectPlugin,
  onTryPlugin,
  onUninstallPlugin,
  variant = "gallery",
  className,
  showHint = true,
}: AgentCatalogPanelProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<AgentCatalogTab>("plugins");

  const hint =
    tab === "plugins"
      ? t("agent.catalogPluginsHint")
      : t("agent.catalogSkillsHint");

  return (
    <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col", className)}>
      <div
        className={cn(
          "shrink-0",
          variant === "gallery" ? "space-y-2" : "space-y-2 pb-1",
        )}
      >
        <div
          className="bg-muted inline-flex rounded-lg p-0.5"
          role="tablist"
          aria-label={t("agent.catalogSwitchAria")}
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "plugins"}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors",
              "outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tab === "plugins"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setTab("plugins")}
          >
            {t("agent.catalogTabPlugins")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "skills"}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors",
              "outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tab === "skills"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setTab("skills")}
          >
            {t("agent.catalogTabSkills")}
          </button>
        </div>
        {showHint ? (
          <p className="text-muted-foreground text-xs">{hint}</p>
        ) : null}
      </div>

      <div className={cn("min-h-0 flex-1", variant === "gallery" ? "mt-3" : "mt-2")}>
        {tab === "plugins" ? (
          <AgentPluginList
            variant={variant}
            plugins={plugins}
            onSelect={onSelectPlugin}
            onTry={onTryPlugin}
            onUninstall={onUninstallPlugin}
          />
        ) : (
          <EmptyState
            compact
            className={variant === "gallery" ? "min-h-44 py-10" : "py-6"}
            icon={<Sparkles />}
            title={t("agent.catalogSkillsEmptyTitle")}
            description={t("agent.catalogSkillsEmptyDescription")}
          />
        )}
      </div>
    </div>
  );
}
