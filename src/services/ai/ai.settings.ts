import { LazyStore } from "@tauri-apps/plugin-store";

import i18n from "@/i18n";
import { getDefaultAiInstructions } from "@/prompts/aiInstructions";
import { isRecord } from "@/types/error";

const STORE_FILE = "ai-secrets.json";
const API_KEYS = "apiKeys";
const LEGACY_AGENT_KEY = "agentKey";
const COMMIT_INSTRUCTIONS = "commitInstructions";
const PULL_REQUEST_INSTRUCTIONS = "pullRequestInstructions";

export interface AiInstructions {
  commit: string;
  pullRequest: string;
}

export interface AiApiKey {
  id: string;
  name: string;
  key: string;
  createdAt: string;
  enabled: boolean;
}

let storePromise: Promise<LazyStore> | null = null;

function getStore(): Promise<LazyStore> {
  if (!storePromise) {
    storePromise = Promise.resolve(new LazyStore(STORE_FILE));
  }
  return storePromise;
}

/** 列出本机保存的 API Key；首次读取会迁移旧版单 Key 配置。 */
export async function listAiApiKeys(): Promise<AiApiKey[]> {
  const store = await getStore();
  const saved = await store.get<unknown>(API_KEYS);
  const keys = parseApiKeys(saved);
  if (keys.length > 0 || Array.isArray(saved)) {
    return keys;
  }

  const legacyKey = await store.get<string>(LEGACY_AGENT_KEY);
  if (typeof legacyKey !== "string" || !legacyKey.trim()) {
    return [];
  }

  const migrated: AiApiKey[] = [
    {
      id: crypto.randomUUID(),
      name: "DeepSeek API Key",
      key: legacyKey.trim(),
      createdAt: new Date().toISOString(),
      enabled: true,
    },
  ];
  await store.set(API_KEYS, migrated);
  await store.delete(LEGACY_AGENT_KEY);
  await store.save();
  return migrated;
}

/** 创建并启用 API Key；同一时刻仅允许一个 Key 供 Agent 使用。 */
export async function createAiApiKey(name: string, key: string): Promise<AiApiKey[]> {
  const trimmedName = name.trim();
  const trimmedKey = key.trim();
  if (!trimmedName || !trimmedKey) {
    throw new Error("名称和 API Key 均为必填项");
  }
  const keys = await listAiApiKeys();
  const next = [
    ...keys.map((item) => ({ ...item, enabled: false })),
    {
      id: crypto.randomUUID(),
      name: trimmedName,
      key: trimmedKey,
      createdAt: new Date().toISOString(),
      enabled: true,
    },
  ];
  await saveApiKeys(next);
  return next;
}

/** 启用 Key 时会自动禁用其它 Key，避免 Agent 请求使用不确定的凭据。 */
export async function setAiApiKeyEnabled(
  id: string,
  enabled: boolean,
): Promise<AiApiKey[]> {
  const keys = await listAiApiKeys();
  const next = keys.map((item) => ({
    ...item,
    enabled: enabled ? item.id === id : item.id === id ? false : item.enabled,
  }));
  await saveApiKeys(next);
  return next;
}

/** 修改 API Key 的显示名称，不接触其密钥内容与启用状态。 */
export async function renameAiApiKey(id: string, name: string): Promise<AiApiKey[]> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("名称不能为空");
  }
  const keys = await listAiApiKeys();
  const next = keys.map((item) => (item.id === id ? { ...item, name: trimmedName } : item));
  await saveApiKeys(next);
  return next;
}

/** 删除指定 Key；删除后不会保留其明文。 */
export async function deleteAiApiKey(id: string): Promise<AiApiKey[]> {
  const keys = await listAiApiKeys();
  const next = keys.filter((item) => item.id !== id);
  await saveApiKeys(next);
  return next;
}

/** 返回当前启用 Key 的明文，仅供 AiService 发起请求。 */
export async function getAgentKey(): Promise<string | null> {
  const keys = await listAiApiKeys();
  return keys.find((item) => item.enabled)?.key ?? null;
}

function parseApiKeys(value: unknown): AiApiKey[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!isApiKey(item)) {
      return [];
    }
    return [item];
  });
}

function isApiKey(value: unknown): value is AiApiKey {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.key === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.enabled === "boolean"
  );
}

async function saveApiKeys(keys: AiApiKey[]): Promise<void> {
  const store = await getStore();
  await store.set(API_KEYS, keys);
  await store.save();
}

/** 读取 AI Git 文案约束；未配置时回退 JLGit 默认规则。 */
export async function getAiInstructions(): Promise<AiInstructions> {
  const store = await getStore();
  const commit = await store.get<string>(COMMIT_INSTRUCTIONS);
  const pullRequest = await store.get<string>(PULL_REQUEST_INSTRUCTIONS);
  const defaults = getDefaultAiInstructions(i18n.language ?? "zh-CN");
  return {
    commit: typeof commit === "string" ? commit : defaults.commit,
    pullRequest: typeof pullRequest === "string" ? pullRequest : defaults.pullRequest,
  };
}

/** 保存指定场景的 AI 文案约束；空内容会清除对应配置。 */
export async function setAiInstructions(
  instructions: Partial<AiInstructions>,
): Promise<void> {
  const store = await getStore();
  const entries: Array<[key: string, value: string | undefined]> = [
    [COMMIT_INSTRUCTIONS, instructions.commit],
    [PULL_REQUEST_INSTRUCTIONS, instructions.pullRequest],
  ];

  for (const [key, value] of entries) {
    if (value === undefined) {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed) {
      await store.set(key, trimmed);
    } else {
      await store.delete(key);
    }
  }
  await store.save();
}
