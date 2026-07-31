import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import {
  CheckCircle2,
  Download,
  HardDrive,
  Moon,
  ScrollText,
  Settings,
  Sun,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { GitIdentityAvatar } from "@/components/git/GitIdentityAvatar";
import { MultiAgentWindowButton } from "@/components/agent/MultiAgentWindowButton";
import { DiskSpaceTooltip } from "@/components/layout/DiskSpaceTooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { useAppUpdateChecker } from "@/hooks/useAppUpdateChecker";
import { gitService } from "@/services/git";
import {
  getAppInfo,
  getDiskSpace,
  listDiskVolumes,
  type SystemAppInfo,
  type SystemDiskSpace,
} from "@/services/system/system.info";
import { checkAppUpdate, installPendingAppUpdate } from "@/services/system/system.updater";
import { selectLatestEntry, selectRepoEntries, useOpLogStore } from "@/store/useOpLogStore";
import { useAppUpdateStore } from "@/store/useAppUpdateStore";
import { useLocaleStore } from "@/store/useLocaleStore";
import { useRepoStore } from "@/store/useRepoStore";
import { useSettingsDrawerStore } from "@/store/useSettingsDrawerStore";
import { useThemeStore } from "@/store/useThemeStore";
import { toUserMessage } from "@/types/error";

import type { GitIdentity } from "@/types/git";

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
  useAppUpdateChecker();

  const repoPath = useRepoStore((state) => state.repoPath);
  const repoIdentity = useRepoStore((state) => state.identity);

  const byRepo = useOpLogStore((state) => state.byRepo);
  const panelOpen = useOpLogStore((state) => state.panelOpen);
  const togglePanel = useOpLogStore((state) => state.togglePanel);

  const [appInfo, setAppInfo] = useState<SystemAppInfo | null>(null);
  const [disk, setDisk] = useState<SystemDiskSpace | null>(null);
  const [diskVolumes, setDiskVolumes] = useState<SystemDiskSpace[]>([]);
  const [fallbackIdentity, setFallbackIdentity] = useState<GitIdentity | null>(null);
  const [updating, setUpdating] = useState(false);
  /** 与设置「关于」共享，关于页检查到更新后状态栏同步显示 */
  const availableUpdate = useAppUpdateStore((state) => state.availableUpdate);
  const setAvailableUpdate = useAppUpdateStore((state) => state.setAvailableUpdate);

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
    typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const effectiveDark = mode === "dark" || (mode === "system" && prefersDark);

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
          setAppInfo({ name: t("common.productName"), version: "1.0.1", arch: "", os: "" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([
      getDiskSpace(repoPath ?? undefined).catch(() => null),
      listDiskVolumes().catch(() => [] as SystemDiskSpace[]),
    ]).then(([space, volumes]) => {
      if (cancelled) {
        return;
      }
      setDisk(space);
      setDiskVolumes(volumes);
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
    const name = t("common.productName");
    if (!appInfo) {
      return name;
    }
    const arch = appInfo.arch ? ` ${appInfo.arch}` : "";
    return `${name} ${appInfo.version}${arch}`;
  }, [appInfo, t]);

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
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="rounded-md focus-visible:ring-ring shrink-0 focus-visible:ring-1 focus-visible:outline-none disabled:opacity-60"
                aria-label={
                  updating
                    ? t("statusBar.updateInProgress")
                    : t("statusBar.updateAvailable", {
                        version: availableUpdate.version,
                        current: availableUpdate.currentVersion,
                      })
                }
                aria-busy={updating}
                disabled={updating}
                onClick={() => {
                  void handleAppUpdate();
                }}
              >
                <Badge
                  className={cn(
                    "group h-5 gap-0 px-1.5 py-0 text-[10px] font-semibold transition-all duration-150",
                    updating ? "cursor-wait gap-1" : "cursor-pointer group-hover:gap-1",
                  )}
                >
                  {updating ? (
                    <Spinner className="size-3" />
                  ) : (
                    <Download
                      className="size-3 transition-all duration-150 group-hover:w-0 group-hover:opacity-0"
                      aria-hidden="true"
                    />
                  )}
                  <span
                    className={cn(
                      "overflow-hidden whitespace-nowrap transition-all duration-150",
                      updating
                        ? "max-w-24 opacity-100"
                        : "max-w-0 opacity-0 group-hover:max-w-10 group-hover:opacity-100",
                    )}
                  >
                    {updating ? t("statusBar.updateInProgress") : t("statusBar.update")}
                  </span>
                </Badge>
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {updating
                ? t("statusBar.updateInProgress")
                : t("statusBar.updateAvailable", {
                    version: availableUpdate.version,
                    current: availableUpdate.currentVersion,
                  })}
            </TooltipContent>
          </Tooltip>
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
              {effectiveDark ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {effectiveDark ? t("statusBar.switchToLight") : t("statusBar.switchToDark")}
          </TooltipContent>
        </Tooltip>

        {!isNewTab ? (
          <>
            <Tooltip delayDuration={300}>
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
              <TooltipContent
                side="top"
                className={cn("p-3", diskVolumes.length > 1 ? "max-w-sm" : "max-w-xs")}
              >
                <DiskSpaceTooltip current={disk} volumes={diskVolumes} />
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
                    <Spinner className="text-primary size-3.5" />
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
                    className="size-5 text-[9px]"
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>{identityLabel}</TooltipContent>
            </Tooltip>
          </>
        ) : null}

        <MultiAgentWindowButton
          label={t("statusBar.multiAgent")}
          className="size-6"
          iconClassName="size-3.5"
        />

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
