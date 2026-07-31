import { open, save } from "@tauri-apps/plugin-dialog";

import { invokeCommand } from "@/services/invoke";

/** 将文本写入绝对路径 */
export async function writeTextFile(path: string, contents: string): Promise<void> {
  await invokeCommand<{ ok: boolean }>("system_write_text_file", { path, contents });
}

/** 读取绝对路径文本（默认后端上限 2 MiB） */
export async function readTextFile(path: string, maxBytes?: number): Promise<string> {
  const result = await invokeCommand<{ contents: string }>("system_read_text_file", {
    path,
    maxBytes,
  });
  return result.contents;
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

/** 弹出打开对话框并读取文本；取消则返回 null */
export async function importTextFile(options: {
  filterName: string;
  extensions: string[];
  maxBytes?: number;
}): Promise<{ path: string; contents: string } | null> {
  const sourcePath = await open({
    multiple: false,
    filters: [
      {
        name: options.filterName,
        extensions: options.extensions,
      },
    ],
  });
  if (!sourcePath || Array.isArray(sourcePath)) {
    return null;
  }
  const contents = await readTextFile(sourcePath, options.maxBytes);
  return { path: sourcePath, contents };
}
