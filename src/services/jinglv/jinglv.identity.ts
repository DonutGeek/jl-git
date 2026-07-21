import { LazyStore } from "@tauri-apps/plugin-store";

import type { JinglvIdentity } from "@/types/jinglv";
import { isRecord } from "@/types/error";

const STORE_FILE = "jinglv.json";
/** 旧版简历帮 Store，读取后迁移到 jinglv.json */
const LEGACY_STORE_FILE = "resume-helper.json";
const IDENTITY_KEY = "identity";

const EMPTY_IDENTITY: JinglvIdentity = {
  displayName: "",
  phone: "",
  email: "",
};

let storePromise: Promise<LazyStore> | null = null;
let migratedLegacy = false;

function getStore(): Promise<LazyStore> {
  if (!storePromise) {
    storePromise = Promise.resolve(new LazyStore(STORE_FILE));
  }
  return storePromise;
}

async function migrateLegacyStoreIfNeeded(store: LazyStore): Promise<void> {
  if (migratedLegacy) {
    return;
  }
  migratedLegacy = true;
  const existing = await store.get<unknown>(IDENTITY_KEY);
  if (isRecord(existing)) {
    return;
  }
  try {
    const legacy = new LazyStore(LEGACY_STORE_FILE);
    const saved = await legacy.get<unknown>(IDENTITY_KEY);
    if (!isRecord(saved)) {
      return;
    }
    const next = normalizeIdentity(saved);
    await store.set(IDENTITY_KEY, next);
    await store.save();
  } catch {
    // 旧文件不存在或不可读时忽略
  }
}

/** 读取鲸履联系信息（Git 账号见 settings → Git）。 */
export async function getJinglvIdentity(): Promise<JinglvIdentity> {
  const store = await getStore();
  await migrateLegacyStoreIfNeeded(store);
  const saved = await store.get<unknown>(IDENTITY_KEY);
  return normalizeIdentity(saved);
}

/** 保存鲸履联系信息。 */
export async function setJinglvIdentity(
  identity: JinglvIdentity,
): Promise<JinglvIdentity> {
  const next = normalizeIdentity(identity);
  const store = await getStore();
  await migrateLegacyStoreIfNeeded(store);
  await store.set(IDENTITY_KEY, next);
  await store.save();
  return next;
}

export function emptyJinglvIdentity(): JinglvIdentity {
  return { ...EMPTY_IDENTITY };
}

function normalizeIdentity(value: unknown): JinglvIdentity {
  if (!isRecord(value)) {
    return { ...EMPTY_IDENTITY };
  }
  return {
    displayName: readString(value.displayName),
    phone: readString(value.phone),
    email: readString(value.email),
  };
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
