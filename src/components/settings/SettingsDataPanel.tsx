import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Database,
  FolderOpen,
  HardDriveDownload,
  PanelsTopLeft,
  RotateCcw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { SettingsPreferenceGroup } from "@/components/settings/SettingsPreferenceGroup";
import { SettingsPreferenceRow } from "@/components/settings/SettingsPreferenceRow";
import { SettingsTip } from "@/components/settings/SettingsTip";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { useAgentChatStore } from "@/store/useAgentChatStore";
import { useMultiAgentStore } from "@/store/useMultiAgentStore";
import { useOpenTabsStore } from "@/store/useOpenTabsStore";
import { useProjectStore } from "@/store/useProjectStore";

import {
  clearModule,
  exportBackup,
  getPaths,
  importBackup,
  reveal,
  type AppDataClearModule,
  type AppDataPaths,
} from "@/services/data/data.service";
import { copyToClipboard } from "@/utils/clipboard";

import { toUserMessage } from "@/types/error";

/** 清理 UI 目标：可映射多个底层 module（仅缓存，不含账号/密钥等配置） */
type ClearUiId = "jingling_chats" | "open_tabs" | "all_cache";

interface ClearTarget {
  id: ClearUiId;
  modules: AppDataClearModule[];
  title: string;
  description: string;
  confirm: string;
  icon: ReactNode;
  destructive?: boolean;
}

