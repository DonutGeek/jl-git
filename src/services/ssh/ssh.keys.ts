import { open } from "@tauri-apps/plugin-dialog";
import { LazyStore } from "@tauri-apps/plugin-store";

import i18n from "@/i18n";
import { invokeCommand } from "@/services/invoke";
import { isRecord } from "@/types/error";

const STORE_FILE = "ssh-keys.json";
const KEYS_KEY = "keys";

/** 密钥来源：generated 由 JLGit 新增；imported 为选择本地登记 */
export type SshKeyOrigin = "generated" | "imported";

/** 应用内登记的 SSH 密钥（不存私钥内容与口令） */
export interface SshKeyRecord {
  id: string;
  name: string;
  publicKey: string;
  privateKeyPath: string;
  /** 生成时是否设置了口令（仅标记，不存口令本身） */
  hasPassphrase: boolean;
  /** 是否为当前启用密钥（启用一项时自动禁用其它） */
  enabled: boolean;
  /** 来源；仅 generated 删除时会移除磁盘文件 */
  origin: SshKeyOrigin;
  createdAt: string;
}

interface SshKeyMaterial {
  name: string;
  publicKey: string;
  privateKeyPath: string;
  hasPassphrase: boolean;
}

export interface SshKeyScanResult {
  /** 本机 SSH 目录（三端经 Rust home_dir 解析） */
  sshDir: string;
  keys: SshKeyMaterial[];
}

export interface SyncLocalSshKeysResult {
  keys: SshKeyRecord[];
  /** 本次新登记数量 */
  importedCount: number;
  /** 扫描到的本地密钥总数 */
  scannedCount: number;
  sshDir: string;
}

/** 优先启用的常见密钥文件名（小写） */
const PREFERRED_KEY_NAMES = ["id_ed25519", "id_rsa", "id_ecdsa", "id_dsa"] as const;

let storePromise: Promise<LazyStore> | null = null;

function getStore(): Promise<LazyStore> {
  if (!storePromise) {
    storePromise = Promise.resolve(new LazyStore(STORE_FILE));
  }
  return storePromise;
}

/** 列出已登记 SSH 密钥 */
export async function listSshKeys(): Promise<SshKeyRecord[]> {
  const store = await getStore();
  const saved = await store.get<unknown>(KEYS_KEY);
  return ensureSingleEnabled(parseKeys(saved));
}

/** 生成新密钥（可选口令）；登记公钥与私钥路径 */
export async function createSshKey(name: string, passphrase: string): Promise<SshKeyRecord[]> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error(i18n.t("settings.sshNameRequired"));
  }

  const material = await invokeCommand<SshKeyMaterial>("ssh_key_generate", {
    input: {
      name: trimmedName,
      passphrase,
    },
  });

  return appendKey({
    id: crypto.randomUUID(),
    name: material.name,
    publicKey: material.publicKey,
    privateKeyPath: material.privateKeyPath,
    hasPassphrase: material.hasPassphrase,
    enabled: true,
    origin: "generated",
    createdAt: new Date().toISOString(),
  });
}

/** 扫描本机 ~/.ssh（macOS / Windows / Linux）中带旁路 .pub 的私钥 */
export async function scanLocalSshKeys(): Promise<SshKeyScanResult> {
  return invokeCommand<SshKeyScanResult>("ssh_key_scan_local");
}

/**
 * 扫描本地 SSH 目录，自动登记尚未在列表中的密钥（imported）。
 * 不覆盖用户已有启用项；若原先无任何登记，则按常见文件名优先启用一项。
 */
export async function syncLocalSshKeys(): Promise<SyncLocalSshKeysResult> {
  const scan = await scanLocalSshKeys();
  const existing = await listSshKeys();
  const knownPaths = new Set(existing.map((item) => normalizePathKey(item.privateKeyPath)));

  const fresh = scan.keys.filter((item) => !knownPaths.has(normalizePathKey(item.privateKeyPath)));
  if (fresh.length === 0) {
    return {
      keys: existing,
      importedCount: 0,
      scannedCount: scan.keys.length,
      sshDir: scan.sshDir,
    };
  }

  const hadAny = existing.length > 0;
  const hasEnabled = existing.some((item) => item.enabled);
  const preferredName = pickPreferredKeyName(fresh.map((item) => item.name));

  let next: SshKeyRecord[] = [
    ...existing.map((item) => ({
      ...item,
      // 原先无启用项且本次会导入时，先全部关掉，再启用优先项
      enabled: hadAny && hasEnabled ? item.enabled : false,
    })),
  ];

  for (const material of fresh) {
    const shouldEnable = !hadAny && !hasEnabled && material.name.toLowerCase() === preferredName;
    next.push({
      id: crypto.randomUUID(),
      name: material.name,
      publicKey: material.publicKey,
      privateKeyPath: material.privateKeyPath,
      hasPassphrase: material.hasPassphrase,
      enabled: shouldEnable,
      origin: "imported",
      createdAt: new Date().toISOString(),
    });
  }

  // 全新同步时若优先名未命中，启用第一项
  if (!hadAny && !next.some((item) => item.enabled) && next.length > 0) {
    next = next.map((item, index) => ({ ...item, enabled: index === 0 }));
  }

  next = ensureSingleEnabled(next);
  await saveKeys(next);
  return {
    keys: next,
    importedCount: fresh.length,
    scannedCount: scan.keys.length,
    sshDir: scan.sshDir,
  };
}

