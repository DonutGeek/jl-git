import { useMemo, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export function clamp01(value: number): number {
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

/** SVG 环形进度：颜色走 Design Tokens */
export function RingGauge({
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

interface SparkPoint {
  x: number;
  y: number;
}

/** Catmull-Rom → 三次贝塞尔，生成平滑曲线（比折线更顺） */
function buildSmoothCurvePath(points: readonly SparkPoint[]): string {
  if (points.length < 2) {
    return "";
  }
  if (points.length === 2) {
    const [a, b] = points;
    return `M${a.x.toFixed(1)},${a.y.toFixed(1)} L${b.x.toFixed(1)},${b.y.toFixed(1)}`;
  }

  let d = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    // 张力约 1/6：弧度自然，又不至于大幅过冲
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

/** 迷你平滑曲线：值域按样本 max 归一（仅描边，不铺面积） */
export function Sparkline({ values, className }: SparklineProps) {
  const linePath = useMemo(() => {
    if (values.length < 2) {
      return "";
    }
    const max = Math.max(...values, 1);
    const width = 120;
    const height = 36;
    const step = width / (values.length - 1);
    const points = values.map((value, index) => ({
      x: index * step,
      y: height - (clamp01(value / max) * (height - 4) + 2),
    }));
    return buildSmoothCurvePath(points);
  }, [values]);

  return (
    <svg
      viewBox="0 0 120 36"
      className={cn("text-chart-1 h-9 w-full", className)}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d={linePath}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
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

export function MeterBar({ label, valueLabel, progress, toneClassName, icon }: MeterBarProps) {
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
