import { DynamicIcon, type IconName } from "lucide-react/dynamic";

import { cn } from "@/lib/utils";
import { isValidLucideIconName } from "@/utils/lucideIconRegistry";

interface LucideDynamicIconProps {
  name: string;
  /** 无效名称时回退 */
  fallbackName?: string;
  className?: string;
}

function IconPlaceholder({ className }: { className?: string }) {
  return (
    <span
      className={cn("bg-muted inline-block size-4 shrink-0 animate-pulse rounded-sm", className)}
      aria-hidden="true"
    />
  );
}

/**
 * 按需加载 Lucide 图标；仅拉取当前名称对应的动态 chunk。
 * 无效名称回退到 fallbackName（默认 folder）。
 */
export function LucideDynamicIcon({
  name,
  fallbackName = "folder",
  className,
}: LucideDynamicIconProps) {
  const resolved = isValidLucideIconName(name)
    ? name
    : isValidLucideIconName(fallbackName)
      ? fallbackName
      : "folder";

  return (
    <DynamicIcon
      name={resolved as IconName}
      className={cn("size-4", className)}
      fallback={() => <IconPlaceholder className={className} />}
      aria-hidden="true"
    />
  );
}
