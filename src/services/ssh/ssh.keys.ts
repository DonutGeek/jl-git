import { open } from "@tauri-apps/plugin-dialog";
import { LazyStore } from "@tauri-apps/plugin-store";

import i18n from "@/i18n";
import { invokeCommand } from "@/services/invoke";
import { isRecord } from "@/types/error";

const STORE_FILE = "ssh-keys.json";
const KEYS_KEY = "keys";

/** 应用内登记的 SSH 密钥（不存私钥内容与口令） */
export interface SshKeyRecord {
  id: string;
  name: string;
  publicKey: string;
  privateKeyPath: string;
  /** 生成时是否设置了口令（仅标记，不存口令本身） */
  hasPassphrase: boolean;
  createdAt: string;
}

interface SshKeyMaterial {
  name: string;
  publicKey: string;
  privateKeyPath: string;
  hasPassphrase: boolean;
}

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
  return parseKeys(saved);
}

/** 生成新密钥（可选口令）；登记公钥与私钥路径 */
export async function createSshKey(
  name: string,
  passphrase: string,
): Promise<SshKeyRecord[]> {
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
    createdAt: new Date().toISOString(),
  });
}

/** 选择本地密钥文件并登记（需同目录 .pub） */
export async function importSshKeyFromDisk(): Promise<SshKeyRecord[] | null> {
  const selected = await open({
    multiple: false,
    title: i18n.t("settings.sshPick"),
  });
  if (!selected || Array.isArray(selected)) {
    return null;
  }

  const material = await invokeCommand<SshKeyMaterial>("ssh_key_read_public", {
    input: { path: selected },
  });

  const keys = await listSshKeys();
  if (keys.some((item) => item.privateKeyPath === material.privateKeyPath)) {
    throw new Error(i18n.t("settings.sshKeyDuplicate"));
  }

  return appendKey({
    id: crypto.randomUUID(),
    name: material.name,
    publicKey: material.publicKey,
    privateKeyPath: material.privateKeyPath,
    hasPassphrase: false,
    createdAt: new Date().toISOString(),
  });
}

/** 从应用登记中移除（不删除磁盘文件） */
export async function deleteSshKey(id: string): Promise<SshKeyRecord[]> {
  const keys = await listSshKeys();
  const next = keys.filter((item) => item.id !== id);
  await saveKeys(next);
  return next;
}

async function appendKey(record: SshKeyRecord): Promise<SshKeyRecord[]> {
  const keys = await listSshKeys();
  if (keys.some((item) => item.privateKeyPath === record.privateKeyPath)) {
    throw new Error(i18n.t("settings.sshKeyDuplicate"));
  }
  const next = [...keys, record];
  await saveKeys(next);
  return next;
}

async function saveKeys(keys: SshKeyRecord[]): Promise<void> {
  const store = await getStore();
  await store.set(KEYS_KEY, keys);
  await store.save();
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
      createdAt: item.createdAt,
    });
  }
  return result;
}
