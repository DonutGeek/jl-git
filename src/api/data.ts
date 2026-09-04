import {
  clearPersistedAgentIdentity,
  invalidateAgentIdentityStore,
} from "@/services/agent/agent.identity";
import {
  clearPersistedAgentPluginPrefs,
  invalidateAgentPluginsStore,
} from "@/services/agent/agent.plugins";
import { clearPersistedAiApiKeys, invalidateAiSettingsStore } from "@/services/ai/ai.settings";
import {
  clearPersistedGitIdentityAccounts,
  invalidateGitIdentityAccountsStore,
} from "@/api/git/accounts";
import { requestClient } from "@/utils/http";
import { clearPersistedSshKeys, invalidateSshKeysStore } from "@/api/ssh";

// 应用数据本地接口；地址小驼峰，adapter 转到 Tauri Command。

export type AppDataClearModule =
  | "agent_chats"
  | "multi_agent_chats"
  | "ai_secrets"
  | "git_accounts"
  | "multi_agent_identity"
  | "ui_prefs"
  | "open_tabs"
  | "all_app_data"
  /** 出厂重置：含已登记仓库/工作区与全部偏好、密钥等 */
  | "factory_reset";

export interface AppDataPaths {
  appDataDir: string;
  databasePath: string;
}

export interface AppDataUsage {
  path: string;
  totalBytes: number;
}

const EXACT_LOCAL_STORAGE_KEYS = [
  "jlgit-theme",
  "jlgit-app-theme-boot",
  "jlgit-locale",
  "jlgit-app-prefs",
  "jlgit-open-tabs",
  "jlgit:diff-view-prefs",
  "jlgit:branch-list-prefs",
  "jlgit:history-graph-width",
  "jlgit:history-view-prefs",
] as const;

const SPLIT_PREFIX = "jlgit:split:";

export function clearUiPrefsLocalStorage(): void {
  for (const key of EXACT_LOCAL_STORAGE_KEYS) {
    if (key === "jlgit-open-tabs") {
      continue;
    }
    window.localStorage.removeItem(key);
  }
  const toRemove: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(SPLIT_PREFIX)) {
      toRemove.push(key);
    }
  }
  for (const key of toRemove) {
    window.localStorage.removeItem(key);
  }
}

export function clearOpenTabsLocalStorage(): void {
  window.localStorage.removeItem("jlgit-open-tabs");
}

export async function getPaths(): Promise<AppDataPaths> {
  return requestClient.post<AppDataPaths>("appDataPaths");
}

/** 应用数据目录占用（性能页低频刷新） */
export async function getAppDataUsage(): Promise<AppDataUsage> {
  return requestClient.post<AppDataUsage>("appDataUsage");
}

export async function reveal(target: "dir" | "database"): Promise<void> {
  await requestClient.post<{ ok: boolean }>("appDataReveal", {
    input: { target },
  });
}

export async function clearModule(module: AppDataClearModule): Promise<void> {
  const clearsUiPrefs =
    module === "ui_prefs" || module === "all_app_data" || module === "factory_reset";
  const clearsOpenTabs =
    module === "open_tabs" || module === "all_app_data" || module === "factory_reset";
  const clearsGitAccounts =
    module === "git_accounts" || module === "all_app_data" || module === "factory_reset";
  const clearsAiSecrets =
    module === "ai_secrets" || module === "all_app_data" || module === "factory_reset";
  const clearsAgentIdentity =
    module === "multi_agent_identity" || module === "all_app_data" || module === "factory_reset";
  const clearsAllStores = module === "all_app_data" || module === "factory_reset";

  if (clearsUiPrefs) {
    clearUiPrefsLocalStorage();
  }
  if (clearsOpenTabs) {
    clearOpenTabsLocalStorage();
  }

  // 先清空 LazyStore 内存并落盘，再让 Rust 删除文件，最后丢弃单例，避免旧缓存写回
  if (clearsGitAccounts) {
    await clearPersistedGitIdentityAccounts();
  }
  if (clearsAiSecrets) {
    await clearPersistedAiApiKeys();
  }
  if (clearsAgentIdentity) {
    await clearPersistedAgentIdentity();
  }
  if (clearsAllStores) {
    await clearPersistedSshKeys();
    await clearPersistedAgentPluginPrefs();
  }

  await requestClient.post<{ ok: boolean }>("appDataClear", {
    input: { module },
  });

  if (clearsGitAccounts) {
    invalidateGitIdentityAccountsStore();
  }
  if (clearsAiSecrets) {
    invalidateAiSettingsStore();
  }
  if (clearsAgentIdentity) {
    invalidateAgentIdentityStore();
  }
  if (clearsAllStores) {
    invalidateSshKeysStore();
    invalidateAgentPluginsStore();
  }
}

// 备份导出/导入随 SQLite → PostgreSQL 迁移下线：整库快照要改用 pg_dump / pg_restore。
// Rust 侧仍保留 appDataExport / appDataImport 两个 Command，对旧调用方返回明确的不支持错误。
