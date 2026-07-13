import { invokeCommand } from "@/services/invoke";

/** 在文件管理器中打开目录（macOS 访达 / Windows 资源管理器） */
export async function revealInFileManager(path: string): Promise<void> {
  await invokeCommand<{ ok: boolean }>("system_reveal_in_file_manager", { path });
}

/** 用本机编辑器打开目录（Cursor / VS Code 等） */
export async function openInEditor(path: string): Promise<void> {
  await invokeCommand<{ ok: boolean }>("system_open_in_editor", { path });
}

/** 打开系统默认终端，工作目录为 path（仓库根） */
export async function openTerminal(path: string): Promise<void> {
  await invokeCommand<{ ok: boolean }>("system_open_terminal", { path });
}

export const systemOpenService = {
  revealInFileManager,
  openInEditor,
  openTerminal,
};
