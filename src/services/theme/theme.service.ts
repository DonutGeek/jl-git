export type ThemeMode = "light" | "dark" | "system";

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** 将昼夜模式应用到 documentElement */
export function applyThemeToDocument(mode: ThemeMode): void {
  const root = document.documentElement;
  const dark = resolveEffective(mode, systemPrefersDark()) === "dark";

  root.classList.toggle("dark", dark);
  root.dataset.theme = mode;
  root.style.colorScheme = dark ? "dark" : "light";
}

export function resolveEffective(mode: ThemeMode, prefersDark: boolean): "light" | "dark" {
  if (mode === "dark") {
    return "dark";
  }
  if (mode === "light") {
    return "light";
  }
  return prefersDark ? "dark" : "light";
}
