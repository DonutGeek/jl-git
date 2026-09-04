import { requestClient } from "@/utils/http";

/** 钩子工具链探测结果（含当前注入后的 PATH） */
export interface HookToolchainProbe {
  nodePath: string | null;
  nodeVersion: string | null;
  pathUsed: string;
  extraDirs: string[];
}

/** 首次启动发现的 node bin 目录 */
export interface DiscoverNodeBinResult {
  binDir: string | null;
  nodePath: string | null;
  nodeVersion: string | null;
}

/** 将额外 PATH 目录同步到 Rust（Git 子进程 / husky 继承） */
export async function setGitExtraPath(dirs: string): Promise<string[]> {
  return requestClient.post<string[]>("gitSetExtraPath", { dirs });
}

/** 在当前（含额外 PATH）环境下探测 node */
export async function probeHookToolchain(): Promise<HookToolchainProbe> {
  return requestClient.post<HookToolchainProbe>("gitProbeHookToolchain");
}

/** 发现本机 node 所在 bin 目录（PATH + nvm/fnm/Homebrew 等常见位置） */
export async function discoverNodeBin(): Promise<DiscoverNodeBinResult> {
  return requestClient.post<DiscoverNodeBinResult>("gitDiscoverNodeBin");
}
