import { LazyStore } from "@tauri-apps/plugin-store";

import type { AgentIdentity } from "@/types/agent";
import { isRecord } from "@/types/error";

const STORE_FILE = "agent-identity.json";
/** 旧版 Store 文件，按顺序读取后迁移到 agent-identity.json */
const LEGACY_STORE_FILES = ["jinglv.json", "resume-helper.json"];
const IDENTITY_KEY = "identity";

const EMPTY_IDENTITY: AgentIdentity = {
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
  for (const legacyFile of LEGACY_STORE_FILES) {
    try {
      const legacy = new LazyStore(legacyFile);
      const saved = await legacy.get<unknown>(IDENTITY_KEY);
      if (!isRecord(saved)) {
        continue;
      }
      const next = normalizeIdentity(saved);
      await store.set(IDENTITY_KEY, next);
      await store.save();
      return;
    } catch {
      // 旧文件不存在或不可读时尝试下一个
    }
  }
}

/** 读取简历插件联系信息（Git 账号见 settings → Git）。 */
export async function getAgentIdentity(): Promise<AgentIdentity> {
  const store = await getStore();
  await migrateLegacyStoreIfNeeded(store);
  const saved = await store.get<unknown>(IDENTITY_KEY);
  return normalizeIdentity(saved);
}

/** 保存简历插件联系信息。 */
export async function setAgentIdentity(
  identity: AgentIdentity,
): Promise<AgentIdentity> {
  const next = normalizeIdentity(identity);
  const store = await getStore();
  await migrateLegacyStoreIfNeeded(store);
  await store.set(IDENTITY_KEY, next);
  await store.save();
  return next;
}

export function emptyAgentIdentity(): AgentIdentity {
  return { ...EMPTY_IDENTITY };
}

function normalizeIdentity(value: unknown): AgentIdentity {
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
