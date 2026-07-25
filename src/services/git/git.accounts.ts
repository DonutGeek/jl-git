import { LazyStore } from "@tauri-apps/plugin-store";

import i18n from "@/i18n";
import { getGlobalIdentity, setGlobalIdentity } from "@/services/git/git.identity";
import { isRecord } from "@/types/error";
import { hasConfiguredGitIdentity } from "@/utils/gitIdentity";

const STORE_FILE = "git-accounts.json";
const ACCOUNTS_KEY = "accounts";
/** 是否已完成过「从全局 git 播种」尝试结果落盘（成功导入或用户已清空账号） */
const SEEDED_KEY = "seededFromGlobal";

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

/**
 * 列出 Git 账号。
 * 首次（列表为空且尚未播种）时，若本机全局 git 已有 name+email，则自动导入一条并启用。
 */
export async function listGitIdentityAccounts(): Promise<GitIdentityAccount[]> {
  const store = await getStore();
  const saved = await store.get<unknown>(ACCOUNTS_KEY);
  const accounts = ensureSingleEnabled(parseAccounts(saved));
  if (accounts.length > 0) {
    return accounts;
  }

  const alreadySeeded = (await store.get<unknown>(SEEDED_KEY)) === true;
  if (alreadySeeded) {
    return [];
  }

  return seedFromGlobalIdentityIfPossible(store);
}

/**
 * 启动时调用：播种账号（若需要），并把启用账号同步到 `git config --global`。
 * 提交校验读的是本机 git 配置，不能只写应用内 Store。
 */
export async function ensureGitIdentityBootstrapped(): Promise<GitIdentityAccount[]> {
  const accounts = await listGitIdentityAccounts();
  const enabled = accounts.find((item) => item.enabled);
  if (!enabled || !hasConfiguredGitIdentity(enabled)) {
    return accounts;
  }

  try {
    const global = await getGlobalIdentity();
    const sameName = (global.name?.trim() ?? "") === enabled.name;
    const sameEmail = (global.email?.trim() ?? "") === enabled.email;
    if (!sameName || !sameEmail) {
      await setGlobalIdentity({ name: enabled.name, email: enabled.email });
    }
  } catch (error) {
    console.warn("[git.accounts] sync enabled account to global failed", error);
  }

  return accounts;
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
    // 用户主动清空：标记已播种，避免再次从全局 git 自动填回
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
 * 列表为空且尚未播种时：读取全局 git identity，完整则写入一条启用账号。
 * 不写回 git config（只读导入）。本机尚无身份时不打播种标记，下次再试。
 */
async function seedFromGlobalIdentityIfPossible(
  store: LazyStore,
): Promise<GitIdentityAccount[]> {
  try {
    const identity = await getGlobalIdentity();
    if (!hasConfiguredGitIdentity(identity)) {
      return [];
    }

    const name = identity.name?.trim() ?? "";
    const email = identity.email?.trim() ?? "";
    const seeded: GitIdentityAccount = {
      id: crypto.randomUUID(),
      name,
      email,
      enabled: true,
      createdAt: new Date().toISOString(),
    };
    await store.set(ACCOUNTS_KEY, [seeded]);
    await store.set(SEEDED_KEY, true);
    await store.save();
    return [seeded];
  } catch (error) {
    console.warn("[git.accounts] seed from global identity failed", error);
    return [];
  }
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
  // 任意落盘（含清空）都视为已处理过播种，避免用户删光后又被自动填回
  await store.set(SEEDED_KEY, true);
  await store.save();
}

/** 清空磁盘中的 Git 账号列表（出厂重置 / 清理模块用） */
export async function clearPersistedGitIdentityAccounts(): Promise<void> {
  const store = await getStore();
  await store.set(ACCOUNTS_KEY, []);
  // 出厂重置后允许再次从本机 git 自动导入
  await store.set(SEEDED_KEY, false);
  await store.save();
}

/** 丢弃 LazyStore 单例，下次读取从磁盘重新加载 */
export function invalidateGitIdentityAccountsStore(): void {
  storePromise = null;
}
