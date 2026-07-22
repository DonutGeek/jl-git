import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getAllWebviewWindows } from "@tauri-apps/api/webviewWindow";
import { AppWindow, HardDrive, Layers } from "lucide-react";

import {
  clamp01,
  MeterBar,
  RingGauge,
  Sparkline,
} from "@/components/settings/SettingsPerfCharts";
import { getAppDataUsage } from "@/services/data/data.service";
import {
  getAppInfo,
  getRuntimeStats,
  type SystemAppInfo,
  type SystemRuntimeStats,
} from "@/services/system/system.info";
import { useOpenTabsStore } from "@/store/useOpenTabsStore";

const RUNTIME_POLL_MS = 1000;
const DATA_USAGE_POLL_MS = 10_000;
const HISTORY_LEN = 36;
/** 内存环按此上限映射填充（2GB） */
const MEMORY_GAUGE_CAP_BYTES = 2 * 1024 * 1024 * 1024;
/** 数据目录环参考上限（512MB） */
const DATA_DIR_GAUGE_CAP_BYTES = 512 * 1024 * 1024;
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

function pushHistory(prev: number[], next: number): number[] {
  const merged = [...prev, next];
  if (merged.length > HISTORY_LEN) {
    return merged.slice(merged.length - HISTORY_LEN);
  }
  return merged;
}

