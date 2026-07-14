export * from "./git.branch";
export * from "./git.branch-compare";
export * from "./git.commit";
export * from "./git.diff";
export * from "./git.fs";
export * from "./git.identity";
export * from "./git.log";
export * from "./git.remote";
export * from "./git.show";
export * from "./git.status";

import { checkout, createBranch, deleteBranch, listBranches, renameBranch } from "./git.branch";
import { getBranchCompare, getBranchFileDiff } from "./git.branch-compare";
import {
  commit,
  stage,
  stageAll,
  undoCommit,
  unstage,
  unstageAll,
} from "./git.commit";
import { getCommitFileDiff, getDiff, getStagedDiff } from "./git.diff";
import { getFileSize, listDir } from "./git.fs";
import { getGlobalIdentity, getIdentity, setGlobalIdentity } from "./git.identity";
import { getLog } from "./git.log";
import { fetch, listRemotes, pull, push } from "./git.remote";
import {
  getCommit,
  getCommitChangeSize,
  getCommitMessage,
  getContainingBranches,
  listTree,
} from "./git.show";
import { getStatus } from "./git.status";

export const gitService = {
  getStatus,
  getIdentity,
  getGlobalIdentity,
  setGlobalIdentity,
  listBranches,
  listDir,
  getFileSize,
  getLog,
  getCommit,
  getCommitMessage,
  listTree,
  getContainingBranches,
  getCommitChangeSize,
  getDiff,
  getStagedDiff,
  getCommitFileDiff,
  getBranchCompare,
  getBranchFileDiff,
  stage,
  unstage,
  stageAll,
  unstageAll,
  commit,
  undoCommit,
  checkout,
  createBranch,
  deleteBranch,
  renameBranch,
  fetch,
  pull,
  push,
  listRemotes,
};
