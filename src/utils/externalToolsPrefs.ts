import type { AppOs } from "@/services/window/windowChrome";

export interface ExternalToolOption {
  value: string;
  /** i18n key under settings.*，或字面量 label */
  labelKey?: string;
  label?: string;
}

/** 当前 OS 下合法的终端偏好值（含 auto / custom） */
export function shellOptionsForOs(os: AppOs): ExternalToolOption[] {
  if (os === "windows") {
    return [
      { value: "auto", labelKey: "shellAuto" },
      { value: "wt", labelKey: "shellWindowsTerminal" },
      { value: "cmd", labelKey: "shellCmd" },
      { value: "custom", labelKey: "shellCustom" },
    ];
  }
  if (os === "linux") {
    return [
      { value: "auto", labelKey: "shellAuto" },
      { value: "gnome-terminal", labelKey: "shellGnomeTerminal" },
      { value: "konsole", labelKey: "shellKonsole" },
      { value: "custom", labelKey: "shellCustom" },
    ];
  }
  // macOS 与未知：保留 Terminal / iTerm
  return [
    { value: "auto", labelKey: "shellAuto" },
    { value: "terminal", label: "Terminal.app" },
    { value: "iterm", label: "iTerm2" },
    { value: "custom", labelKey: "shellCustom" },
  ];
}

/** 跨平台同步的偏好若在本机非法，回退为 auto */
export function coerceShellPreference(os: AppOs, shell: string): string {
  const allowed = new Set(shellOptionsForOs(os).map((option) => option.value));
  return allowed.has(shell) ? shell : "auto";
}

export function editorPathPlaceholderKey(os: AppOs): string {
  if (os === "windows") return "externalEditorPathPlaceholderWindows";
  if (os === "linux") return "externalEditorPathPlaceholderLinux";
  return "externalEditorPathPlaceholder";
}

export function shellPathPlaceholderKey(os: AppOs): string {
  if (os === "windows") return "shellPathPlaceholderWindows";
  if (os === "linux") return "shellPathPlaceholderLinux";
  return "shellPathPlaceholder";
}
