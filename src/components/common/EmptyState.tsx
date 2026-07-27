import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  /** lucide 等图标 */
  icon?: ReactNode;
  title: string;
  description?: string;
  /** 可选主操作（按钮等） */
  action?: ReactNode;
  className?: string;
  /** 紧凑：侧栏 / 底部面板等小区域 */
  compact?: boolean;
}

/**
 * 跨领域空状态：图标 + 标题 + 说明 + 可选主操作
 * 对齐 ui-guidelines「一句话 + 一个主操作」
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "px-4 py-8" : "px-6 py-16",
        className,
      )}
    >
      {icon ? (
        <div
          className={cn(
            "text-muted-foreground flex items-center justify-center opacity-50",
            compact ? "[&_svg]:size-8" : "[&_svg]:size-10",
          )}
          aria-hidden="true"
        >
          {icon}
        </div>
      ) : null}
      <h2 className={cn("font-semibold", compact ? "mt-3 text-sm" : "mt-5 text-lg")}>{title}</h2>
      {description ? (
        <p
          className={cn(
            "text-muted-foreground max-w-sm",
            compact ? "mt-1 text-xs" : "mt-2 text-sm",
          )}
        >
          {description}
        </p>
      ) : null}
      {action ? <div className={cn(compact ? "mt-3" : "mt-5")}>{action}</div> : null}
    </div>
  );
}
