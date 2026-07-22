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
              className={cn(
                "transition-[stroke-dashoffset] duration-500",
                toneClassName,
              )}
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
export function Sparkline({ values, className }: SparklineProps) {
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

export function MeterBar({
  label,
  valueLabel,
  progress,
  toneClassName,
  icon,
}: MeterBarProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
          <span className="[&_svg]:size-3.5" aria-hidden>
            {icon}
          </span>
          {label}
        </span>
        <span className="text-foreground font-mono text-xs tabular-nums">
          {valueLabel}
        </span>
      </div>
      <div className="bg-muted h-1.5 overflow-hidden rounded-full">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500",
            toneClassName,
          )}
          style={{ width: `${clamp01(progress) * 100}%` }}
        />
      </div>
    </div>
  );
}
