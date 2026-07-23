import type { LucideIcon } from "lucide-react";
import {
  AppWindow,
  BookOpen,
  Bot,
  Box,
  Braces,
  BriefcaseBusiness,
  Cloud,
  Code2,
  Cpu,
  Database,
  Folder,
  FolderGit2,
  Gamepad2,
  Globe2,
  Layers3,
  Package,
  Server,
  Smartphone,
  Sparkles,
  Terminal,
} from "lucide-react";

import { cn } from "@/lib/utils";

import {
  DEFAULT_PROJECT_ICON,
  PROJECT_ICON_VALUES,
  type ProjectIcon as ProjectIconName,
} from "@/types/project";

const PROJECT_ICONS: Record<ProjectIconName, LucideIcon> = {
  "folder-git-2": FolderGit2,
  folder: Folder,
  "code-2": Code2,
  terminal: Terminal,
  braces: Braces,
  box: Box,
  package: Package,
  "layers-3": Layers3,
  database: Database,
  server: Server,
  "globe-2": Globe2,
  cloud: Cloud,
  cpu: Cpu,
  "app-window": AppWindow,
  smartphone: Smartphone,
  "gamepad-2": Gamepad2,
  bot: Bot,
  sparkles: Sparkles,
  "briefcase-business": BriefcaseBusiness,
  "book-open": BookOpen,
};

export const PROJECT_ICON_OPTIONS = PROJECT_ICON_VALUES.map((value) => ({
  value,
  Icon: PROJECT_ICONS[value],
}));

interface ProjectIconProps {
  name?: ProjectIconName;
  className?: string;
}

/** 项目图标统一渲染入口；缺失值回退到当前默认 FolderGit2。 */
export function ProjectIcon({ name = DEFAULT_PROJECT_ICON, className }: ProjectIconProps) {
  const Icon = PROJECT_ICONS[name] ?? PROJECT_ICONS[DEFAULT_PROJECT_ICON];

  return <Icon className={cn("size-4", className)} aria-hidden="true" />;
}
