import { requestClient } from "@/utils/http";

import type {
  GitCommitChangeSizeResult,
  GitCommitMessageResult,
  GitContainingBranchesResult,
  GitLsTreeResult,
  GitShowResult,
} from "@/types/git";

/** 读取单提交详情（含相对各 parent 的改动文件） */
export async function getCommit(repoPath: string, rev: string): Promise<GitShowResult> {
  return requestClient.post<GitShowResult>("gitShow", {
    path: repoPath,
    rev,
  });
}

/** 读取单提交完整文案（标题与正文），不加载 diff。 */
export async function getCommitMessage(
  repoPath: string,
  rev: string,
): Promise<GitCommitMessageResult> {
  return requestClient.post<GitCommitMessageResult>("gitCommitMessage", {
    path: repoPath,
    rev,
  });
}

/** 列出某提交树下全部文件路径（历史详情「显示所有文件」） */
export async function listTree(repoPath: string, rev: string): Promise<GitLsTreeResult> {
  return requestClient.post<GitLsTreeResult>("gitLsTree", {
    path: repoPath,
    rev,
  });
}

/** 包含该提交的分支列表（历史详情「显示分支」） */
export async function getContainingBranches(
  repoPath: string,
  rev: string,
): Promise<GitContainingBranchesResult> {
  return requestClient.post<GitContainingBranchesResult>("gitCommitContainingBranches", {
    path: repoPath,
    rev,
  });
}

/** 改动文件数与 blob 总大小（历史详情「显示大小」） */
export async function getCommitChangeSize(
  repoPath: string,
  rev: string,
): Promise<GitCommitChangeSizeResult> {
  return requestClient.post<GitCommitChangeSizeResult>("gitCommitChangeSize", {
    path: repoPath,
    rev,
  });
}
