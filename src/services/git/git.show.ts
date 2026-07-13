import { invokeCommand } from "@/services/invoke";

import {
  GitCommitChangeSizeResult,
  GitContainingBranchesResult,
  GitLsTreeResult,
  GitShowResult,
} from "@/types/git";

/** 读取单提交详情（含相对各 parent 的改动文件） */
export async function getCommit(repoPath: string, rev: string): Promise<GitShowResult> {
  return invokeCommand<GitShowResult>("git_show", {
    path: repoPath,
    rev,
  });
}

/** 列出某提交树下全部文件路径（历史详情「显示所有文件」） */
export async function listTree(repoPath: string, rev: string): Promise<GitLsTreeResult> {
  return invokeCommand<GitLsTreeResult>("git_ls_tree", {
    path: repoPath,
    rev,
  });
}

/** 包含该提交的分支列表（历史详情「显示分支」） */
export async function getContainingBranches(
  repoPath: string,
  rev: string,
): Promise<GitContainingBranchesResult> {
  return invokeCommand<GitContainingBranchesResult>("git_commit_containing_branches", {
    path: repoPath,
    rev,
  });
}

/** 改动文件数与 blob 总大小（历史详情「显示大小」） */
export async function getCommitChangeSize(
  repoPath: string,
  rev: string,
): Promise<GitCommitChangeSizeResult> {
  return invokeCommand<GitCommitChangeSizeResult>("git_commit_change_size", {
    path: repoPath,
    rev,
  });
}
