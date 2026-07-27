import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getAllWebviewWindows } from "@tauri-apps/api/webviewWindow";

export const OPEN_PROJECT_IN_MAIN_EVENT = "jlgit:open-project-in-main";
export const PROJECTS_CHANGED_EVENT = "jlgit:projects-changed";

export interface OpenProjectInMainPayload {
  projectId: string;
}

/** 子窗请求主窗打开仓库标签并聚焦主窗 */
export async function requestOpenProjectInMain(projectId: string): Promise<void> {
  await emit(OPEN_PROJECT_IN_MAIN_EVENT, { projectId } satisfies OpenProjectInMainPayload);
  await focusMainWindow();
}

/** 子窗增删改仓库后通知主窗刷新列表 */
export async function notifyProjectsChanged(): Promise<void> {
  await emit(PROJECTS_CHANGED_EVENT);
}

export async function listenOpenProjectInMain(
  handler: (projectId: string) => void,
): Promise<() => void> {
  const unlisten = await listen<OpenProjectInMainPayload>(OPEN_PROJECT_IN_MAIN_EVENT, (event) => {
    const projectId = event.payload?.projectId?.trim();
    if (projectId) {
      handler(projectId);
    }
  });
  return unlisten;
}

export async function listenProjectsChanged(handler: () => void): Promise<() => void> {
  const unlisten = await listen(PROJECTS_CHANGED_EVENT, () => {
    handler();
  });
  return unlisten;
}

async function focusMainWindow(): Promise<void> {
  const current = getCurrentWindow();
  const windows = await getAllWebviewWindows();
  const main =
    windows.find((window) => window.label === "main") ??
    windows.find((window) => window.label !== current.label);
  if (!main || main.label === current.label) {
    return;
  }
  await main.show();
  await main.setFocus();
}
