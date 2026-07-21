import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import {
  CheckCircle2,
  Download,
  Sparkles,
  HardDrive,
  Loader2,
  Moon,
  ScrollText,
  Settings,
  Sun,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { GitIdentityAvatar } from "@/components/git/GitIdentityAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { useHasAgentApiKey } from "@/hooks/useHasAgentApiKey";
import { gitService } from "@/services/git";
import {
  getAppInfo,
  getDiskSpace,
  type SystemAppInfo,
  type SystemDiskSpace,
} from "@/services/system/system.info";
import {
  checkAppUpdate,
  installPendingAppUpdate,
  type AppUpdateInfo,
} from "@/services/system/system.updater";
import { openMultiAgentWindow } from "@/services/window/multiAgentWindow";
import {
  selectLatestEntry,
  selectRepoEntries,
  useOpLogStore,
} from "@/store/useOpLogStore";
import { useLocaleStore } from "@/store/useLocaleStore";
import { useRepoStore } from "@/store/useRepoStore";
import { useSettingsDrawerStore } from "@/store/useSettingsDrawerStore";
import { useThemeStore } from "@/store/useThemeStore";
import { toUserMessage } from "@/types/error";

import { GitIdentity } from "@/types/git";

function formatBytes(bytes: number): string {
  if (bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exp;
  return `${value.toFixed(value >= 100 || exp === 0 ? 0 : 2)}${units[exp]}`;
}

/** 应用底部状态栏：版本 | 语言 / 主题 / 磁盘 / 操作日志 / Git 身份 / 多仓鲸灵 / 设置 */
export function StatusBar() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const isNewTab = pathname.startsWith("/tab/");
  const mode = useThemeStore((state) => state.mode);
  const toggleDayNight = useThemeStore((state) => state.toggleDayNight);
  const locale = useLocaleStore((state) => state.locale);
  const toggleZhEn = useLocaleStore((state) => state.toggleZhEn);
  const openDrawer = useSettingsDrawerStore((state) => state.openDrawer);
  const settingsOpen = useSettingsDrawerStore((state) => state.open);
  const hasApiKey = useHasAgentApiKey();

  async function handleOpenMultiAgent(): Promise<void> {
    if (!hasApiKey) {
      return;
    }
    try {
      await openMultiAgentWindow();
    } catch (error) {
      toast.error(toUserMessage(error) || t("multiAgent.openFailed"));
    }
  }

  const repoPath = useRepoStore((state) => state.repoPath);
  const repoIdentity = useRepoStore((state) => state.identity);

  const byRepo = useOpLogStore((state) => state.byRepo);
  const panelOpen = useOpLogStore((state) => state.panelOpen);
  const togglePanel = useOpLogStore((state) => state.togglePanel);

  const [appInfo, setAppInfo] = useState<SystemAppInfo | null>(null);
  const [disk, setDisk] = useState<SystemDiskSpace | null>(null);
  const [fallbackIdentity, setFallbackIdentity] = useState<GitIdentity | null>(null);
  const [updating, setUpdating] = useState(false);
  /** 仅有新版本时展示状态栏更新入口；无更新则隐藏 */
  const [availableUpdate, setAvailableUpdate] = useState<AppUpdateInfo | null>(null);

  async function handleAppUpdate(): Promise<void> {
    if (updating || !availableUpdate) {
      return;
    }
    setUpdating(true);
    const toastId = toast.loading(t("statusBar.updateDownloading"));
    try {
      // 再确认一次，避免长时间挂起后清单已变
      const info = await checkAppUpdate();
      if (!info) {
        setAvailableUpdate(null);
        toast.success(t("statusBar.updateUpToDate"), { id: toastId });
        return;
      }
      setAvailableUpdate(info);
      await installPendingAppUpdate();
    } catch (error) {
      toast.error(toUserMessage(error) || t("statusBar.updateFailed"), {
        id: toastId,
      });
    } finally {
      setUpdating(false);
    }
  }

  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const effectiveDark =
    mode === "dark" || (mode === "system" && prefersDark);

  const latestOp = useMemo(() => {
    return selectLatestEntry(selectRepoEntries(byRepo, repoPath));
  }, [byRepo, repoPath]);

  useEffect(() => {
    let cancelled = false;

    void getAppInfo()
      .then((info) => {
        if (!cancelled) {
          setAppInfo(info);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAppInfo({ name: "鲸灵Git", version: "1.0.1", arch: "", os: "" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // 启动后静默检查 GitHub Releases；无新版本不显示更新按钮
  useEffect(() => {
    if (import.meta.env.DEV) {
      return;
    }
    let cancelled = false;
    void checkAppUpdate()
      .then((info) => {
        if (!cancelled) {
          setAvailableUpdate(info);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAvailableUpdate(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void getDiskSpace(repoPath ?? undefined)
      .then((space) => {
        if (!cancelled) {
          setDisk(space);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDisk(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [repoPath]);

  useEffect(() => {
    if (repoIdentity) {
      setFallbackIdentity(null);
      return;
    }

    let cancelled = false;
    void gitService
      .getGlobalIdentity()
      .then((identity) => {
        if (!cancelled) {
          setFallbackIdentity(identity);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFallbackIdentity(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [repoIdentity]);

  const identity = repoIdentity ?? fallbackIdentity;
  const identityLabel =
    identity?.name || identity?.email
      ? t("statusBar.gitIdentity", {
          name: identity?.name ?? identity?.email ?? "",
        })
      : t("statusBar.gitIdentityEmpty");

  const versionLabel = useMemo(() => {
    if (!appInfo) {
      return "鲸灵Git";
    }
    const arch = appInfo.arch ? ` ${appInfo.arch}` : "";
    return `${appInfo.name} ${appInfo.version}${arch}`;
  }, [appInfo]);

  const diskUsedRatio = useMemo(() => {
    if (!disk || disk.totalBytes <= 0) {
      return 0;
    }
    const used = Math.max(0, disk.totalBytes - disk.availableBytes);
    return Math.min(1, used / disk.totalBytes);
  }, [disk]);

  const diskUsedPercent = Math.round(diskUsedRatio * 100);
  const diskNearFull = diskUsedRatio >= 0.9;

  const diskLabel = disk
    ? t("statusBar.diskAvailable", { size: formatBytes(disk.availableBytes) })
    : t("statusBar.diskUnknown");

  const opLogAria =
    latestOp?.status === "error"
      ? t("statusBar.opLogFailed")
      : latestOp?.status === "success"
        ? t("statusBar.opLogSuccess")
        : latestOp?.status === "running"
          ? t("statusBar.opLogRunning")
          : t("statusBar.opLog");

  return (
    <footer
      className="border-border bg-muted text-muted-foreground relative z-30 flex h-7 shrink-0 items-center justify-between gap-2 border-t px-2 text-[11px] select-none"
      role="contentinfo"
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span
          className="bg-primary text-primary-foreground inline-flex size-3.5 shrink-0 items-center justify-center rounded-sm text-[8px] font-bold"
          aria-hidden="true"
        >
          JL
        </span>
        <span className="truncate font-medium" title={versionLabel}>
          {versionLabel}
        </span>
        {availableUpdate ? (
          <span className="relative flex h-5 w-14 shrink-0 items-center justify-center">
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="absolute left-1/2 -translate-x-1/2 rounded-md focus-visible:ring-ring focus-visible:ring-1 focus-visible:outline-none disabled:opacity-60"
                  aria-label={t("statusBar.updateAvailable", {
                    version: availableUpdate.version,
                    current: availableUpdate.currentVersion,
                  })}
                  aria-busy={updating}
                  disabled={updating}
                  onClick={() => {
                    void handleAppUpdate();
                  }}
                >
                  <Badge className="group h-5 cursor-pointer gap-0 px-1.5 py-0 text-[10px] font-semibold transition-all duration-150 group-hover:gap-1">
                    {updating ? (
                      <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                    ) : (
                      <Download
                        className="size-3 transition-all duration-150 group-hover:w-0 group-hover:opacity-0"
                        aria-hidden="true"
                      />
                    )}
                    <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-150 group-hover:max-w-10 group-hover:opacity-100">
                      {t("statusBar.update")}
                    </span>
                  </Badge>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {t("statusBar.updateAvailable", {
                  version: availableUpdate.version,
                  current: availableUpdate.currentVersion,
                })}
              </TooltipContent>
            </Tooltip>
          </span>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground size-6 text-[10px] font-semibold tracking-tight"
              aria-label={
                locale === "zh-CN" ? t("statusBar.switchToEn") : t("statusBar.switchToZh")
              }
              onClick={toggleZhEn}
            >
              {locale === "zh-CN" ? t("statusBar.localeEn") : t("statusBar.localeZh")}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {locale === "zh-CN" ? t("statusBar.switchToEn") : t("statusBar.switchToZh")}
          </TooltipContent>
        </Tooltip>

        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground size-6 [&_svg]:size-3.5"
              aria-label={
                effectiveDark ? t("statusBar.switchToLight") : t("statusBar.switchToDark")
              }
              onClick={toggleDayNight}
            >
              {effectiveDark ? (
                <Moon aria-hidden="true" />
              ) : (
                <Sun aria-hidden="true" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {effectiveDark ? t("statusBar.switchToLight") : t("statusBar.switchToDark")}
          </TooltipContent>
        </Tooltip>

        {!isNewTab ? <><Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={cn(
                "hover:bg-accent hover:text-accent-foreground inline-flex h-6 cursor-default items-center gap-1 rounded-md px-1.5",
              )}
              aria-label={t("statusBar.diskSpace")}
            >
              <HardDrive className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="max-w-[5.5rem] truncate">{diskLabel}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            {disk ? (
              <div className="space-y-1.5 text-xs">
                <p className="font-medium">{t("statusBar.diskSpace")}</p>
                <p className="text-muted-foreground break-all">{disk.path}</p>
                {/* 进度条仅在悬停弹出层展示；轨道用 background 透明度，适配 Tooltip 反色浅底 */}
                <div
                  className="bg-background/25 relative h-2 w-full overflow-hidden rounded-full"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={diskUsedPercent}
                  aria-label={t("statusBar.diskUsedPercent", { percent: diskUsedPercent })}
                >
                  <div
                    className={cn(
                      "absolute inset-y-0 left-0 rounded-full",
                      diskNearFull ? "bg-destructive" : "bg-primary",
                    )}
                    style={{ width: `${diskUsedPercent}%` }}
                  />
                </div>
                <p>
                  {t("statusBar.diskUsedPercent", { percent: diskUsedPercent })}
                  {" · "}
                  {t("statusBar.diskAvailableFull", {
                    size: formatBytes(disk.availableBytes),
                  })}
                </p>
                <p>
                  {t("statusBar.diskTotal", { size: formatBytes(disk.totalBytes) })}
                </p>
              </div>
            ) : (
              t("statusBar.diskUnknown")
            )}
          </TooltipContent>
        </Tooltip>

        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "size-6 [&_svg]:size-3.5",
                panelOpen
                  ? "bg-accent text-accent-foreground hover:bg-accent/80"
                  : "text-muted-foreground",
              )}
              aria-label={opLogAria}
              aria-pressed={panelOpen}
              onClick={togglePanel}
            >
              {latestOp?.status === "running" ? (
                <Loader2 className="text-primary animate-spin" aria-hidden />
              ) : latestOp?.status === "success" ? (
                <CheckCircle2 className="text-primary" aria-hidden />
              ) : latestOp?.status === "error" ? (
                <XCircle className="text-destructive" aria-hidden />
              ) : (
                <ScrollText aria-hidden />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{opLogAria}</TooltipContent>
        </Tooltip>

        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <div className="flex items-center">
              <GitIdentityAvatar
                name={identity?.name ?? null}
                email={identity?.email ?? null}
                label={identityLabel}
                className="size-5 rounded-full text-[9px]"
              />
            </div>
          </TooltipTrigger>
        <TooltipContent>{identityLabel}</TooltipContent>
        </Tooltip></> : null}

        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground size-6 [&_svg]:size-3.5"
                aria-label={
                  hasApiKey ? t("statusBar.multiAgent") : t("common.aiApiKeyRequired")
                }
                disabled={!hasApiKey}
                onClick={() => {
                  void handleOpenMultiAgent();
                }}
              >
                <Sparkles aria-hidden="true" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {hasApiKey ? t("statusBar.multiAgent") : t("common.aiApiKeyRequired")}
          </TooltipContent>
        </Tooltip>

        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "size-6 [&_svg]:size-3.5",
                settingsOpen
                  ? "bg-accent text-accent-foreground hover:bg-accent/80"
                  : "text-muted-foreground",
              )}
              aria-label={t("statusBar.settings")}
              aria-pressed={settingsOpen}
              onClick={() => openDrawer()}
            >
              <Settings aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("statusBar.settings")}</TooltipContent>
        </Tooltip>
      </div>
    </footer>
  );
}
