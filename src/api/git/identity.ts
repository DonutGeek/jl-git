import { requestClient } from "@/utils/http";

import type { GitIdentity } from "@/types/git";

/** 读取仓库内 user.name / user.email（含 local 覆盖） */
export async function getIdentity(repoPath: string): Promise<GitIdentity> {
  return requestClient.post<GitIdentity>("gitIdentity", { path: repoPath });
}

/** 读取本机全局 git 身份 */
export async function getGlobalIdentity(): Promise<GitIdentity> {
  return requestClient.post<GitIdentity>("gitIdentityGlobal");
}

/** 写入全局 user.name / user.email（未传的字段不改） */
export async function setGlobalIdentity(options: {
  name?: string;
  email?: string;
}): Promise<GitIdentity> {
  return requestClient.post<GitIdentity>("gitIdentityGlobalSet", {
    name: options.name,
    email: options.email,
  });
}
