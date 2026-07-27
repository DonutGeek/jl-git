import { invokeCommand } from "@/services/invoke";
import type { GitIdentity } from "@/types/git";

export async function getIdentity(repoPath: string): Promise<GitIdentity> {
  return invokeCommand<GitIdentity>("git_identity", { path: repoPath });
}

export async function getGlobalIdentity(): Promise<GitIdentity> {
  return invokeCommand<GitIdentity>("git_identity_global");
}

/** 写入全局 user.name / user.email（未传的字段不改） */
export async function setGlobalIdentity(options: {
  name?: string;
  email?: string;
}): Promise<GitIdentity> {
  return invokeCommand<GitIdentity>("git_identity_global_set", {
    name: options.name,
    email: options.email,
  });
}
