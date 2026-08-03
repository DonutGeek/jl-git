import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalSize } from "@tauri-apps/api/dpi";

import { createAppWindowChromeOptions } from "@/services/window/windowChrome";

interface HistoryWindowTarget {
  label: string;
  url: string;
}

const HISTORY_WINDOW_SIZE = new LogicalSize(1100, 720);

export interface OpenFileHistoryWindowOptions {
  projectId: string;
  /** 仓库内相对路径 */
  filePath: string;
  /** 可选：限定分支 / 引用；缺省为全部可达历史 */
  ref?: string | null;
}

export interface OpenBranchHistoryWindowOptions {
  projectId: string;
  /** null / 空 = 所有分支（`--all`） */
  ref?: string | null;
}

export interface OpenCommitHistoryWindowOptions {
  projectId: string;
  /** 完整提交 hash。子窗会定位到该提交并展示其全部变更文件。 */
  commitId: string;
}

/** 文件历史子窗口：稳定 label，已存在则聚焦。 */
export function createFileHistoryWindowTarget(
  options: OpenFileHistoryWindowOptions,
): HistoryWindowTarget {
  const query = new URLSearchParams({
    projectId: options.projectId,
    filePath: options.filePath,
  });
  if (options.ref) {
    query.set("ref", options.ref);
  }
  const identity = `${options.projectId}\u0000file\u0000${options.filePath}\u0000${options.ref ?? ""}`;
  return {
    label: `file-history-${fnv1a(identity)}`,
    url: `/file-history?${query.toString()}`,
  };
}

/** 分支历史子窗口：稳定 label，已存在则聚焦。 */
export function createBranchHistoryWindowTarget(
  options: OpenBranchHistoryWindowOptions,
): HistoryWindowTarget {
  const query = new URLSearchParams({
    projectId: options.projectId,
  });
  if (options.ref) {
    query.set("ref", options.ref);
  }
  const identity = `${options.projectId}\u0000branch\u0000${options.ref ?? ""}`;
  return {
    label: `branch-history-${fnv1a(identity)}`,
    url: `/branch-history?${query.toString()}`,
  };
}

/** 提交历史子窗口：从文件历史等上下文查看某次提交的完整变更。 */
export function createCommitHistoryWindowTarget(
  options: OpenCommitHistoryWindowOptions,
): HistoryWindowTarget {
  const query = new URLSearchParams({
    projectId: options.projectId,
    commitId: options.commitId,
  });
  const identity = `${options.projectId}\u0000commit\u0000${options.commitId}`;
  return {
    label: `commit-history-${fnv1a(identity)}`,
    url: `/commit-history?${query.toString()}`,
  };
}

/** 创建或聚焦文件历史窗口。 */
export async function openFileHistoryWindow(options: OpenFileHistoryWindowOptions): Promise<void> {
  await openOrFocusWindow(createFileHistoryWindowTarget(options), "文件历史");
}

/** 创建或聚焦分支历史窗口。 */
export async function openBranchHistoryWindow(
  options: OpenBranchHistoryWindowOptions,
): Promise<void> {
  await openOrFocusWindow(createBranchHistoryWindowTarget(options), "分支历史");
}

/** 创建或聚焦提交历史窗口。 */
export async function openCommitHistoryWindow(
  options: OpenCommitHistoryWindowOptions,
): Promise<void> {
  await openOrFocusWindow(createCommitHistoryWindowTarget(options), "提交历史");
}

async function openOrFocusWindow(target: HistoryWindowTarget, title: string): Promise<void> {
  const existing = await WebviewWindow.getByLabel(target.label);
  if (existing) {
    await existing.show();
    await existing.setFocus();
    return;
  }

  const window = new WebviewWindow(target.label, {
    url: target.url,
    title,
    width: HISTORY_WINDOW_SIZE.width,
    height: HISTORY_WINDOW_SIZE.height,
    minWidth: 860,
    minHeight: 560,
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
