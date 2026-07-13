import { invokeCommand } from "@/services/invoke";

import { GitShowResult } from "@/types/git";

/** 读取单提交详情（含相对各 parent 的改动文件） */
export async function getCommit(repoPath: string, rev: string): Promise<GitShowResult> {
  return invokeCommand<GitShowResult>("git_show", {
    path: repoPath,
    rev,
  });
}
