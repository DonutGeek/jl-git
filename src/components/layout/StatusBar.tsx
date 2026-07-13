import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2,
  HardDrive,
  Moon,
  ScrollText,
  Sun,
  XCircle,
} from "lucide-react";

import { GitIdentityAvatar } from "@/components/git/GitIdentityAvatar";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { gitService } from "@/services/git";
import {
  getAppInfo,
  getDiskSpace,
  type SystemAppInfo,
  type SystemDiskSpace,
} from "@/services/system/system.info";
import {
  selectLatestEntry,
  selectRepoEntries,
  useOpLogStore,
} from "@/store/useOpLogStore";
import { useLocaleStore } from "@/store/useLocaleStore";
import { useRepoStore } from "@/store/useRepoStore";
import { useThemeStore } from "@/store/useThemeStore";

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

/** 应用底部状态栏：版本 | 主题 / 磁盘 / Git 身份 / 操作日志 */
export function StatusBar() {
  const { t } = useTranslation();
  const mode = useThemeStore((state) => state.mode);
  const toggleDayNight = useThemeStore((state) => state.toggleDayNight);
  const locale = useLocaleStore((state) => state.locale);
  const toggleZhEn = useLocaleStore((state) => state.toggleZhEn);

  const repoPath = useRepoStore((state) => state.repoPath);
  const repoIdentity = useRepoStore((state) => state.identity);

  const byRepo = useOpLogStore((state) => state.byRepo);
  const panelOpen = useOpLogStore((state) => state.panelOpen);
  const togglePanel = useOpLogStore((state) => state.togglePanel);

  const [appInfo, setAppInfo] = useState<SystemAppInfo | null>(null);
  const [disk, setDisk] = useState<SystemDiskSpace | null>(null);
  const [fallbackIdentity, setFallbackIdentity] = useState<GitIdentity | null>(null);

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
          setAppInfo({ name: "JLGit", version: "0.1.0", arch: "" });
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
      return "JLGit";
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
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
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
          <TooltipContent side="top" className="max-w-xs">
            {disk ? (
              <div className="space-y-1.5 text-xs">
                <p className="font-medium">{t("statusBar.diskSpace")}</p>
                <p className="text-muted-foreground break-all">{disk.path}</p>
                {/* 进度条仅在悬停弹出层展示 */}
                <div
                  className="bg-border relative h-2 w-full overflow-hidden rounded-full"
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
            <div className="flex items-center px-0.5">
              <GitIdentityAvatar
                name={identity?.name ?? null}
                email={identity?.email ?? null}
                label={identityLabel}
                className="size-5 rounded-full text-[9px]"
              />
            </div>
          </TooltipTrigger>
          <TooltipContent>{identityLabel}</TooltipContent>
        </Tooltip>

        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "size-6 [&_svg]:size-3.5",
                panelOpen && "bg-accent text-accent-foreground",
              )}
              aria-label={opLogAria}
              aria-pressed={panelOpen}
              onClick={togglePanel}
            >
              {latestOp?.status === "success" ? (
                <CheckCircle2 className="text-primary" aria-hidden />
              ) : latestOp?.status === "error" ? (
                <XCircle className="text-destructive" aria-hidden />
              ) : (
                <ScrollText className="text-muted-foreground" aria-hidden />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{opLogAria}</TooltipContent>
        </Tooltip>
      </div>
    </footer>
  );
}
