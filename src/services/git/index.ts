export * from "./git.blame";
export * from "./git.branch";
export * from "./git.branch-compare";
export * from "./git.commit";
export * from "./git.conflict";
export * from "./git.clone";
export * from "./git.diff";
export * from "./git.fs";
export * from "./git.grep";
export * from "./git.accounts";
export * from "./git.identity";
export * from "./git.log";
export * from "./git.merge";
export * from "./git.path";
export * from "./git.remote";
export * from "./git.show";
export * from "./git.stash";
export * from "./git.status";
export * from "./git.tag";
export * from "./git.version";

import { getBlame } from "./git.blame";
import { checkout, createBranch, deleteBranch, listBranches, renameBranch } from "./git.branch";
import { getBranchCompare, getBranchFileDiff } from "./git.branch-compare";
import {
  amendMessage,
  commit,
  discard,
  stage,
  stageAll,
  undoCommit,
  unstage,
  unstageAll,
} from "./git.commit";
import {
  conflictMarkResolved,
  conflictTake,
  getRepoState,
  readWorktreeFile,
  writeWorktreeFile,
} from "./git.conflict";
import {
  getCommitFileDiff,
  getCommitPatchDiff,
  getDiff,
  getFileMedia,
  getStagedDiff,
} from "./git.diff";
import { createPath, getFileSize, listDir, removePath, renamePath } from "./git.fs";
import { searchCode } from "./git.grep";
import {
  createGitIdentityAccount,
  deleteGitIdentityAccount,
  ensureGitIdentityBootstrapped,
  listGitIdentityAccounts,
  setGitIdentityAccountEnabled,
  updateGitIdentityAccount,
} from "./git.accounts";
import { getGlobalIdentity, getIdentity, setGlobalIdentity } from "./git.identity";
import { getLog } from "./git.log";
import { cloneRepository } from "./git.clone";
import { merge } from "./git.merge";
import { fetch, listRemotes, pull, push } from "./git.remote";
import {
  getCommit,
  getCommitChangeSize,
  getCommitMessage,
  getContainingBranches,
  listTree,
} from "./git.show";
import { listStash, restoreLintStagedBackup, stashApply } from "./git.stash";
import { getStatus } from "./git.status";
import {
  createTag,
  deleteRemoteTag,
  deleteTag,
  fetchRemoteTag,
  listRemoteTags,
  listTags,
  pushTag,
} from "./git.tag";

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
