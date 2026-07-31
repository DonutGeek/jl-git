import type { WorkspaceIcon } from "@/types/project";

/** 历史默认 / 常用分组图标（展示名覆盖用） */
export const WORKSPACE_ICON_OPTIONS: ReadonlyArray<{
  value: WorkspaceIcon;
  labelKey:
    | "projectManager.iconCode"
    | "projectManager.iconFolder"
    | "projectManager.iconBriefcase"
    | "projectManager.iconLayers"
    | "projectManager.iconBox";
}> = [
  { value: "code", labelKey: "projectManager.iconCode" },
  { value: "folder", labelKey: "projectManager.iconFolder" },
  { value: "briefcase", labelKey: "projectManager.iconBriefcase" },
  { value: "layers", labelKey: "projectManager.iconLayers" },
  { value: "box", labelKey: "projectManager.iconBox" },
];

export const DEFAULT_WORKSPACE_ICON: WorkspaceIcon = "code";

export function resolveWorkspaceIconLabelKey(
  icon: string,
): (typeof WORKSPACE_ICON_OPTIONS)[number]["labelKey"] | null {
  return WORKSPACE_ICON_OPTIONS.find((option) => option.value === icon)?.labelKey ?? null;
}
