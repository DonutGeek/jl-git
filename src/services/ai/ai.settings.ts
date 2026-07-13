import { LazyStore } from "@tauri-apps/plugin-store";

const STORE_FILE = "ai-secrets.json";
const AGENT_KEY = "agentKey";

let storePromise: Promise<LazyStore> | null = null;

function getStore(): Promise<LazyStore> {
  if (!storePromise) {
    storePromise = Promise.resolve(new LazyStore(STORE_FILE));
  }
  return storePromise;
}

/** 是否已配置 Agent Key（不回传明文，供 UI 展示状态） */
export async function hasAgentKey(): Promise<boolean> {
  const store = await getStore();
  const value = await store.get<string>(AGENT_KEY);
  return typeof value === "string" && value.trim().length > 0;
}

/** 读取 Agent Key（仅供后续 AiService 调用；UI 勿直接展示） */
export async function getAgentKey(): Promise<string | null> {
  const store = await getStore();
  const value = await store.get<string>(AGENT_KEY);
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** 保存 Agent Key；空字符串视为清除 */
export async function setAgentKey(key: string): Promise<void> {
  const store = await getStore();
  const trimmed = key.trim();
  if (!trimmed) {
    await store.delete(AGENT_KEY);
  } else {
    await store.set(AGENT_KEY, trimmed);
  }
  await store.save();
}

export async function clearAgentKey(): Promise<void> {
  await setAgentKey("");
}
