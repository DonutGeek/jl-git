import { requestClient } from "@/utils/http";

export interface GitVersionResult {
  version: string;
  path: string;
}

/** 探测本机 Git 版本与可执行路径 */
export async function getGitVersion(executable?: string): Promise<GitVersionResult> {
  return requestClient.post<GitVersionResult>("gitVersion", executable ? { executable } : {});
}
