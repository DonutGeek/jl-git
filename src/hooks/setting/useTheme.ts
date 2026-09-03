import { computed } from "vue";
import { storeToRefs } from "pinia";

import { theme as antdThemeToken } from "antdv-next";

import { useThemeStore } from "@/store/modules/theme";
import { resolveEffective, type ThemeMode } from "@/services/theme/theme.service";

/**
 * 把现有 CSS Token 接到 antdv-next ConfigProvider。
 * 颜色仍走 `src/design/` 语义变量，算法随亮/暗切换。
 */
export function useTheme() {
  const themeStore = useThemeStore();
  const { mode } = storeToRefs(themeStore);

  const isDark = computed(() => {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    return resolveEffective(mode.value, prefersDark) === "dark";
  });

  const antdTheme = computed(() => ({
    algorithm: isDark.value ? antdThemeToken.darkAlgorithm : antdThemeToken.defaultAlgorithm,
    token: {
      colorPrimary: "var(--primary)",
      colorBgContainer: "var(--card)",
      colorBgLayout: "var(--background)",
      colorBgElevated: "var(--popover)",
      colorText: "var(--foreground)",
      colorTextSecondary: "var(--muted-foreground)",
      colorBorder: "var(--border)",
      colorBorderSecondary: "var(--border)",
      borderRadius: 8,
      fontFamily: "var(--app-font-family, inherit)",
      fontFamilyCode: "var(--app-font-family, inherit)",
    },
  }));

  return {
    antdTheme,
    isDark,
    mode,
    setMode: (next: ThemeMode) => {
      themeStore.setMode(next);
    },
    toggleDayNight: () => {
      themeStore.toggleDayNight();
    },
  };
}
