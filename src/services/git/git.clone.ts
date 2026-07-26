import { invokeCommand } from "@/services/invoke";

import type { GitCloneResult } from "@/types/git";

/**
 * 克隆远端仓库到本地路径。
 * `path` 为克隆完成后的仓库目录（须尚不存在，其父目录须存在）。
 */
export async function cloneRepository(
  url: string,
  path: string,
): Promise<GitCloneResult> {
  return invokeCommand<GitCloneResult>("git_clone", {
    url: url.trim(),
    path: path.trim(),
  });
}
