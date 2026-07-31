import { useRef, useState } from "react";
import { MoreHorizontal, Play, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { AppDialogContent } from "@/components/common/AppDialogContent";
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AGENT_SKILLS, type AgentPluginDefinition } from "@/plugins/agent/registry";
import { cn } from "@/lib/utils";

interface AgentPluginListProps {
  onSelect: (plugin: AgentPluginDefinition) => void;
  /** 「立即试用」：切空会话并预填 @插件 + 示例语 */
  onTry?: (plugin: AgentPluginDefinition) => void;
  /** 确认卸载后回调（由宿主持久化并刷新列表） */
  onUninstall?: (plugin: AgentPluginDefinition) => void;
  /** 可展示的插件（已过滤卸载项）；默认全部内置 */
  plugins?: readonly AgentPluginDefinition[];
  /** 列表外层额外 class */
  className?: string;
  /**
   * compact：窄列表（Dialog）
   * gallery：主内容区双列卡片（多仓鲸灵右侧）
   */
  variant?: "compact" | "gallery";
}

interface PluginMoreMenuProps {
  onTry: () => void;
  onUninstall: () => void;
}

function OverflowDescription({ children, className }: { children: string; className: string }) {
  const textRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <Tooltip
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setOpen(false);
          return;
        }
        const element = textRef.current;
        if (!element) {
          setOpen(false);
          return;
        }
        // 单行 truncate 看横溢；多行 line-clamp 看纵溢
        const overflowX = element.scrollWidth > element.clientWidth + 1;
        const overflowY = element.scrollHeight > element.clientHeight + 1;
        setOpen(overflowX || overflowY);
      }}
    >
      <TooltipTrigger asChild>
        <span ref={textRef} className={className}>
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="w-max max-w-72 text-left text-wrap break-words">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

/** 三点菜单：与会话列表同构，仅点击打开；悬停行时显示按钮 */
function PluginMoreMenu({ onTry, onUninstall }: PluginMoreMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "text-muted-foreground size-6 shrink-0 rounded-md hover:bg-transparent",
                "opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100",
                open && "opacity-100",
              )}
              aria-label={t("agent.pluginMore")}
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <MoreHorizontal className="size-3.5" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">{t("agent.pluginMore")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        className="min-w-36"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <DropdownMenuItem
          onSelect={() => {
            onTry();
          }}
        >
          <Play aria-hidden="true" />
          {t("agent.pluginTryNow")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => {
            onUninstall();
          }}
        >
          <Trash2 aria-hidden="true" />
          {t("agent.pluginUninstall")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** 鲸灵内置插件列表（单仓 Dialog / 多仓主区共用） */
export function AgentPluginList({
  onSelect,
  onTry,
  onUninstall,
  plugins = AGENT_SKILLS,
  className,
  variant = "compact",
}: AgentPluginListProps) {
  const { t } = useTranslation();
  const [uninstallTarget, setUninstallTarget] = useState<AgentPluginDefinition | null>(null);

  function handleTry(plugin: AgentPluginDefinition): void {
    if (onTry) {
      onTry(plugin);
      return;
    }
    onSelect(plugin);
  }

  function confirmUninstall(): void {
    if (!uninstallTarget || !onUninstall) {
      setUninstallTarget(null);
      return;
    }
    onUninstall(uninstallTarget);
    setUninstallTarget(null);
  }

  const showMenu = Boolean(onTry || onUninstall);

  return (
    <>
      {variant === "gallery" ? (
        <ul
          className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2", className)}
          aria-label={t("agent.pluginsAria")}
        >
          {plugins.map((plugin) => {
            const Icon = plugin.icon;
            const description = t(plugin.descriptionKey);
            return (
              <li key={plugin.id}>
                <div
                  className={cn(
                    "border-border bg-card hover:bg-accent/50 group/row flex w-full items-start gap-2 rounded-xl border p-3.5",
                    "transition-colors",
                  )}
                >
                  <button
                    type="button"
                    className={cn(
                      "flex min-w-0 flex-1 items-start gap-3 text-left",
                      "outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    )}
                    aria-label={t(plugin.titleKey)}
                    onClick={() => onSelect(plugin)}
                  >
                    <span
                      className="bg-muted text-foreground flex size-10 shrink-0 items-center justify-center rounded-lg"
                      aria-hidden="true"
                    >
                      <Icon className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="block truncate text-sm font-medium">
                        {t(plugin.titleKey)}
                      </span>
                      <OverflowDescription className="text-muted-foreground block truncate text-xs leading-relaxed">
                        {description}
                      </OverflowDescription>
                    </span>
                  </button>
                  {showMenu ? (
                    <PluginMoreMenu
                      onTry={() => handleTry(plugin)}
                      onUninstall={() => setUninstallTarget(plugin)}
                    />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul
          className={cn("grid w-full min-w-0 grid-cols-1 gap-2.5 pr-1 sm:grid-cols-2", className)}
          aria-label={t("agent.pluginsAria")}
        >
          {plugins.map((plugin) => {
            const Icon = plugin.icon;
            const description = t(plugin.descriptionKey);
            return (
              <li key={plugin.id} className="min-w-0">
                <div className="border-border bg-card hover:bg-accent/40 group/row flex w-full min-w-0 items-start gap-1 rounded-lg border p-3 transition-colors">
                  <button
                    type="button"
                    className={cn(
                      "flex min-w-0 flex-1 items-start gap-3 rounded-md text-left",
                      "outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    )}
                    aria-label={t(plugin.titleKey)}
                    onClick={() => onSelect(plugin)}
                  >
                    <span
                      className="bg-muted text-foreground flex size-10 shrink-0 items-center justify-center rounded-lg"
                      aria-hidden="true"
                    >
                      <Icon className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="text-foreground block truncate text-sm font-medium leading-5">
                        {t(plugin.titleKey)}
                      </span>
                      <OverflowDescription className="text-muted-foreground block truncate text-xs leading-5">
                        {description}
                      </OverflowDescription>
                    </span>
                  </button>
                  {showMenu ? (
                    <div className="shrink-0">
                      <PluginMoreMenu
                        onTry={() => handleTry(plugin)}
                        onUninstall={() => setUninstallTarget(plugin)}
                      />
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={uninstallTarget != null}
        onOpenChange={(open) => {
          if (!open) {
            setUninstallTarget(null);
          }
        }}
      >
        <AppDialogContent size="sm">
          <DialogHeader>
            <DialogTitle>{t("agent.pluginUninstallTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            {t("agent.pluginUninstallDescription", {
              name: uninstallTarget ? t(uninstallTarget.titleKey) : "",
            })}
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setUninstallTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button type="button" variant="destructive" onClick={confirmUninstall}>
              {t("agent.pluginUninstallConfirm")}
            </Button>
          </DialogFooter>
        </AppDialogContent>
      </Dialog>
    </>
  );
}
