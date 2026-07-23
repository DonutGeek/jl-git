import { useState } from "react";
import { AtSign, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AgentPluginList } from "@/components/ai/AgentPluginList";
import { EmptyState } from "@/components/common/EmptyState";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AgentPluginDefinition } from "@/plugins/agent/registry";
import { cn } from "@/lib/utils";

export type AgentCatalogTab = "plugins" | "skills";

interface AgentCatalogPanelProps {
  plugins: readonly AgentPluginDefinition[];
  skills: readonly AgentPluginDefinition[];
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
  skills,
  onSelectPlugin,
  onTryPlugin,
  onUninstallPlugin,
  variant = "gallery",
  className,
  showHint = true,
}: AgentCatalogPanelProps) {
  const { t } = useTranslation();
  // 首期技能有内容、插件为空：默认落在技能
  const [tab, setTab] = useState<AgentCatalogTab>(
    skills.length > 0 && plugins.length === 0 ? "skills" : "plugins",
  );

  const hint =
    tab === "plugins"
      ? t("agent.catalogPluginsHint")
      : t("agent.catalogSkillsHint");

  const pluginsEmpty = tab === "plugins" && plugins.length === 0;
  const skillsEmpty = tab === "skills" && skills.length === 0;
  const showCenteredEmpty = pluginsEmpty || skillsEmpty;

  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-col",
        variant === "gallery" ? "flex-1" : "shrink-0",
        className,
      )}
    >
      <div className="shrink-0 space-y-2">
        <Tabs
          value={tab}
          className="block"
          onValueChange={(value) => {
            if (value === "plugins" || value === "skills") {
              setTab(value);
            }
          }}
        >
          <TabsList
            aria-label={t("agent.catalogSwitchAria")}
            className={variant === "gallery" ? "h-8" : "!h-7 p-0.5"}
          >
            <TabsTrigger
              value="plugins"
              className={
                variant === "gallery"
                  ? "min-w-20 text-xs"
                  : "min-w-16 px-2 text-xs"
              }
            >
              {t("agent.catalogTabPlugins")}
            </TabsTrigger>
            <TabsTrigger
              value="skills"
              className={
                variant === "gallery"
                  ? "min-w-20 text-xs"
                  : "min-w-16 px-2 text-xs"
              }
            >
              {t("agent.catalogTabSkills")}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {showHint ? (
          <p
            className={cn(
              "text-muted-foreground",
              variant === "gallery"
                ? "text-xs leading-relaxed"
                : "text-[11px] leading-4",
            )}
          >
            {hint}
          </p>
        ) : null}
      </div>

      <div
        className={cn(
          "min-h-0",
          variant === "gallery" && "flex-1",
          variant === "gallery" ? "mt-3" : "mt-1.5 h-52",
          showCenteredEmpty &&
            (variant === "gallery"
              ? "flex min-h-56 items-center justify-center"
              : "flex items-center justify-center"),
        )}
      >
        {tab === "plugins" ? (
          pluginsEmpty ? (
            <EmptyState
              compact
              className="h-full py-0"
              icon={<AtSign />}
              title={t("agent.catalogPluginsEmptyTitle")}
              description={t("agent.catalogPluginsEmptyDescription")}
            />
          ) : (
            <ScrollArea className="h-full w-full [&_[data-slot=scroll-area-viewport]>div]:!block [&_[data-slot=scroll-area-viewport]>div]:!min-w-0 [&_[data-slot=scroll-area-viewport]>div]:w-full">
              <AgentPluginList
                variant={variant}
                plugins={plugins}
                onSelect={onSelectPlugin}
                onTry={onTryPlugin}
                onUninstall={onUninstallPlugin}
              />
            </ScrollArea>
          )
        ) : skillsEmpty ? (
          <EmptyState
            compact
            className="h-full py-0"
            icon={<Sparkles />}
            title={t("agent.catalogSkillsEmptyTitle")}
            description={t("agent.catalogSkillsEmptyDescription")}
          />
        ) : (
          <ScrollArea className="h-full w-full [&_[data-slot=scroll-area-viewport]>div]:!block [&_[data-slot=scroll-area-viewport]>div]:!min-w-0 [&_[data-slot=scroll-area-viewport]>div]:w-full">
            <AgentPluginList
              variant={variant}
              plugins={skills}
              onSelect={onSelectPlugin}
              onTry={onTryPlugin}
              onUninstall={onUninstallPlugin}
            />
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
