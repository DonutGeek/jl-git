import { LucideDynamicIcon } from "@/components/common/LucideDynamicIcon";
import { cn } from "@/lib/utils";
import {
  DEFAULT_PROJECT_ICON,
  PROJECT_ICON_VALUES,
  type ProjectIcon as ProjectIconName,
} from "@/types/project";
import { isValidLucideIconName } from "@/utils/lucideIconRegistry";

/** 常用项目图标（兼容旧 UI / 展示名覆盖）；全量选择见 LucideIconPicker */
export const PROJECT_ICON_OPTIONS = PROJECT_ICON_VALUES.map((value) => ({
  value,
}));

interface ProjectIconProps {
  name?: string;
  className?: string;
}

/** 项目图标统一渲染入口；缺失值回退到默认 folder-git-2。 */
export function ProjectIcon({ name = DEFAULT_PROJECT_ICON, className }: ProjectIconProps) {
  const resolved = name && isValidLucideIconName(name) ? name : DEFAULT_PROJECT_ICON;

  return (
    <LucideDynamicIcon
      name={resolved}
      fallbackName={DEFAULT_PROJECT_ICON}
      className={cn("size-4", className)}
    />
  );
}

export type { ProjectIconName };
