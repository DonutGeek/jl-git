export * from "./git.branch";
export * from "./git.branch-compare";
export * from "./git.commit";
export * from "./git.diff";
export * from "./git.fs";
export * from "./git.identity";
export * from "./git.log";
export * from "./git.merge";
export * from "./git.remote";
export * from "./git.show";
export * from "./git.status";
export * from "./git.tag";

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
import { merge } from "./git.merge";
import { fetch, listRemotes, pull, push } from "./git.remote";
import {
  getCommit,
  getCommitChangeSize,
  getCommitMessage,
  getContainingBranches,
  listTree,
} from "./git.show";
import { getStatus } from "./git.status";
import { createTag, deleteTag, listTags } from "./git.tag";

export const gitService = {
  getStatus,
  getIdentity,
  getGlobalIdentity,
  setGlobalIdentity,
  listBranches,
  listTags,
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
  merge,
  checkout,
  createBranch,
  deleteBranch,
  renameBranch,
  createTag,
  deleteTag,
  fetch,
  pull,
  push,
  listRemotes,
};
