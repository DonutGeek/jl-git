import type { TFunction } from "i18next";

import type { AppOs } from "@/services/window/windowChrome";

/** 在文件管理器中显示：按平台用 Finder / 资源管理器 / 文件管理器 */
export function revealInFileManagerLabel(os: AppOs, t: TFunction): string {
  if (os === "windows") {
    return t("repo.openInExplorer");
  }
  if (os === "linux") {
    return t("repo.openInFileManager");
  }
  return t("repo.openInFinder");
}
