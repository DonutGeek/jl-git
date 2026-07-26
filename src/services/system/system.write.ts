import { save } from "@tauri-apps/plugin-dialog";

import { invokeCommand } from "@/services/invoke";

/** 将文本写入绝对路径 */
export async function writeTextFile(path: string, contents: string): Promise<void> {
  await invokeCommand<{ ok: boolean }>("system_write_text_file", { path, contents });
}

/** 弹出另存为对话框并写入文本；取消则返回 null */
export async function exportTextFile(options: {
  contents: string;
  defaultPath: string;
  filterName: string;
  extensions: string[];
}): Promise<string | null> {
  const destPath = await save({
    defaultPath: options.defaultPath,
    filters: [
      {
        name: options.filterName,
        extensions: options.extensions,
      },
    ],
  });
  if (!destPath) {
    return null;
  }
  await writeTextFile(destPath, options.contents);
  return destPath;
}