/** 设置 → 数据：路径、缓存清理、备份导入导出 */
export function SettingsDataPanel() {
  const { t } = useTranslation();
  const [paths, setPaths] = useState<AppDataPaths | null>(null);
  const [pathsError, setPathsError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingClear, setPendingClear] = useState<ClearTarget | null>(null);
  const [importConfirmOpen, setImportConfirmOpen] = useState(false);
  const [factoryResetOpen, setFactoryResetOpen] = useState(false);

  const clearAgentChats = useAgentChatStore((state) => state.clearAllConversations);
  const clearMultiAgentChats = useMultiAgentStore((state) => state.clearAllConversations);
  const resetToFreshStartup = useOpenTabsStore((state) => state.resetToFreshStartup);
  const loadProjects = useProjectStore((state) => state.loadProjects);
  const loadRecent = useProjectStore((state) => state.loadRecent);
  const loadWorkspaces = useProjectStore((state) => state.loadWorkspaces);

  useEffect(() => {
    let active = true;
    void getPaths()
      .then((next) => {
        if (active) {
          setPaths(next);
          setPathsError(null);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setPathsError(toUserMessage(error) || t("settings.dataPathsFailed"));
        }
      });
    return () => {
      active = false;
    };
  }, [t]);

  const clearTargets: ClearTarget[] = [
    {
      id: "jingling_chats",
      modules: ["agent_chats", "multi_agent_chats"],
      title: t("settings.dataClearAgentChats"),
      description: t("settings.dataClearAgentChatsHint"),
      confirm: t("settings.dataClearAgentChatsConfirm"),
      icon: <Sparkles />,
    },
    {
      id: "open_tabs",
      modules: ["open_tabs"],
      title: t("settings.dataClearOpenTabs"),
      description: t("settings.dataClearOpenTabsHint"),
      confirm: t("settings.dataClearOpenTabsConfirm"),
      icon: <PanelsTopLeft />,
    },
    {
      id: "all_cache",
      modules: ["agent_chats", "multi_agent_chats", "open_tabs"],
      title: t("settings.dataClearAll"),
      description: t("settings.dataClearAllHint"),
      confirm: t("settings.dataClearAllConfirm"),
      icon: <Trash2 />,
      destructive: true,
    },
  ];

  async function handleReveal(target: "dir" | "database"): Promise<void> {
    try {
      await reveal(target);
    } catch (error) {
      toast.error(toUserMessage(error) || t("settings.dataRevealFailed"));
    }
  }

  async function runClear(target: ClearTarget): Promise<void> {
    setBusy(true);
    try {
      for (const module of target.modules) {
        await clearModule(module);
      }
      if (target.modules.includes("agent_chats")) {
        clearAgentChats();
      }
      if (target.modules.includes("multi_agent_chats")) {
        clearMultiAgentChats();
      }
      toast.success(t("settings.dataClearDone"));
    } catch (error) {
      toast.error(toUserMessage(error) || t("settings.dataClearFailed"));
    } finally {
      setBusy(false);
      setPendingClear(null);
    }
  }

  async function handleExport(): Promise<void> {
    setBusy(true);
    try {
      const path = await exportBackup();
      if (path) {
        toast.success(t("settings.dataExportDone"));
      }
    } catch (error) {
      toast.error(toUserMessage(error) || t("settings.dataExportFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleImportConfirmed(): Promise<void> {
    setImportConfirmOpen(false);
    setBusy(true);
    try {
      const result = await importBackup();
      if (!result) {
        return;
      }
      clearAgentChats();
      clearMultiAgentChats();
      toast.success(t("settings.dataImportDone"));
      if (result.requiresRestart) {
        toast.message(t("settings.dataImportRestartHint"));
      }
    } catch (error) {
      toast.error(toUserMessage(error) || t("settings.dataImportFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleFactoryResetConfirmed(): Promise<void> {
    setFactoryResetOpen(false);
    setBusy(true);
    try {
      await clearModule("factory_reset");
      clearAgentChats();
      clearMultiAgentChats();
      resetToFreshStartup();
      await Promise.all([loadProjects(), loadRecent(), loadWorkspaces()]);
      toast.success(t("settings.dataFactoryResetDone"));
      toast.message(t("settings.dataFactoryResetRestartHint"));
      window.setTimeout(() => {
        window.location.assign("/");
      }, 400);
    } catch (error) {
      toast.error(toUserMessage(error) || t("settings.dataFactoryResetFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-w-0 space-y-8">
      <section className="min-w-0 space-y-3">
        <div className="flex items-start gap-2.5">
          <div className="text-muted-foreground mt-0.5 [&_svg]:size-4" aria-hidden>
            <Database />
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <h3 className="text-sm font-medium">{t("settings.dataStorageTitle")}</h3>
            <SettingsTip ariaLabel={t("settings.dataStorageTipAria")}>
              {t("settings.dataStorageHint")}
            </SettingsTip>
          </div>
        </div>
        <div className="min-w-0 space-y-3 px-6">
          {pathsError ? <p className="text-destructive text-xs">{pathsError}</p> : null}
          <SettingsPreferenceGroup>
            <PathRow
              icon={<FolderOpen />}
              label={t("settings.dataAppDir")}
              value={paths?.appDataDir}
              onReveal={() => {
                void handleReveal("dir");
              }}
              revealLabel={t("settings.dataRevealDir")}
            />
            <PathRow
              icon={<Database />}
              label={t("settings.dataDatabase")}
              value={paths?.databasePath}
              onReveal={() => {
                void handleReveal("database");
              }}
              revealLabel={t("settings.dataRevealDatabase")}
            />
          </SettingsPreferenceGroup>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-start gap-2.5">
          <div className="text-muted-foreground mt-0.5 [&_svg]:size-4" aria-hidden>
            <Trash2 />
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <h3 className="text-sm font-medium">{t("settings.dataClearTitle")}</h3>
            <SettingsTip ariaLabel={t("settings.dataClearTipAria")}>
              {t("settings.dataClearHint")}
            </SettingsTip>
          </div>
        </div>
        <div className="px-6">
          <SettingsPreferenceGroup>
            {clearTargets.map((target) => (
              <Item key={target.id} size="sm" className="rounded-none">
                <ItemMedia variant="icon">{target.icon}</ItemMedia>
                <ItemContent>
                  <ItemTitle className="text-foreground text-xs">{target.title}</ItemTitle>
                  <ItemDescription className="text-xs">{target.description}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button
                    type="button"
                    variant={target.destructive ? "destructive" : "outline"}
                    size="sm"
                    className="h-7 shrink-0 px-2.5 text-xs shadow-none"
                    disabled={busy}
                    onClick={() => setPendingClear(target)}
                  >
                    {t("settings.dataClearAction")}
                  </Button>
                </ItemActions>
              </Item>
            ))}
          </SettingsPreferenceGroup>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-start gap-2.5">
          <div className="text-muted-foreground mt-0.5 [&_svg]:size-4" aria-hidden>
            <HardDriveDownload />
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <h3 className="text-sm font-medium">{t("settings.dataBackupTitle")}</h3>
            <SettingsTip ariaLabel={t("settings.dataBackupTipAria")}>
              {t("settings.dataBackupHint")}
            </SettingsTip>
          </div>
        </div>
        <div className="px-6">
          <SettingsPreferenceGroup>
            <SettingsPreferenceRow
              label={t("settings.dataExport")}
              description={t("settings.dataExportHint")}
            >
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 shrink-0 px-2.5 text-xs shadow-none"
                disabled={busy}
                onClick={() => {
                  void handleExport();
                }}
              >
                {t("settings.dataExportAction")}
              </Button>
            </SettingsPreferenceRow>
            <SettingsPreferenceRow
              label={t("settings.dataImport")}
              description={t("settings.dataImportHint")}
            >
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 shrink-0 px-2.5 text-xs shadow-none"
                disabled={busy}
                onClick={() => setImportConfirmOpen(true)}
              >
                {t("settings.dataImportAction")}
              </Button>
            </SettingsPreferenceRow>
          </SettingsPreferenceGroup>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-start gap-2.5">
          <div className="text-muted-foreground mt-0.5 [&_svg]:size-4" aria-hidden>
            <RotateCcw />
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <h3 className="text-sm font-medium">{t("settings.dataFactoryResetTitle")}</h3>
            <SettingsTip ariaLabel={t("settings.dataFactoryResetTipAria")}>
              {t("settings.dataFactoryResetHint")}
            </SettingsTip>
          </div>
        </div>
        <div className="px-6">
          <SettingsPreferenceGroup>
            <Item size="sm" className="rounded-none">
              <ItemMedia variant="icon">
                <RotateCcw />
              </ItemMedia>
              <ItemContent>
                <ItemTitle className="text-foreground text-xs">
                  {t("settings.dataFactoryResetAction")}
                </ItemTitle>
                <ItemDescription className="text-xs">
                  {t("settings.dataFactoryResetHint")}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="h-7 shrink-0 px-2.5 text-xs shadow-none"
                  disabled={busy}
                  onClick={() => setFactoryResetOpen(true)}
                >
                  {t("settings.dataFactoryResetButton")}
                </Button>
              </ItemActions>
            </Item>
          </SettingsPreferenceGroup>
        </div>
      </section>

      <Dialog
        open={pendingClear != null}
        onOpenChange={(open) => {
          if (!open) setPendingClear(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {pendingClear?.destructive
                ? t("settings.dataClearAllTitle")
                : t("settings.dataClearConfirmTitle")}
            </DialogTitle>
            <DialogDescription>{pendingClear?.confirm}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingClear(null)}>
              {t("agent.editCancel")}
            </Button>
            <Button
              type="button"
              variant={pendingClear?.destructive ? "destructive" : "default"}
              disabled={busy || !pendingClear}
              onClick={() => {
                if (pendingClear) void runClear(pendingClear);
              }}
            >
              {t("settings.dataClearAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importConfirmOpen} onOpenChange={setImportConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("settings.dataImportConfirmTitle")}</DialogTitle>
            <DialogDescription>{t("settings.dataImportConfirm")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setImportConfirmOpen(false)}>
              {t("agent.editCancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => {
                void handleImportConfirmed();
              }}
            >
              {t("settings.dataImport")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={factoryResetOpen} onOpenChange={setFactoryResetOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("settings.dataFactoryResetConfirmTitle")}</DialogTitle>
            <DialogDescription>{t("settings.dataFactoryResetConfirm")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setFactoryResetOpen(false)}>
              {t("agent.editCancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => {
                void handleFactoryResetConfirmed();
              }}
            >
              {t("settings.dataFactoryResetAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface PathRowProps {
  icon: ReactNode;
  label: string;
  value: string | undefined;
  onReveal: () => void;
  revealLabel: string;
}

/**
 * 路径前省略：按容器 clientWidth 二分截断，左侧 …、右侧保留尾部。
 */
function useStartEllipsisPath(path: string | undefined): {
  display: string;
  bindRef: (node: HTMLElement | null) => void;
} {
  const [display, setDisplay] = useState(path ?? "");
  const pathRef = useRef(path ?? "");
  const nodeRef = useRef<HTMLElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);

  pathRef.current = path ?? "";

  const recompute = useCallback(() => {
    const node = nodeRef.current;
    const full = pathRef.current;
    if (!node || !full) {
      setDisplay(full);
      return;
    }

    const available = Math.floor(node.clientWidth);
    if (available < 8) {
      setDisplay(full);
      return;
    }

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) {
      setDisplay(full);
      return;
    }
    const style = getComputedStyle(node);
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;

    if (context.measureText(full).width <= available) {
      setDisplay(full);
      return;
    }

    const ellipsis = "…";
    let low = 0;
    let high = full.length;
    while (low < high) {
      const mid = low + Math.ceil((high - low) / 2);
      const candidate = `${ellipsis}${full.slice(full.length - mid)}`;
      if (context.measureText(candidate).width <= available) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    setDisplay(low > 0 ? `${ellipsis}${full.slice(full.length - low)}` : ellipsis);
  }, []);

  const bindRef = useCallback(
    (node: HTMLElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      nodeRef.current = node;
      if (!node) {
        return;
      }
      // 等一帧再量，避免抽屉刚打开时 clientWidth 仍为 0
      window.requestAnimationFrame(() => {
        recompute();
      });
      const observer = new ResizeObserver(() => {
        recompute();
      });
      observer.observe(node);
      observerRef.current = observer;
    },
    [recompute],
  );

  useEffect(() => {
    recompute();
  }, [path, recompute]);

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, []);

  return { display, bindRef };
}

function PathRow({ icon, label, value, onReveal, revealLabel }: PathRowProps) {
  const { t } = useTranslation();
  const { display, bindRef } = useStartEllipsisPath(value);
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  async function handleCopyPath(): Promise<void> {
    if (!value) {
      return;
    }
    try {
      await copyToClipboard(value);
      setCopied(true);
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
      copiedTimerRef.current = window.setTimeout(() => {
        setCopied(false);
      }, 1500);
      toast.success(t("settings.dataPathCopied"));
    } catch (error) {
      toast.error(toUserMessage(error) || t("settings.dataCopyFailed"));
    }
  }

  return (
    <Item size="sm" className="min-w-0 rounded-none">
      <ItemMedia variant="icon">{icon}</ItemMedia>
      <ItemContent className="min-w-0 overflow-hidden">
        <ItemTitle className="text-foreground text-xs">{label}</ItemTitle>
        {value ? (
          <Tooltip open={copied ? true : undefined} delayDuration={300}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={t("settings.dataCopyPath")}
                className={cn(
                  "text-muted-foreground group/path block w-full min-w-0 cursor-pointer border-0 bg-transparent p-0 text-left",
                )}
                onClick={() => {
                  void handleCopyPath();
                }}
              >
                <span
                  ref={bindRef}
                  className="block w-full min-w-0 overflow-hidden font-mono text-[11px] leading-5 whitespace-nowrap underline-offset-2 group-hover/path:underline"
                >
                  {display}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-sm break-all font-mono">
              {copied ? t("settings.dataPathCopied") : value}
            </TooltipContent>
          </Tooltip>
        ) : (
          <p className="text-muted-foreground font-mono text-[11px] leading-5">…</p>
        )}
      </ItemContent>
      <ItemActions>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-7 shrink-0 shadow-none"
              disabled={!value}
              aria-label={revealLabel}
              onClick={onReveal}
            >
              <FolderOpen className="size-3.5" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{revealLabel}</TooltipContent>
        </Tooltip>
      </ItemActions>
    </Item>
  );
}
