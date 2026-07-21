import { LazyStore } from "@tauri-apps/plugin-store";

import i18n from "@/i18n";
import { setGlobalIdentity } from "@/services/git/git.identity";
import { isRecord } from "@/types/error";

const STORE_FILE = "git-accounts.json";
const ACCOUNTS_KEY = "accounts";

/** 应用内登记的 Git 提交身份（启用项会同步到 git config --global） */
export interface GitIdentityAccount {
  id: string;
  name: string;
  email: string;
  enabled: boolean;
  createdAt: string;
}

let storePromise: Promise<LazyStore> | null = null;

function getStore(): Promise<LazyStore> {
  if (!storePromise) {
    storePromise = Promise.resolve(new LazyStore(STORE_FILE));
  }
  return storePromise;
}

/** 列出 Git 账号；未配置时为空列表（不从全局 git / 旧插件自动播种）。 */
export async function listGitIdentityAccounts(): Promise<GitIdentityAccount[]> {
  const store = await getStore();
  const saved = await store.get<unknown>(ACCOUNTS_KEY);
  return ensureSingleEnabled(parseAccounts(saved));
}

/** 创建并启用账号；同时写入 git config --global。 */
export async function createGitIdentityAccount(
  name: string,
  email: string,
): Promise<GitIdentityAccount[]> {
  const trimmedName = name.trim();
  const trimmedEmail = email.trim();
  if (!trimmedName || !trimmedEmail) {
    throw new Error(i18n.t("settings.gitAccountRequired"));
  }

  const accounts = await listGitIdentityAccounts();
  if (hasDuplicate(accounts, trimmedName, trimmedEmail)) {
    throw new Error(i18n.t("settings.gitAccountDuplicate"));
  }

  const next: GitIdentityAccount[] = [
    ...accounts.map((item) => ({ ...item, enabled: false })),
    {
      id: crypto.randomUUID(),
      name: trimmedName,
      email: trimmedEmail,
      enabled: true,
      createdAt: new Date().toISOString(),
    },
  ];
  await setGlobalIdentity({ name: trimmedName, email: trimmedEmail });
  await saveAccounts(next);
  return next;
}

/** 启用账号时禁用其它项，并同步全局 git config。 */
export async function setGitIdentityAccountEnabled(
  id: string,
  enabled: boolean,
): Promise<GitIdentityAccount[]> {
  const accounts = await listGitIdentityAccounts();
  const target = accounts.find((item) => item.id === id);
  if (!target) {
    return accounts;
  }

  if (enabled) {
    await setGlobalIdentity({ name: target.name, email: target.email });
    const next = accounts.map((item) => ({
      ...item,
      enabled: item.id === id,
    }));
    await saveAccounts(next);
    return next;
  }

  const enabledCount = accounts.filter((item) => item.enabled).length;
  if (target.enabled && enabledCount <= 1) {
    throw new Error(i18n.t("settings.gitAccountNeedOneEnabled"));
  }

  const next = accounts.map((item) =>
    item.id === id ? { ...item, enabled: false } : item,
  );
  await saveAccounts(next);
  return next;
}

/** 修改账号名/邮箱；若当前启用则同步全局 config。 */
export async function updateGitIdentityAccount(
  id: string,
  name: string,
  email: string,
): Promise<GitIdentityAccount[]> {
  const trimmedName = name.trim();
  const trimmedEmail = email.trim();
  if (!trimmedName || !trimmedEmail) {
    throw new Error(i18n.t("settings.gitAccountRequired"));
  }

  const accounts = await listGitIdentityAccounts();
  if (hasDuplicate(accounts, trimmedName, trimmedEmail, id)) {
    throw new Error(i18n.t("settings.gitAccountDuplicate"));
  }

  const next = accounts.map((item) =>
    item.id === id ? { ...item, name: trimmedName, email: trimmedEmail } : item,
  );
  const updated = next.find((item) => item.id === id);
  if (updated?.enabled) {
    await setGlobalIdentity({ name: trimmedName, email: trimmedEmail });
  }
  await saveAccounts(next);
  return next;
}

/** 删除账号；删启用项时自动启用下一项并同步全局 config。 */
export async function deleteGitIdentityAccount(
  id: string,
): Promise<GitIdentityAccount[]> {
  const accounts = await listGitIdentityAccounts();
  const removing = accounts.find((item) => item.id === id);
  const next = accounts.filter((item) => item.id !== id);
  if (!removing) {
    return accounts;
  }

  if (next.length === 0) {
    await saveAccounts([]);
    return [];
  }

  if (removing.enabled || !next.some((item) => item.enabled)) {
    const [first, ...rest] = next;
    if (!first) {
      await saveAccounts([]);
      return [];
    }
    await setGlobalIdentity({ name: first.name, email: first.email });
    const promoted = [
      { ...first, enabled: true },
      ...rest.map((item) => ({ ...item, enabled: false })),
    ];
    await saveAccounts(promoted);
    return promoted;
  }

  await saveAccounts(next);
  return next;
}

/**
 * 供多仓鲸灵简历插件等只读消费：返回设置中配置的全部 Git 账号。
 * 故意忽略 enabled——启用/停用只同步 git config --global，不限制简历匹配。
 */
export async function listAllGitAuthorsForMatching(): Promise<
  Array<{ name: string; email: string }>
> {
  const accounts = await listGitIdentityAccounts();
  return accounts.map((item) => ({ name: item.name, email: item.email }));
}

function hasDuplicate(
  accounts: readonly GitIdentityAccount[],
  name: string,
  email: string,
  excludeId?: string,
): boolean {
  const nameLower = name.toLowerCase();
  const emailLower = email.toLowerCase();
  return accounts.some(
    (item) =>
      item.id !== excludeId &&
      item.name.toLowerCase() === nameLower &&
      item.email.toLowerCase() === emailLower,
  );
}

function ensureSingleEnabled(accounts: GitIdentityAccount[]): GitIdentityAccount[] {
  const enabled = accounts.filter((item) => item.enabled);
  if (enabled.length <= 1) {
    return accounts;
  }
  const keepId = enabled[0]?.id;
  return accounts.map((item) => ({
    ...item,
    enabled: item.id === keepId,
  }));
}

function parseAccounts(value: unknown): GitIdentityAccount[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    if (
      typeof item.id !== "string" ||
      typeof item.name !== "string" ||
      typeof item.email !== "string" ||
      typeof item.createdAt !== "string" ||
      typeof item.enabled !== "boolean"
    ) {
      return [];
    }
    return [
      {
        id: item.id,
        name: item.name.trim(),
        email: item.email.trim(),
        enabled: item.enabled,
        createdAt: item.createdAt,
      },
    ];
  });
}

async function saveAccounts(accounts: GitIdentityAccount[]): Promise<void> {
  const store = await getStore();
  await store.set(ACCOUNTS_KEY, accounts);
  await store.save();
}

/** 清空磁盘中的 Git 账号列表（出厂重置 / 清理模块用） */
export async function clearPersistedGitIdentityAccounts(): Promise<void> {
  const store = await getStore();
  await store.set(ACCOUNTS_KEY, []);
  await store.save();
}

/** 丢弃 LazyStore 单例，下次读取从磁盘重新加载 */
export function invalidateGitIdentityAccountsStore(): void {
  storePromise = null;
}
