import { ensureGitIdentityBootstrapped } from "@/services/git/git.accounts";
import { syncLocalSshKeys } from "@/services/ssh/ssh.keys";

let bootstrapPromise: Promise<void> | null = null;
let bootstrapped = false;

/**
 * 主窗冷启动：识别本机 Git 身份与 SSH 密钥（不依赖打开设置页）。
 * - Git：从全局 git config 播种账号列表，并确保启用项写回 config（提交依赖后者）
 * - SSH：扫描 ~/.ssh 并登记尚未在列表中的密钥
 */
export async function applyLocalMachineBootstrap(): Promise<void> {
  if (bootstrapped) {
    return;
  }
  if (!bootstrapPromise) {
    bootstrapPromise = runBootstrap().finally(() => {
      bootstrapped = true;
    });
  }
  await bootstrapPromise;
}

async function runBootstrap(): Promise<void> {
  // 并行：身份与 SSH 互不依赖
  const results = await Promise.allSettled([ensureGitIdentityBootstrapped(), syncLocalSshKeys()]);

  for (const result of results) {
    if (result.status === "rejected") {
      console.warn("[localMachineBootstrap] step failed", result.reason);
    }
  }
}
