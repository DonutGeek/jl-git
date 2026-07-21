import type { ReactNode } from "react";

import { SettingsTip } from "@/components/settings/SettingsTip";
import { cn } from "@/lib/utils";

/** 与鲸灵分区小标题同级：图标 + text-xs font-medium */
export function SettingsFieldHeading({
  icon,
  children,
  tip,
  tipAria,
  className,
}: {
  icon: ReactNode;
  children: ReactNode;
  tip?: ReactNode;
  tipAria?: string;
  className?: string;
}) {
  return (
    <div className={cn("mb-1.5 flex items-center gap-1.5", className)}>
      <span className="text-muted-foreground flex shrink-0 [&_svg]:size-4" aria-hidden>
        {icon}
      </span>
      <p className="text-foreground text-xs font-medium">{children}</p>
      {tip != null && tipAria ? (
        <SettingsTip ariaLabel={tipAria}>{tip}</SettingsTip>
      ) : null}
    </div>
  );
}
