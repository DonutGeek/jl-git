/**
 * 兼容旧 Zustand persist 的 localStorage 形态：`{ state, version }`。
 * 换成 Pinia 后必须继续读写这套格式，否则用户语言 / 主题会丢。
 */

interface ZustandPersistEnvelope {
  state?: unknown;
  version?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** 从 Zustand 信封或 Pinia 裸对象里取出 state */
export function deserializeZustandPersist<T>(value: string): T {
  const parsed: unknown = JSON.parse(value);
  if (isRecord(parsed) && "state" in parsed) {
    return (parsed as ZustandPersistEnvelope).state as T;
  }
  return parsed as T;
}

/** 读出版本号（无 version 当 0，供主题等迁移） */
export function readZustandPersistVersion(value: string): number {
  const parsed: unknown = JSON.parse(value);
  if (isRecord(parsed) && typeof parsed.version === "number") {
    return parsed.version;
  }
  return 0;
}

/** 写回 Zustand 信封，主窗 / 子窗才能互相水合 */
export function serializeZustandPersist<T>(value: T, version?: number): string {
  if (typeof version === "number") {
    return JSON.stringify({ state: value, version });
  }
  return JSON.stringify({ state: value });
}
