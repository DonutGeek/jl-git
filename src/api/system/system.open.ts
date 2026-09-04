import { requestClient } from "@/utils/http";
import { detectAppOs } from "@/services/window/windowChrome";
import { useAppPrefsStoreWithOut } from "@/store/modules/app";
import { coerceShellPreference } from "@/utils/externalToolsPrefs";

/** 在文件管理器中显示文件或目录（macOS 访达 / Windows 资源管理器 / Linux 文件管理器） */
export async function revealInFileManager(path: string): Promise<void> {
  await requestClient.post<{ ok: boolean }>("systemRevealInFileManager", { path });
}

/** 用本机编辑器打开文件或目录（读取设置中的偏好） */
export async function openInEditor(path: string): Promise<void> {
  const { externalEditor, externalEditorPath } = useAppPrefsStoreWithOut();
  await requestClient.post<{ ok: boolean }>("systemOpenInEditor", {
    path,
    preference: externalEditor || "auto",
    customPath: externalEditor === "custom" ? externalEditorPath.trim() || null : null,
  });
}

/** 使用系统默认程序打开文件或目录 */
export async function openWithDefaultApp(path: string): Promise<void> {
  await requestClient.post<{ ok: boolean }>("systemOpenWithDefaultApp", { path });
}

/** 打开终端，工作目录为 path（读取设置中的偏好） */
export async function openTerminal(path: string): Promise<void> {
  const { shell, shellPath } = useAppPrefsStoreWithOut();
  const preference = coerceShellPreference(detectAppOs(), shell);
  await requestClient.post<{ ok: boolean }>("systemOpenTerminal", {
    path,
    preference,
    customPath: preference === "custom" ? shellPath.trim() || null : null,
  });
}

export const systemOpenService = {
  revealInFileManager,
  openInEditor,
  openWithDefaultApp,
  openTerminal,
};
