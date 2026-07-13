import { invokeCommand } from "@/services/invoke";

import { FsFileSizeResult, FsListResult } from "@/types/git";

/** 列出仓库内相对目录一层子项 */
export async function listDir(
  repoPath: string,
  relative = "",
): Promise<FsListResult> {
  return invokeCommand<FsListResult>("fs_list_dir", {
    path: repoPath,
    relative: relative || null,
  });
}

/** 读取仓库内相对文件大小（工作区优先；已删则回退 HEAD / index） */
export async function getFileSize(
  repoPath: string,
  filePath: string,
): Promise<FsFileSizeResult> {
  return invokeCommand<FsFileSizeResult>("fs_file_size", {
    path: repoPath,
    filePath,
  });
}
