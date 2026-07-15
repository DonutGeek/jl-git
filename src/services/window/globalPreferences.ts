import { emit, listen } from "@tauri-apps/api/event";

export type GlobalPreferenceKind = "theme" | "locale" | "app-prefs";

const GLOBAL_PREFERENCES_EVENT = "jlgit:global-preferences";

/** 广播全局偏好变更，让其他已打开 WebView 同步对应配置。 */
export function notifyGlobalPreferenceChange(kind: GlobalPreferenceKind): void {
  void emit(GLOBAL_PREFERENCES_EVENT, kind).catch((error: unknown) => {
    console.error("Failed to notify global preference change", error);
  });
}

/** 监听其他窗口发出的全局偏好变更。 */
export async function listenGlobalPreferenceChange(
  onChange: (kind: GlobalPreferenceKind) => void,
): Promise<void> {
  await listen<GlobalPreferenceKind>(GLOBAL_PREFERENCES_EVENT, (event) => {
    onChange(event.payload);
  });
}
