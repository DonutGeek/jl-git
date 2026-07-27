export type ThemeMode = "light" | "dark" | "system";

/** 将主题模式应用到 documentElement */
export function applyThemeToDocument(mode: ThemeMode): void {
  const root = document.documentElement;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const effective = mode === "system" ? (prefersDark ? "dark" : "light") : mode;
  const dark = effective === "dark";

  root.classList.toggle("dark", dark);
  root.dataset.theme = mode;
  root.style.colorScheme = dark ? "dark" : "light";
}

export function resolveEffective(mode: ThemeMode, systemPrefersDark: boolean): "light" | "dark" {
  if (mode === "system") {
    return systemPrefersDark ? "dark" : "light";
  }
  return mode;
}
