import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { getTauriVersion } from "@tauri-apps/api/app";
import { getAllWebviewWindows } from "@tauri-apps/api/webviewWindow";
import { Activity, AppWindow, Layers, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import appIconUrl from "@/assets/app-icon.png";
import { SettingsTip } from "@/components/settings/SettingsTip";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { getGitVersion } from "@/services/git/git.version";
import {
  getAppInfo,
  getRuntimeStats,
  type SystemAppInfo,
  type SystemRuntimeStats,
} from "@/services/system/system.info";
import {
  checkAppUpdate,
  installPendingAppUpdate,
  type AppUpdateInfo,
} from "@/services/system/system.updater";
import { useOpenTabsStore } from "@/store/useOpenTabsStore";
import { toUserMessage } from "@/types/error";

const RUNTIME_POLL_MS = 1000;
/** CPU 迷你折线保留点数 */
const CPU_HISTORY_LEN = 36;
/** 内存环按此上限映射填充（2GB） */
const MEMORY_GAUGE_CAP_BYTES = 2 * 1024 * 1024 * 1024;
/** 会话条参考上限 */
const TABS_BAR_CAP = 20;
const WINDOWS_BAR_CAP = 8;

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "0B";
  }
  if (bytes < 1024) {
    return `${bytes}B`;
  }
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)}${units[unitIndex]}`;
}

function formatUptime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return "—";
  }
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  if (days > 0) {
    return `${days}d ${hh}:${mm}:${ss}`;
  }
  return `${hh}:${mm}:${ss}`;
}

function formatOsLabel(os: string): string {
  switch (os) {
    case "macos":
      return "macOS";
    case "windows":
      return "Windows";
    case "linux":
      return "Linux";
    default:
      return os || "—";
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

interface RingGaugeProps {
  /** 0–1 */
  progress: number;
  label: string;
  value: string;
  /** Tailwind 色 token，如 text-chart-1 */
  toneClassName: string;
  unavailable?: boolean;
}

/** SVG 环形进度：用 stroke 绘制，颜色走 Design Tokens */
function RingGauge({
  progress,
  label,
  value,
  toneClassName,
  unavailable = false,
}: RingGaugeProps) {
  const size = 112;
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamp01(progress));

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
          aria-hidden="true"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            className="stroke-muted"
            strokeWidth={stroke}
          />
          {!unavailable ? (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              className={cn("transition-[stroke-dashoffset] duration-500", toneClassName)}
              stroke="currentColor"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
            />
          ) : null}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center px-2 text-center">
          <span className="text-foreground font-mono text-sm font-medium tabular-nums">
            {value}
          </span>
        </div>
      </div>
      <span className="text-muted-foreground text-xs">{label}</span>
    </div>
  );
}

interface SparklineProps {
  values: readonly number[];
  className?: string;
}

/** 迷你折线：值域按样本 max 归一 */
function Sparkline({ values, className }: SparklineProps) {
  const path = useMemo(() => {
    if (values.length < 2) {
      return "";
    }
    const max = Math.max(...values, 1);
    const width = 120;
    const height = 36;
    const step = width / (values.length - 1);
    return values
      .map((value, index) => {
        const x = index * step;
        const y = height - (clamp01(value / max) * (height - 4) + 2);
        return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [values]);

  return (
    <svg
      viewBox="0 0 120 36"
      className={cn("text-chart-1 h-9 w-full", className)}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

interface MeterBarProps {
  label: string;
  valueLabel: string;
  progress: number;
  toneClassName: string;
  icon: ReactNode;
}

function MeterBar({ label, valueLabel, progress, toneClassName, icon }: MeterBarProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
          <span className="[&_svg]:size-3.5" aria-hidden>
            {icon}
          </span>
          {label}
        </span>
        <span className="text-foreground font-mono text-xs tabular-nums">{valueLabel}</span>
      </div>
      <div className="bg-muted h-1.5 overflow-hidden rounded-full">
        <div
          className={cn("h-full rounded-full transition-[width] duration-500", toneClassName)}
          style={{ width: `${clamp01(progress) * 100}%` }}
        />
      </div>
    </div>
  );
}

/** 设置 → 关于：居中品牌区 + 可视化运行状态 */
export function SettingsAboutPanel() {
  const { t } = useTranslation();
  const openTabCount = useOpenTabsStore((state) => state.tabs.length);

  const [appInfo, setAppInfo] = useState<SystemAppInfo | null>(null);
  const [tauriVersion, setTauriVersion] = useState<string | null>(null);
  const [gitVersion, setGitVersion] = useState<string | null>(null);
  const [runtime, setRuntime] = useState<SystemRuntimeStats | null>(null);
  const [webviewCount, setWebviewCount] = useState<number | null>(null);
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [installingUpdate, setInstallingUpdate] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<AppUpdateInfo | null>(
    null,
  );

  async function handleCheckUpdate(): Promise<void> {
    if (checkingUpdate || installingUpdate) {
      return;
    }
    if (import.meta.env.DEV) {
      toast.message(t("statusBar.updateDevHint"));
      return;
    }
    setCheckingUpdate(true);
    const toastId = toast.loading(t("statusBar.updateChecking"));
    try {
      const info = await checkAppUpdate();
      if (!info) {
        setAvailableUpdate(null);
        toast.success(t("statusBar.updateUpToDate"), { id: toastId });
        return;
      }
      setAvailableUpdate(info);
      toast.success(
        t("statusBar.updateAvailable", {
          version: info.version,
          current: info.currentVersion,
        }),
        { id: toastId },
      );
    } catch (error) {
      setAvailableUpdate(null);
      toast.error(toUserMessage(error) || t("statusBar.updateCheckFailed"), {
        id: toastId,
      });
    } finally {
      setCheckingUpdate(false);
    }
  }

  async function handleInstallUpdate(): Promise<void> {
    if (!availableUpdate || installingUpdate) {
      return;
    }
    setInstallingUpdate(true);
    const toastId = toast.loading(t("statusBar.updateDownloading"));
    try {
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
      setInstallingUpdate(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    void Promise.allSettled([
      getAppInfo(),
      getTauriVersion(),
      getGitVersion(),
    ]).then(([appResult, tauriResult, gitResult]) => {
      if (cancelled) {
        return;
      }
      if (appResult.status === "fulfilled") {
        setAppInfo(appResult.value);
      }
      if (tauriResult.status === "fulfilled") {
        setTauriVersion(tauriResult.value);
      }
      if (gitResult.status === "fulfilled") {
        setGitVersion(gitResult.value.version);
      } else {
        setGitVersion(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function poll(): Promise<void> {
      try {
        const [stats, windows] = await Promise.all([
          getRuntimeStats(),
          getAllWebviewWindows().catch(() => null),
        ]);
        if (cancelled) {
          return;
        }
        setRuntime(stats);
        setWebviewCount(windows?.length ?? null);
        setCpuHistory((prev) => {
          const next = [...prev, stats.cpuPercent];
          if (next.length > CPU_HISTORY_LEN) {
            return next.slice(next.length - CPU_HISTORY_LEN);
          }
          return next;
        });
      } catch {
        if (!cancelled) {
          setRuntime(null);
        }
      }
    }

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, RUNTIME_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const dash = t("settings.aboutUnavailable");
  const cpuUnavailable = appInfo?.os === "windows" && (runtime?.cpuPercent ?? 0) === 0;
  const cpuLabel =
    runtime == null || cpuUnavailable ? dash : `${runtime.cpuPercent.toFixed(1)}%`;
  const memoryLabel = runtime ? formatBytes(runtime.rssBytes) : dash;
  const uptimeLabel = runtime ? formatUptime(runtime.uptimeMs) : dash;

  const cpuProgress = cpuUnavailable ? 0 : clamp01((runtime?.cpuPercent ?? 0) / 100);
  const memoryProgress = clamp01((runtime?.rssBytes ?? 0) / MEMORY_GAUGE_CAP_BYTES);

  const metaChips = [
    appInfo ? formatOsLabel(appInfo.os) : null,
    appInfo?.arch || null,
    tauriVersion ? `Tauri ${tauriVersion}` : null,
    gitVersion,
  ].filter((item): item is string => Boolean(item));

  return (
    <div className="space-y-8">
      {/* 居中品牌区 */}
      <section className="flex flex-col items-center text-center">
        <img
          src={appIconUrl}
          alt=""
          width={80}
          height={80}
          className="border-border bg-muted/40 size-20 rounded-2xl border"
          draggable={false}
        />
        <h2 className="text-foreground mt-4 text-lg font-semibold tracking-tight">
          {appInfo?.name ?? "鲸灵Git"}
        </h2>
        <p className="text-muted-foreground mt-1 font-mono text-xs tabular-nums">
          v{appInfo?.version ?? "—"}
          {runtime ? (
            <span className="text-muted-foreground/80"> · PID {runtime.pid}</span>
          ) : null}
        </p>
        <p className="text-muted-foreground mt-2 text-[11px] leading-relaxed">
          {t("settings.aboutCopyright")}
        </p>
        {metaChips.length > 0 ? (
          <ul className="mt-4 flex max-w-md flex-wrap items-center justify-center gap-1.5">
            {metaChips.map((chip) => (
              <li
                key={chip}
                className="bg-muted text-muted-foreground rounded-md px-2 py-0.5 font-mono text-[11px]"
              >
                {chip}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-5 flex flex-col items-center gap-2">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={checkingUpdate || installingUpdate}
              aria-label={t("settings.aboutCheckUpdateAria")}
              onClick={() => {
                void handleCheckUpdate();
              }}
            >
              {checkingUpdate ? (
                <Spinner className="size-3.5" />
              ) : (
                <RefreshCw className="size-3.5" aria-hidden="true" />
              )}
              {t("settings.aboutCheckUpdate")}
            </Button>
            {availableUpdate ? (
              <Button
                type="button"
                size="sm"
                disabled={installingUpdate || checkingUpdate}
                onClick={() => {
                  void handleInstallUpdate();
                }}
              >
                {installingUpdate ? (
                  <Spinner className="size-3.5" />
                ) : null}
                {t("settings.aboutUpdateInstall")}
                <span className="font-mono tabular-nums">
                  v{availableUpdate.version}
                </span>
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      {/* 可视化运行状态 */}
      <section className="space-y-3">
        <div className="flex items-center justify-center gap-1.5">
          <Activity className="text-muted-foreground size-3.5" aria-hidden="true" />
          <h3 className="text-sm font-medium">{t("settings.aboutRuntimeTitle")}</h3>
          <SettingsTip ariaLabel={t("settings.aboutRuntimeTipAria")}>
            {t("settings.aboutRuntimeHint")}
          </SettingsTip>
        </div>
        <p className="text-muted-foreground text-center text-[11px]">
          {t("settings.aboutRuntimeLive")}
        </p>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
          <div className="border-border flex flex-col items-center gap-3 rounded-lg border px-3 py-4">
            <RingGauge
              progress={cpuProgress}
              label={t("settings.aboutCpu")}
              value={cpuLabel}
              toneClassName="text-chart-1"
              unavailable={cpuUnavailable || runtime == null}
            />
            <div className="w-full min-w-0">
              {cpuHistory.length >= 2 && !cpuUnavailable ? (
                <Sparkline values={cpuHistory} />
              ) : (
                <div className="bg-muted/60 h-9 rounded-md" aria-hidden="true" />
              )}
              <p className="text-muted-foreground mt-1 text-center text-[10px]">
                {t("settings.aboutCpuTrend")}
              </p>
            </div>
          </div>

          <div className="border-border flex flex-col items-center justify-center rounded-lg border px-3 py-4">
            <RingGauge
              progress={memoryProgress}
              label={t("settings.aboutRss")}
              value={memoryLabel}
              toneClassName="text-chart-2"
              unavailable={runtime == null}
            />
            <p className="text-muted-foreground mt-1 text-center text-[10px]">
              {t("settings.aboutMemoryCapHint")}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="border-border flex flex-col items-center justify-center gap-1 rounded-lg border px-4 py-5">
            <span className="text-muted-foreground text-xs">{t("settings.aboutUptime")}</span>
            <span className="text-foreground font-mono text-2xl font-medium tracking-tight tabular-nums">
              {uptimeLabel}
            </span>
          </div>

          <div className="border-border space-y-3 rounded-lg border px-4 py-4">
            <MeterBar
              label={t("settings.aboutOpenTabs")}
              valueLabel={String(openTabCount)}
              progress={openTabCount / TABS_BAR_CAP}
              toneClassName="bg-chart-3"
              icon={<Layers />}
            />
            <MeterBar
              label={t("settings.aboutWebviews")}
              valueLabel={webviewCount != null ? String(webviewCount) : dash}
              progress={(webviewCount ?? 0) / WINDOWS_BAR_CAP}
              toneClassName="bg-chart-4"
              icon={<AppWindow />}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
