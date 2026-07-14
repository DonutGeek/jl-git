import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";

import type { BranchCompareMode } from "@/types/git";

export interface OpenBranchCompareWindowOptions {
  projectId: string;
  mode: BranchCompareMode;
  base: string;
  target: string;
}

interface BranchCompareWindowTarget {
  label: string;
  url: string;
}

const BRANCH_COMPARE_WINDOW_SIZE = new LogicalSize(1180, 760);

/** 为同一项目与 ref 生成可聚焦的稳定子窗口标识。 */
export function createBranchCompareWindowTarget(
  options: OpenBranchCompareWindowOptions,
): BranchCompareWindowTarget {
  const query = new URLSearchParams({
    projectId: options.projectId,
    mode: options.mode,
    base: options.base,
    target: options.target,
  });
  const identity = `${options.projectId}\u0000${options.mode}\u0000${options.base}\u0000${options.target}`;
  return {
    label: `branch-compare-${fnv1a(identity)}`,
    url: `/branch-compare?${query.toString()}`,
  };
}

/** 创建或聚焦一个只读分支比较窗口。 */
export async function openBranchCompareWindow(
  options: OpenBranchCompareWindowOptions,
): Promise<void> {
  const target = createBranchCompareWindowTarget(options);
  const existing = await WebviewWindow.getByLabel(target.label);
  if (existing) {
    await existing.setSize(BRANCH_COMPARE_WINDOW_SIZE);
    await existing.center();
    await existing.show();
    await existing.setFocus();
    return;
  }

  const window = new WebviewWindow(target.label, {
    url: target.url,
    title: "分支比较",
    width: BRANCH_COMPARE_WINDOW_SIZE.width,
    height: BRANCH_COMPARE_WINDOW_SIZE.height,
    minWidth: 860,
    minHeight: 560,
    titleBarStyle: "overlay",
    hiddenTitle: true,
    trafficLightPosition: new LogicalPosition(16, 26),
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
