import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalSize } from "@tauri-apps/api/dpi";

import { createAppWindowChromeOptions } from "@/services/window/windowChrome";

export interface OpenBranchManageWindowOptions {
  projectId: string;
}

interface BranchManageWindowTarget {
  label: string;
  url: string;
}

const BRANCH_MANAGE_WINDOW_SIZE = new LogicalSize(960, 640);

/** 为同一项目生成可聚焦的稳定子窗口标识。 */
export function createBranchManageWindowTarget(
  options: OpenBranchManageWindowOptions,
): BranchManageWindowTarget {
  const query = new URLSearchParams({
    projectId: options.projectId,
  });
  const identity = `${options.projectId}\u0000branch-manage`;
  return {
    label: `branch-manage-${fnv1a(identity)}`,
    url: `/branch-manage?${query.toString()}`,
  };
}

/** 创建或聚焦分支管理子窗口。 */
export async function openBranchManageWindow(
  options: OpenBranchManageWindowOptions,
): Promise<void> {
  const target = createBranchManageWindowTarget(options);
  const existing = await WebviewWindow.getByLabel(target.label);
  if (existing) {
    await existing.show();
    await existing.setFocus();
    return;
  }

  const window = new WebviewWindow(target.label, {
    url: target.url,
    title: "分支管理",
    width: BRANCH_MANAGE_WINDOW_SIZE.width,
    height: BRANCH_MANAGE_WINDOW_SIZE.height,
    minWidth: 760,
    minHeight: 480,
    ...createAppWindowChromeOptions(),
  });
  await new Promise<void>((resolve, reject) => {
    void window.once("tauri://created", () => resolve());
    void window.once("tauri://error", (event) => reject(event.payload));
  });
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
