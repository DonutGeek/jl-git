import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import type { SystemDiskSpace } from "@/services/system/system.info";

interface DiskSpaceTooltipProps {
  /** 状态栏摘要用的当前卷（通常为仓库所在盘） */
  current: SystemDiskSpace | null;
  /** 本机可见卷列表；失败时可为 [] */
  volumes: readonly SystemDiskSpace[];
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exp;
  return `${value.toFixed(value >= 100 || exp === 0 ? 0 : 2)}${units[exp]}`;
}

function usedRatio(space: SystemDiskSpace): number {
  if (space.totalBytes <= 0) {
    return 0;
  }
  const used = Math.max(0, space.totalBytes - space.availableBytes);
  return Math.min(1, used / space.totalBytes);
}

function sameVolume(left: string, right: string): boolean {
  const normalize = (value: string): string =>
    value.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  return normalize(left) === normalize(right);
}

function UsageBar({
  ratio,
  nearFull,
  className,
}: {
  ratio: number;
  nearFull: boolean;
  className?: string;
}) {
  const percent = Math.round(ratio * 100);
  return (
    <div
      className={cn(
        // 提示气泡是反色面（bg-foreground/text-background），轨道用 background 透明度以保证各主题对比
        "bg-background/25 relative h-1.5 w-full overflow-hidden rounded-full",
        className,
      )}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <div
        className={cn(
          "absolute inset-y-0 left-0 rounded-full",
          nearFull ? "bg-destructive" : "bg-background",
        )}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

/**
 * 状态栏磁盘 hover：单卷紧凑卡；多卷列表（多时 ScrollArea），并标出当前仓库所在卷。
 */
export function DiskSpaceTooltip({ current, volumes }: DiskSpaceTooltipProps) {
  const { t } = useTranslation();

  const ordered = useMemo(() => {
    const byPath = new Map<string, SystemDiskSpace>();
    for (const volume of volumes) {
      byPath.set(volume.path, volume);
    }
    if (current) {
      const exists = [...byPath.keys()].some((path) => sameVolume(path, current.path));
      if (!exists) {
        byPath.set(current.path, current);
      }
    }
    const list = [...byPath.values()];
    if (!current) {
      return list;
    }
    return list.sort((left, right) => {
      const leftCurrent = sameVolume(left.path, current.path) ? 0 : 1;
      const rightCurrent = sameVolume(right.path, current.path) ? 0 : 1;
      if (leftCurrent !== rightCurrent) {
        return leftCurrent - rightCurrent;
      }
      return left.path.localeCompare(right.path);
    });
  }, [current, volumes]);

  if (!current && ordered.length === 0) {
    return <>{t("statusBar.diskUnknown")}</>;
  }

  // 单卷：沿用原来的紧凑详情
  if (ordered.length <= 1) {
    const space = ordered[0] ?? current;
    if (!space) {
      return <>{t("statusBar.diskUnknown")}</>;
    }
    const ratio = usedRatio(space);
    const percent = Math.round(ratio * 100);
    return (
      <div className="space-y-1.5 text-xs">
        <p className="font-medium">{t("statusBar.diskSpace")}</p>
        <p className="text-background/70 break-all">{space.path}</p>
        <UsageBar ratio={ratio} nearFull={ratio >= 0.9} className="h-2" />
        <p>
          {t("statusBar.diskUsedPercent", { percent })}
          {" · "}
          {t("statusBar.diskAvailableFull", {
            size: formatBytes(space.availableBytes),
          })}
        </p>
        <p>{t("statusBar.diskTotal", { size: formatBytes(space.totalBytes) })}</p>
      </div>
    );
  }

  // 多卷：列表布局；≥4 个时限制高度滚动
  const needsScroll = ordered.length >= 4;

  const list = (
    <div className="space-y-2.5 pr-1">
      {ordered.map((space) => {
        const ratio = usedRatio(space);
        const percent = Math.round(ratio * 100);
        const isCurrent = current ? sameVolume(space.path, current.path) : false;
        return (
          <div
            key={space.path}
            className={cn(
              "space-y-1 rounded-md px-1.5 py-1",
              isCurrent && "bg-background/20",
            )}
          >
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate font-mono text-[11px]">{space.path}</p>
              {isCurrent ? (
                <span className="text-background shrink-0 text-[10px] font-semibold">
                  {t("statusBar.diskCurrent")}
                </span>
              ) : null}
            </div>
            <UsageBar ratio={ratio} nearFull={ratio >= 0.9} />
            <p className="text-background/70 text-[10px] leading-snug">
              {t("statusBar.diskUsedPercent", { percent })}
              {" · "}
              {t("statusBar.diskAvailable", {
                size: formatBytes(space.availableBytes),
              })}
              {" · "}
              {t("statusBar.diskTotal", { size: formatBytes(space.totalBytes) })}
            </p>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-medium">{t("statusBar.diskSpace")}</p>
        <p className="text-background/70 shrink-0 text-[10px]">
          {t("statusBar.diskVolumeCount", { count: ordered.length })}
        </p>
      </div>
      {needsScroll ? (
        <ScrollArea className="h-48 pr-1">{list}</ScrollArea>
      ) : (
        list
      )}
      <p className="text-background/70 text-[10px] leading-snug">
        {t("statusBar.diskMultiHint")}
      </p>
    </div>
  );
}
