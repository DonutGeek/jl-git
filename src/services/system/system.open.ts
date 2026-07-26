import { invokeCommand } from "@/services/invoke";
import { detectAppOs } from "@/services/window/windowChrome";
import { useAppPrefsStore } from "@/store/useAppPrefsStore";
import { coerceShellPreference } from "@/utils/externalToolsPrefs";

/** 在文件管理器中显示文件或目录（macOS 访达 / Windows 资源管理器 / Linux 文件管理器） */
export async function revealInFileManager(path: string): Promise<void> {
  await invokeCommand<{ ok: boolean }>("system_reveal_in_file_manager", { path });
}

/** 用本机编辑器打开文件或目录（读取设置中的偏好） */
export async function openInEditor(path: string): Promise<void> {
  const { externalEditor, externalEditorPath } = useAppPrefsStore.getState();
  await invokeCommand<{ ok: boolean }>("system_open_in_editor", {
    path,
    preference: externalEditor || "auto",
    customPath: externalEditor === "custom" ? externalEditorPath.trim() || null : null,
  });
}

/** 使用系统默认程序打开文件或目录 */
export async function openWithDefaultApp(path: string): Promise<void> {
  await invokeCommand<{ ok: boolean }>("system_open_with_default_app", { path });
}

/** 打开终端，工作目录为 path（读取设置中的偏好） */
export async function openTerminal(path: string): Promise<void> {
  const { shell, shellPath } = useAppPrefsStore.getState();
  const preference = coerceShellPreference(detectAppOs(), shell);
  await invokeCommand<{ ok: boolean }>("system_open_terminal", {
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