/** 设置 → 性能：本进程仪表盘 */
export function SettingsPerformancePanel() {
  const { t } = useTranslation();
  const openTabCount = useOpenTabsStore((state) => state.tabs.length);

  const [appInfo, setAppInfo] = useState<SystemAppInfo | null>(null);
  const [runtime, setRuntime] = useState<SystemRuntimeStats | null>(null);
  const [webviewCount, setWebviewCount] = useState<number | null>(null);
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [rssHistory, setRssHistory] = useState<number[]>([]);
  const [dataBytes, setDataBytes] = useState<number | null>(null);

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
          setAppInfo(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function pollRuntime(): Promise<void> {
      // 运行时与窗口数分开取，避免一侧失败拖垮整页「—」
      const statsResult = await getRuntimeStats().then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({ ok: false as const, error }),
      );
      const windows = await getAllWebviewWindows().catch(() => null);

      if (cancelled) {
        return;
      }

      if (statsResult.ok) {
        const stats = statsResult.value;
        setRuntime(stats);
        setCpuHistory((prev) => pushHistory(prev, stats.cpuPercent));
        setRssHistory((prev) =>
          pushHistory(prev, stats.rssBytes / (1024 * 1024)),
        );
      } else {
        console.warn("[SettingsPerformance] runtime stats failed", statsResult.error);
        setRuntime(null);
      }
      setWebviewCount(windows?.length ?? null);
    }

    void pollRuntime();
    const timer = window.setInterval(() => {
      void pollRuntime();
    }, RUNTIME_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function pollUsage(): Promise<void> {
      try {
        const usage = await getAppDataUsage();
        if (!cancelled) {
          setDataBytes(usage.totalBytes);
        }
      } catch {
        if (!cancelled) {
          setDataBytes(null);
        }
      }
    }

    void pollUsage();
    const timer = window.setInterval(() => {
      void pollUsage();
    }, DATA_USAGE_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const dash = t("settings.perfUnavailable");
  const cpuUnavailable =
    appInfo?.os === "windows" && (runtime?.cpuPercent ?? 0) === 0;
  const cpuLabel =
    runtime == null || cpuUnavailable
      ? dash
      : `${runtime.cpuPercent.toFixed(1)}%`;
  const memoryLabel = runtime ? formatBytes(runtime.rssBytes) : dash;
  const uptimeLabel = runtime ? formatUptime(runtime.uptimeMs) : dash;
  const threadLabel =
    runtime?.threadCount != null ? String(runtime.threadCount) : null;
  const dataLabel = dataBytes != null ? formatBytes(dataBytes) : dash;

  const cpuProgress = cpuUnavailable
    ? 0
    : clamp01((runtime?.cpuPercent ?? 0) / 100);
  const memoryProgress = clamp01(
    (runtime?.rssBytes ?? 0) / MEMORY_GAUGE_CAP_BYTES,
  );
  const dataProgress = clamp01((dataBytes ?? 0) / DATA_DIR_GAUGE_CAP_BYTES);

  return (
    <div className="space-y-5">
      <p className="text-muted-foreground text-[11px]">{t("settings.perfLive")}</p>

      <div className="grid grid-cols-2 gap-4">
        <div className="border-border flex flex-col items-center gap-3 rounded-lg border px-3 py-4">
          <RingGauge
            progress={cpuProgress}
            label={t("settings.perfCpu")}
            value={cpuLabel}
            toneClassName="text-chart-1"
            unavailable={cpuUnavailable || runtime == null}
          />
          <div className="w-full min-w-0">
            {cpuHistory.length >= 2 && !cpuUnavailable ? (
              <Sparkline values={cpuHistory} className="text-chart-1" />
            ) : (
              <div className="bg-muted/60 h-9 rounded-md" aria-hidden="true" />
            )}
            <p className="text-muted-foreground mt-1 text-center text-[10px]">
              {t("settings.perfCpuTrend")}
            </p>
          </div>
        </div>

        <div className="border-border flex flex-col items-center gap-3 rounded-lg border px-3 py-4">
          <RingGauge
            progress={memoryProgress}
            label={t("settings.perfRss")}
            value={memoryLabel}
            toneClassName="text-chart-2"
            unavailable={runtime == null}
          />
          <div className="w-full min-w-0">
            {rssHistory.length >= 2 ? (
              <Sparkline values={rssHistory} className="text-chart-2" />
            ) : (
              <div className="bg-muted/60 h-9 rounded-md" aria-hidden="true" />
            )}
            <p className="text-muted-foreground mt-1 text-center text-[10px]">
              {t("settings.perfMemoryCapHint")}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="border-border flex flex-col items-center justify-center gap-1 rounded-lg border px-4 py-5">
          <span className="text-muted-foreground text-xs">
            {t("settings.perfUptime")}
          </span>
          <span className="text-foreground font-mono text-2xl font-medium tracking-tight tabular-nums">
            {uptimeLabel}
          </span>
          {runtime ? (
            <span className="text-muted-foreground mt-1 font-mono text-[11px] tabular-nums">
              PID {runtime.pid}
            </span>
          ) : null}
        </div>

        <div className="border-border space-y-3 rounded-lg border px-4 py-4">
          {threadLabel != null ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground text-xs">
                {t("settings.perfThreads")}
              </span>
              <span className="text-foreground font-mono text-sm tabular-nums">
                {threadLabel}
              </span>
            </div>
          ) : null}
          <MeterBar
            label={t("settings.perfOpenTabs")}
            valueLabel={String(openTabCount)}
            progress={openTabCount / TABS_BAR_CAP}
            toneClassName="bg-chart-3"
            icon={<Layers />}
          />
          <MeterBar
            label={t("settings.perfWebviews")}
            valueLabel={webviewCount != null ? String(webviewCount) : dash}
            progress={(webviewCount ?? 0) / WINDOWS_BAR_CAP}
            toneClassName="bg-chart-4"
            icon={<AppWindow />}
          />
        </div>
      </div>

      <div className="border-border flex items-center gap-4 rounded-lg border px-4 py-4">
        <RingGauge
          progress={dataProgress}
          label={t("settings.perfDataDir")}
          value={dataLabel}
          toneClassName="text-chart-5"
          unavailable={dataBytes == null}
        />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <HardDrive className="size-3.5 shrink-0" aria-hidden />
            {t("settings.perfDataDirHint")}
          </div>
          <p className="text-muted-foreground text-[10px] leading-relaxed">
            {t("settings.perfDataDirCapHint")}
          </p>
        </div>
      </div>
    </div>
  );
}
