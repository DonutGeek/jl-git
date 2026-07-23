import { save, open } from "@tauri-apps/plugin-dialog";

import { clearPersistedAgentIdentity, invalidateAgentIdentityStore } from "@/services/agent/agent.identity";
import {
  clearPersistedAgentPluginPrefs,
  invalidateAgentPluginsStore,
} from "@/services/agent/agent.plugins";
import {
  clearPersistedAiApiKeys,
  invalidateAiSettingsStore,
} from "@/services/ai/ai.settings";
import {
  clearPersistedGitIdentityAccounts,
  invalidateGitIdentityAccountsStore,
} from "@/services/git/git.accounts";
import { invokeCommand } from "@/services/invoke";
import {
  clearPersistedSshKeys,
  invalidateSshKeysStore,
} from "@/services/ssh/ssh.keys";

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

export interface AppDataImportResult {
  ok: boolean;
  localStorage: Record<string, string>;
  requiresRestart: boolean;
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

/** 采集约定 localStorage（供备份） */
export function collectLocalStorageSnapshot(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of EXACT_LOCAL_STORAGE_KEYS) {
    const value = window.localStorage.getItem(key);
    if (value != null) {
      result[key] = value;
    }
  }
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(SPLIT_PREFIX)) {
      const value = window.localStorage.getItem(key);
      if (value != null) {
        result[key] = value;
      }
    }
  }
  return result;
}

/** 将备份中的 localStorage 写回 */
export function applyLocalStorageSnapshot(
  snapshot: Record<string, string>,
): void {
  for (const [key, value] of Object.entries(snapshot)) {
    if (typeof value === "string") {
      window.localStorage.setItem(key, value);
    }
  }
}

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
  return invokeCommand<AppDataPaths>("app_data_paths");
}

/** 应用数据目录占用（性能页低频刷新） */
export async function getAppDataUsage(): Promise<AppDataUsage> {
  return invokeCommand<AppDataUsage>("app_data_usage");
}

export async function reveal(target: "dir" | "database"): Promise<void> {
  await invokeCommand<{ ok: boolean }>("app_data_reveal", {
    input: { target },
  });
}

export async function clearModule(module: AppDataClearModule): Promise<void> {
  const clearsUiPrefs =
    module === "ui_prefs" ||
    module === "all_app_data" ||
    module === "factory_reset";
  const clearsOpenTabs =
    module === "open_tabs" ||
    module === "all_app_data" ||
    module === "factory_reset";
  const clearsGitAccounts =
    module === "git_accounts" ||
    module === "all_app_data" ||
    module === "factory_reset";
  const clearsAiSecrets =
    module === "ai_secrets" ||
    module === "all_app_data" ||
    module === "factory_reset";
  const clearsAgentIdentity =
    module === "multi_agent_identity" ||
    module === "all_app_data" ||
    module === "factory_reset";
  const clearsAllStores =
    module === "all_app_data" || module === "factory_reset";

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

  await invokeCommand<{ ok: boolean }>("app_data_clear", {
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

export async function exportBackup(): Promise<string | null> {
  const destPath = await save({
    defaultPath: `jlgit-backup-${new Date().toISOString().slice(0, 10)}.zip`,
    filters: [
      {
        name: "JLGit Backup",
        extensions: ["zip"],
      },
    ],
  });
  if (!destPath) {
    return null;
  }
  await invokeCommand<{ ok: boolean }>("app_data_export", {
    input: {
      destPath,
      localStorage: collectLocalStorageSnapshot(),
    },
  });
  return destPath;
}

export async function importBackup(): Promise<AppDataImportResult | null> {
  const sourcePath = await open({
    multiple: false,
    filters: [
      {
        name: "JLGit Backup",
        extensions: ["zip"],
      },
    ],
  });
  if (!sourcePath || Array.isArray(sourcePath)) {
    return null;
  }
  const result = await invokeCommand<{
    ok: boolean;
    localStorage: Record<string, unknown>;
    requiresRestart: boolean;
  }>("app_data_import", {
    input: { sourcePath },
  });

  const snapshot: Record<string, string> = {};
  for (const [key, value] of Object.entries(result.localStorage ?? {})) {
    if (typeof value === "string") {
      snapshot[key] = value;
    } else if (value != null) {
      snapshot[key] = JSON.stringify(value);
    }
  }
  applyLocalStorageSnapshot(snapshot);

  return {
    ok: result.ok,
    localStorage: snapshot,
    requiresRestart: result.requiresRestart,
  };
}
