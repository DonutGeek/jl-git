import { BriefcaseBusiness, Box, Code2, Folder, Layers3, type LucideIcon } from "lucide-react";

import type { WorkspaceIcon } from "@/types/project";

export const WORKSPACE_ICON_OPTIONS: ReadonlyArray<{
  value: WorkspaceIcon;
  Icon: LucideIcon;
  labelKey:
    | "projectManager.iconCode"
    | "projectManager.iconFolder"
    | "projectManager.iconBriefcase"
    | "projectManager.iconLayers"
    | "projectManager.iconBox";
}> = [
  { value: "code", Icon: Code2, labelKey: "projectManager.iconCode" },
  { value: "folder", Icon: Folder, labelKey: "projectManager.iconFolder" },
  {
    value: "briefcase",
    Icon: BriefcaseBusiness,
    labelKey: "projectManager.iconBriefcase",
  },
  { value: "layers", Icon: Layers3, labelKey: "projectManager.iconLayers" },
  { value: "box", Icon: Box, labelKey: "projectManager.iconBox" },
];

export function workspaceIconComponent(icon: WorkspaceIcon): LucideIcon {
  return WORKSPACE_ICON_OPTIONS.find((option) => option.value === icon)?.Icon ?? Folder;
}
