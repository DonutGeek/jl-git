import type { GitIdentity } from "@/types/git";

/** 是否已配置可用于提交的 Git 身份（name + email 均非空） */
export function hasConfiguredGitIdentity(identity: GitIdentity | null | undefined): boolean {
  const name = identity?.name?.trim() ?? "";
  const email = identity?.email?.trim() ?? "";
  return name.length > 0 && email.length > 0;
}
