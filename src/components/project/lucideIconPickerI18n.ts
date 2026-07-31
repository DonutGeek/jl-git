import type { TFunction } from "i18next";

import { resolveWorkspaceIconLabelKey } from "@/components/project/workspaceGroupAppearance";
import { PROJECT_ICON_VALUES } from "@/types/project";

const PROJECT_LABEL_KEYS = new Set<string>(PROJECT_ICON_VALUES);

/** 仓库 / 分组图标选择器共用的 LucideIconPicker i18n 与展示名覆盖 */
export function lucideIconPickerI18n(
  t: TFunction,
  options?: { ariaLabel?: string },
): {
  ariaLabel: string;
  searchPlaceholder: string;
  emptyLabel: string;
  labelForName: (name: string) => string | undefined;
} {
  return {
    ariaLabel: options?.ariaLabel ?? t("projectManager.projectIcon"),
    searchPlaceholder: t("projectManager.searchProjectIcons"),
    emptyLabel: t("projectManager.projectIconNoMatch"),
    labelForName: (name) => {
      if (PROJECT_LABEL_KEYS.has(name)) {
        return t(`projectManager.projectIcons.${name}`);
      }
      const workspaceKey = resolveWorkspaceIconLabelKey(name);
      return workspaceKey ? t(workspaceKey) : undefined;
    },
  };
}
