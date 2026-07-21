import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getTauriVersion } from "@tauri-apps/api/app";
import { getAllWebviewWindows } from "@tauri-apps/api/webviewWindow";
import { Activity, Info, MemoryStick, Monitor, Timer } from "lucide-react";

import { SettingsFieldHeading } from "@/components/settings/SettingsFieldHeading";
import { SettingsTip } from "@/components/settings/SettingsTip";
import { getGitVersion } from "@/services/git/git.version";
import {
  getAppInfo,
  getRuntimeStats,
  type SystemAppInfo,
  type SystemRuntimeStats,
} from "@/services/system/system.info";
import { useOpenTabsStore } from "@/store/useOpenTabsStore";

const RUNTIME_POLL_MS = 1000;

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

interface AboutRowProps {
  label: string;
  value: string;
}

function AboutRow({ label, value }: AboutRowProps) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3 py-1.5">
      <span className="text-muted-foreground shrink-0 text-xs">{label}</span>
      <span className="text-foreground min-w-0 truncate text-right font-mono text-xs tabular-nums">
        {value}
      </span>
    </div>
  );
}

/** 设置 → 关于：应用信息 + 轻量实时运行状态 */
export function SettingsAboutPanel() {
  const { t } = useTranslation();
  const openTabCount = useOpenTabsStore((state) => state.tabs.length);

  const [appInfo, setAppInfo] = useState<SystemAppInfo | null>(null);
  const [tauriVersion, setTauriVersion] = useState<string | null>(null);
  const [gitVersion, setGitVersion] = useState<string | null>(null);
  const [runtime, setRuntime] = useState<SystemRuntimeStats | null>(null);
  const [webviewCount, setWebviewCount] = useState<number | null>(null);

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
  // Windows 侧 CPU 采样固定为 0，显示不可用
  const cpuLabel =
    runtime == null
      ? dash
      : appInfo?.os === "windows" && runtime.cpuPercent === 0
        ? dash
        : `${runtime.cpuPercent.toFixed(1)}%`;

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-start gap-2.5">
          <div className="text-muted-foreground mt-0.5 [&_svg]:size-4" aria-hidden>
            <Info />
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <h3 className="text-sm font-medium">{t("settings.aboutAppTitle")}</h3>
            <SettingsTip ariaLabel={t("settings.aboutAppTipAria")}>
              {t("settings.aboutAppHint")}
            </SettingsTip>
          </div>
        </div>
        <div className="border-border divide-border divide-y rounded-md border px-3 py-1">
          <AboutRow
            label={t("settings.aboutAppName")}
            value={appInfo?.name ?? dash}
          />
          <AboutRow
            label={t("settings.aboutAppVersion")}
            value={appInfo?.version ?? dash}
          />
          <AboutRow
            label={t("settings.aboutArch")}
            value={appInfo?.arch ?? dash}
          />
          <AboutRow
            label={t("settings.aboutOs")}
            value={appInfo ? formatOsLabel(appInfo.os) : dash}
          />
          <AboutRow label={t("settings.aboutTauri")} value={tauriVersion ?? dash} />
          <AboutRow label={t("settings.aboutGit")} value={gitVersion ?? dash} />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-start gap-2.5">
          <div className="text-muted-foreground mt-0.5 [&_svg]:size-4" aria-hidden>
            <Activity />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <h3 className="text-sm font-medium">{t("settings.aboutRuntimeTitle")}</h3>
              <SettingsTip ariaLabel={t("settings.aboutRuntimeTipAria")}>
                {t("settings.aboutRuntimeHint")}
              </SettingsTip>
            </div>
            <p className="text-muted-foreground text-[11px]">
              {t("settings.aboutRuntimeLive")}
            </p>
          </div>
        </div>
        <div className="space-y-3">
          <SettingsFieldHeading icon={<MemoryStick />}>
            {t("settings.aboutMemory")}
          </SettingsFieldHeading>
          <div className="border-border rounded-md border px-3 py-1">
            <AboutRow
              label={t("settings.aboutRss")}
              value={runtime ? formatBytes(runtime.rssBytes) : dash}
            />
            <AboutRow label={t("settings.aboutCpu")} value={cpuLabel} />
          </div>

          <SettingsFieldHeading icon={<Timer />}>
            {t("settings.aboutUptime")}
          </SettingsFieldHeading>
          <div className="border-border rounded-md border px-3 py-1">
            <AboutRow
              label={t("settings.aboutUptimeValue")}
              value={runtime ? formatUptime(runtime.uptimeMs) : dash}
            />
            <AboutRow
              label={t("settings.aboutPid")}
              value={runtime ? String(runtime.pid) : dash}
            />
          </div>

          <SettingsFieldHeading icon={<Monitor />}>
            {t("settings.aboutSessions")}
          </SettingsFieldHeading>
          <div className="border-border rounded-md border px-3 py-1">
            <AboutRow
              label={t("settings.aboutOpenTabs")}
              value={String(openTabCount)}
            />
            <AboutRow
              label={t("settings.aboutWebviews")}
              value={webviewCount != null ? String(webviewCount) : dash}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
