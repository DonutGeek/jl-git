import { invokeCommand } from "@/services/invoke";

import type {
  FsCreateResult,
  FsFileSizeResult,
  FsListResult,
  FsRenameResult,
  OkResult,
} from "@/types/git";

/** 列出仓库内相对目录一层子项 */
export async function listDir(repoPath: string, relative = ""): Promise<FsListResult> {
  return invokeCommand<FsListResult>("fs_list_dir", {
    path: repoPath,
    relative: relative || null,
  });
}

/** 读取仓库内相对文件大小（工作区优先；已删则回退 HEAD / index） */
export async function getFileSize(repoPath: string, filePath: string): Promise<FsFileSizeResult> {
  return invokeCommand<FsFileSizeResult>("fs_file_size", {
    path: repoPath,
    filePath,
  });
}

/** 删除仓库内相对文件或目录 */
export async function removePath(repoPath: string, relative: string): Promise<OkResult> {
  return invokeCommand<OkResult>("fs_remove", {
    path: repoPath,
    relative,
  });
}

/** 在同一父目录下重命名（newName 仅为文件名） */
export async function renamePath(
  repoPath: string,
  from: string,
  newName: string,
): Promise<FsRenameResult> {
  return invokeCommand<FsRenameResult>("fs_rename", {
    path: repoPath,
    from,
    newName,
  });
}

/** 在父目录下新建空目录或空文件（name 仅为文件名） */
export async function createPath(
  repoPath: string,
  parent: string,
  name: string,
  isDir: boolean,
): Promise<FsCreateResult> {
  return invokeCommand<FsCreateResult>("fs_create", {
    path: repoPath,
    parent: parent || null,
    name,
    isDir,
  });
}
