// Git 本地接口；地址小驼峰，adapter 转到 Tauri Command。

export * from "./blame";
export * from "./branch";
export * from "./branch-compare";
export * from "./commit";
export * from "./conflict";
export * from "./clone";
export * from "./diff";
export * from "./fs";
export * from "./grep";
export * from "./accounts";
export * from "./identity";
export * from "./log";
export * from "./merge";
export * from "./path";
export * from "./remote";
export * from "./show";
export * from "./stash";
export * from "./status";
export * from "./tag";
export * from "./version";

import { getBlame } from "./blame";
import { checkout, createBranch, deleteBranch, listBranches, renameBranch } from "./branch";
import { getBranchCompare, getBranchFileDiff } from "./branch-compare";
import {
  amendMessage,
  commit,
  discard,
  stage,
  stageAll,
  undoCommit,
  unstage,
  unstageAll,
} from "./commit";
import {
  abortOperation,
  conflictMarkResolved,
  conflictTake,
  getRepoState,
  readWorktreeFile,
  writeWorktreeFile,
} from "./conflict";
import {
  getCommitFileDiff,
  getCommitPatchDiff,
  getDiff,
  getFileMedia,
  getStagedDiff,
} from "./diff";
import { createPath, getFileSize, listDir, removePath, renamePath } from "./fs";
import { searchCode } from "./grep";
import {
  createGitIdentityAccount,
  deleteGitIdentityAccount,
  ensureGitIdentityBootstrapped,
  listGitIdentityAccounts,
  setGitIdentityAccountEnabled,
  updateGitIdentityAccount,
} from "./accounts";
import { getGlobalIdentity, getIdentity, setGlobalIdentity } from "./identity";
import { getLog } from "./log";
import { cloneRepository } from "./clone";
import { merge } from "./merge";
import { fetch, listRemotes, pull, push } from "./remote";
import {
  getCommit,
  getCommitChangeSize,
  getCommitMessage,
  getContainingBranches,
  listTree,
} from "./show";
import { listStash, restoreLintStagedBackup, stashApply } from "./stash";
import { getStatus } from "./status";
import {
  createTag,
  deleteRemoteTag,
  deleteTag,
  fetchRemoteTag,
  listRemoteTags,
  listTags,
  pushTag,
} from "./tag";

export const gitService = {
  getBlame,
  getStatus,
  getIdentity,
  getGlobalIdentity,
  setGlobalIdentity,
  listGitIdentityAccounts,
  ensureGitIdentityBootstrapped,
  createGitIdentityAccount,
  setGitIdentityAccountEnabled,
  updateGitIdentityAccount,
  deleteGitIdentityAccount,
  listBranches,
  listTags,
  listRemoteTags,
  listDir,
  getFileSize,
  searchCode,
  removePath,
  renamePath,
  createPath,
  getLog,
  getCommit,
  getCommitMessage,
  listTree,
  getContainingBranches,
  getCommitChangeSize,
  getDiff,
  getFileMedia,
  getStagedDiff,
  getCommitPatchDiff,
  getCommitFileDiff,
  getBranchCompare,
  getBranchFileDiff,
  stage,
  unstage,
  stageAll,
  unstageAll,
  discard,
  commit,
  amendMessage,
  undoCommit,
  listStash,
  stashApply,
  restoreLintStagedBackup,
  merge,
  getRepoState,
  abortOperation,
  conflictTake,
  readWorktreeFile,
  writeWorktreeFile,
  conflictMarkResolved,
  checkout,
  createBranch,
  deleteBranch,
  renameBranch,
  createTag,
  deleteTag,
  pushTag,
  deleteRemoteTag,
  fetchRemoteTag,
  cloneRepository,
  fetch,
  pull,
  push,
  listRemotes,
};
