import { LazyStore } from "@tauri-apps/plugin-store";

import {
  AGENT_PLUGINS,
  type AgentPluginDefinition,
} from "@/plugins/agent/registry";

const STORE_FILE = "agent-plugins.json";
const DISABLED_IDS_KEY = "disabledIds";

let storePromise: Promise<LazyStore> | null = null;

function getStore(): Promise<LazyStore> {
  if (!storePromise) {
    storePromise = Promise.resolve(new LazyStore(STORE_FILE));
  }
  return storePromise;
}

function normalizeIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const known = new Set(AGENT_PLUGINS.map((plugin) => plugin.id));
  const next: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !known.has(item) || next.includes(item)) {
      continue;
    }
    next.push(item);
  }
  return next;
}

/** 读取已卸载（隐藏）的内置插件 id */
export async function getDisabledAgentPluginIds(): Promise<string[]> {
  const store = await getStore();
  return normalizeIds(await store.get<unknown>(DISABLED_IDS_KEY));
}

/** 卸载内置插件（软隐藏，可后续扩展恢复） */
export async function disableAgentPlugin(pluginId: string): Promise<void> {
  if (!AGENT_PLUGINS.some((plugin) => plugin.id === pluginId)) {
    return;
  }
  const store = await getStore();
  const current = normalizeIds(await store.get<unknown>(DISABLED_IDS_KEY));
  if (current.includes(pluginId)) {
    return;
  }
  const next = [...current, pluginId];
  await store.set(DISABLED_IDS_KEY, next);
  await store.save();
}

/** 过滤未卸载的内置插件 */
export function filterEnabledAgentPlugins(
  disabledIds: readonly string[],
): readonly AgentPluginDefinition[] {
  if (disabledIds.length === 0) {
    return AGENT_PLUGINS;
  }
  const disabled = new Set(disabledIds);
  return AGENT_PLUGINS.filter((plugin) => !disabled.has(plugin.id));
}
