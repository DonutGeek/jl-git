import {
  BriefcaseBusiness,
  Box,
  Code2,
  Folder,
  Layers3,
  type LucideIcon,
} from "lucide-react";

import type { WorkspaceColor, WorkspaceIcon } from "@/types/project";

export const WORKSPACE_COLOR_CLASS: Record<WorkspaceColor, string> = {
  blue: "bg-workspace-blue",
  green: "bg-workspace-green",
  orange: "bg-workspace-orange",
  purple: "bg-workspace-purple",
  red: "bg-workspace-red",
};

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

export const WORKSPACE_COLOR_OPTIONS: ReadonlyArray<{
  value: WorkspaceColor;
  labelKey:
    | "projectManager.colorBlue"
    | "projectManager.colorGreen"
    | "projectManager.colorOrange"
    | "projectManager.colorPurple"
    | "projectManager.colorRed";
}> = [
  { value: "blue", labelKey: "projectManager.colorBlue" },
  { value: "green", labelKey: "projectManager.colorGreen" },
  { value: "orange", labelKey: "projectManager.colorOrange" },
  { value: "purple", labelKey: "projectManager.colorPurple" },
  { value: "red", labelKey: "projectManager.colorRed" },
];

export function workspaceIconComponent(icon: WorkspaceIcon): LucideIcon {
  return (
    WORKSPACE_ICON_OPTIONS.find((option) => option.value === icon)?.Icon ??
    Folder
  );
}
