export * from "./git.branch";
export * from "./git.commit";
export * from "./git.diff";
export * from "./git.fs";
export * from "./git.identity";
export * from "./git.log";
export * from "./git.remote";
export * from "./git.show";
export * from "./git.status";

import { checkout, createBranch, listBranches } from "./git.branch";
import {
  commit,
  stage,
  stageAll,
  unstage,
  unstageAll,
} from "./git.commit";
import { getDiff } from "./git.diff";
import { getFileSize, listDir } from "./git.fs";
import { getGlobalIdentity, getIdentity, setGlobalIdentity } from "./git.identity";
import { getLog } from "./git.log";
import { fetch, pull, push } from "./git.remote";
import { getCommit } from "./git.show";
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
  getDiff,
  stage,
  unstage,
  stageAll,
  unstageAll,
  commit,
  checkout,
  createBranch,
  fetch,
  pull,
  push,
};
