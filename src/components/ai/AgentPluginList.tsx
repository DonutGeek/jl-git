import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, Play, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  compact?: boolean;
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
        setOpen(Boolean(element && element.scrollWidth > element.clientWidth + 1));
      }}
    >
      <TooltipTrigger asChild>
        <span ref={textRef} className={className}>
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="w-max max-w-64 text-left text-wrap break-words">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

/** 三点菜单：点击或悬停打开；含立即试用 / 卸载 */
function PluginMoreMenu({ onTry, onUninstall, compact = false }: PluginMoreMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current != null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  function clearCloseTimer(): void {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function scheduleClose(): void {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, 160);
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "text-muted-foreground shrink-0 rounded-full",
                compact ? "size-7" : "size-8",
              )}
              aria-label={t("agent.pluginMore")}
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              onPointerEnter={() => {
                clearCloseTimer();
                setOpen(true);
              }}
              onPointerLeave={scheduleClose}
            >
              <MoreHorizontal className={compact ? "size-3.5" : "size-4"} aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">{t("agent.pluginMore")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        className="min-w-36"
        onCloseAutoFocus={(event) => event.preventDefault()}
        onPointerEnter={clearCloseTimer}
        onPointerLeave={scheduleClose}
      >
        <DropdownMenuItem
          onSelect={() => {
            onTry();
          }}
        >
          <Play className="size-3.5" aria-hidden="true" />
          {t("agent.pluginTryNow")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => {
            onUninstall();
          }}
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
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
                    "border-border bg-card hover:bg-accent/50 group flex w-full items-start gap-2 rounded-xl border p-3.5",
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
          className={cn("grid w-full min-w-0 grid-cols-2 gap-2 pr-2", className)}
          aria-label={t("agent.pluginsAria")}
        >
          {plugins.map((plugin) => {
            const Icon = plugin.icon;
            const description = t(plugin.descriptionKey);
            return (
              <li key={plugin.id} className="min-w-0">
                <div className="border-border bg-card hover:bg-accent/40 group/row flex w-full min-w-0 items-center gap-0.5 rounded-md border px-1.5 py-1 transition-colors">
                  <button
                    type="button"
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-2 rounded-sm px-0.5 py-0.5 text-left",
                      "outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    )}
                    aria-label={t(plugin.titleKey)}
                    onClick={() => onSelect(plugin)}
                  >
                    <span
                      className="bg-muted text-foreground flex size-8 shrink-0 items-center justify-center rounded-md"
                      aria-hidden="true"
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-foreground block truncate text-xs font-medium leading-4">
                        {t(plugin.titleKey)}
                      </span>
                      <OverflowDescription className="text-muted-foreground block truncate text-[11px] leading-4">
                        {description}
                      </OverflowDescription>
                    </span>
                  </button>
                  {showMenu ? (
                    <div className="shrink-0">
                      <PluginMoreMenu
                        compact
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
        <DialogContent className="sm:max-w-sm">
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
        </DialogContent>
      </Dialog>
    </>
  );
}