/** 选择本地密钥文件并登记（需同目录 .pub）；对话框默认打开 ~/.ssh */
export async function importSshKeyFromDisk(): Promise<SshKeyRecord[] | null> {
  let defaultPath: string | undefined;
  try {
    const scan = await scanLocalSshKeys();
    defaultPath = scan.sshDir || undefined;
  } catch {
    defaultPath = undefined;
  }

  const selected = await open({
    multiple: false,
    title: i18n.t("settings.sshPick"),
    defaultPath,
  });
  if (!selected || Array.isArray(selected)) {
    return null;
  }

  const material = await invokeCommand<SshKeyMaterial>("ssh_key_read_public", {
    input: { path: selected },
  });

  const keys = await listSshKeys();
  if (
    keys.some(
      (item) => normalizePathKey(item.privateKeyPath) === normalizePathKey(material.privateKeyPath),
    )
  ) {
    throw new Error(i18n.t("settings.sshKeyDuplicate"));
  }

  return appendKey({
    id: crypto.randomUUID(),
    name: material.name,
    publicKey: material.publicKey,
    privateKeyPath: material.privateKeyPath,
    hasPassphrase: material.hasPassphrase,
    enabled: true,
    origin: "imported",
    createdAt: new Date().toISOString(),
  });
}

/**
 * 从列表移除密钥。
 * 仅 JLGit 新增（generated）会删除磁盘私钥与旁路 .pub；导入项只取消登记。
 */
export async function deleteSshKey(id: string): Promise<SshKeyRecord[]> {
  const keys = await listSshKeys();
  const target = keys.find((item) => item.id === id);
  if (!target) {
    throw new Error(i18n.t("settings.sshKeyNotFound"));
  }

  if (target.origin === "generated") {
    await invokeCommand<{ ok: boolean }>("ssh_key_delete", {
      input: { path: target.privateKeyPath },
    });
  }

  const next = keys.filter((item) => item.id !== id);
  await saveKeys(next);
  return next;
}

/** 启用密钥时自动禁用其它项，避免同时存在多个启用密钥。 */
export async function setSshKeyEnabled(id: string, enabled: boolean): Promise<SshKeyRecord[]> {
  const keys = await listSshKeys();
  const next = keys.map((item) => ({
    ...item,
    enabled: enabled ? item.id === id : item.id === id ? false : item.enabled,
  }));
  await saveKeys(next);
  return next;
}

/** 修改私钥口令（经 ssh-keygen -p）；口令不写入 Store。 */
export async function changeSshKeyPassphrase(
  id: string,
  oldPassphrase: string,
  newPassphrase: string,
): Promise<SshKeyRecord[]> {
  const keys = await listSshKeys();
  const target = keys.find((item) => item.id === id);
  if (!target) {
    throw new Error(i18n.t("settings.sshKeyNotFound"));
  }

  const result = await invokeCommand<{ hasPassphrase: boolean }>("ssh_key_change_passphrase", {
    input: {
      path: target.privateKeyPath,
      oldPassphrase,
      newPassphrase,
    },
  });

  const next = keys.map((item) =>
    item.id === id ? { ...item, hasPassphrase: result.hasPassphrase } : item,
  );
  await saveKeys(next);
  return next;
}

async function appendKey(record: SshKeyRecord): Promise<SshKeyRecord[]> {
  const keys = await listSshKeys();
  if (keys.some((item) => item.privateKeyPath === record.privateKeyPath)) {
    throw new Error(i18n.t("settings.sshKeyDuplicate"));
  }
  // 新增默认启用：关掉其它项
  const next = [...keys.map((item) => ({ ...item, enabled: false })), record];
  await saveKeys(next);
  return next;
}

async function saveKeys(keys: SshKeyRecord[]): Promise<void> {
  const store = await getStore();
  await store.set(KEYS_KEY, keys);
  await store.save();
}

/** 清空应用内 SSH 密钥登记（出厂重置用；不删 ~/.ssh 文件） */
export async function clearPersistedSshKeys(): Promise<void> {
  const store = await getStore();
  await store.set(KEYS_KEY, []);
  await store.save();
}

/** 丢弃 LazyStore 单例 */
export function invalidateSshKeysStore(): void {
  storePromise = null;
}

function parseKeys(value: unknown): SshKeyRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const result: SshKeyRecord[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }
    if (
      typeof item.id !== "string" ||
      typeof item.name !== "string" ||
      typeof item.publicKey !== "string" ||
      typeof item.privateKeyPath !== "string" ||
      typeof item.createdAt !== "string"
    ) {
      continue;
    }
    result.push({
      id: item.id,
      name: item.name,
      publicKey: item.publicKey,
      privateKeyPath: item.privateKeyPath,
      hasPassphrase: item.hasPassphrase === true,
      // 旧数据无字段时视为启用，由 ensureSingleEnabled 收敛为至多一项
      enabled: item.enabled !== false,
      // 旧数据无来源时按导入处理，避免误删磁盘文件
      origin: item.origin === "generated" ? "generated" : "imported",
      createdAt: item.createdAt,
    });
  }
  return result;
}

/** 至多保留一项启用（取列表中第一项） */
function ensureSingleEnabled(keys: SshKeyRecord[]): SshKeyRecord[] {
  const firstEnabledId = keys.find((item) => item.enabled)?.id;
  if (!firstEnabledId) {
    return keys;
  }
  return keys.map((item) => ({
    ...item,
    enabled: item.id === firstEnabledId,
  }));
}

/** 路径比较键：统一分隔符与大小写（Windows 盘符） */
function normalizePathKey(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  return normalized.toLowerCase();
}

function pickPreferredKeyName(names: readonly string[]): string {
  const lowerNames = names.map((name) => name.toLowerCase());
  for (const preferred of PREFERRED_KEY_NAMES) {
    if (lowerNames.includes(preferred)) {
      return preferred;
    }
  }
  return (names[0] ?? "").toLowerCase();
}
