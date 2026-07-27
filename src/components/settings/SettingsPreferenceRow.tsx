import type { ReactNode } from "react";

import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { cn } from "@/lib/utils";

/** 设置偏好一行：与清理缓存同系 Item；默认左文右控，路径等可 below 全宽 */
export function SettingsPreferenceRow({
  label,
  description,
  children,
  className,
  control = "end",
}: {
  label: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  /** end：右栏控件；below：标题下全宽（路径 Input） */
  control?: "end" | "below";
}) {
  if (control === "below") {
    return (
      <Item size="sm" className={cn("flex-col items-stretch rounded-none", className)}>
        <ItemContent className="w-full gap-2">
          <ItemTitle className="text-foreground text-xs">{label}</ItemTitle>
          {description != null ? (
            <ItemDescription className="text-xs">{description}</ItemDescription>
          ) : null}
          <div className="w-full min-w-0">{children}</div>
        </ItemContent>
      </Item>
    );
  }

  return (
    <Item size="sm" className={cn("rounded-none", className)}>
      <ItemContent>
        <ItemTitle className="text-foreground text-xs">{label}</ItemTitle>
        {description != null ? (
          <ItemDescription className="text-xs">{description}</ItemDescription>
        ) : null}
      </ItemContent>
      <ItemActions className="shrink-0">{children}</ItemActions>
    </Item>
  );
}
