import { computed } from "vue";
import { storeToRefs } from "pinia";

import { usePreferredDark } from "@vueuse/core";
import { theme as antdThemeToken } from "antdv-next";

import { useThemeStore } from "@/store/modules/theme";
import { resolveEffective, type ThemeMode } from "@/services/theme/theme.service";

/**
 * antdv-next 为样式主题源：默认/暗色算法 + CSS 变量。
 * 业务 Tailwind 语义色对齐同一套 Ant Design Token。
 */
export function useTheme() {
  const themeStore = useThemeStore();
  const { mode } = storeToRefs(themeStore);
  const prefersDark = usePreferredDark();

  const isDark = computed(() => resolveEffective(mode.value, prefersDark.value) === "dark");

  const antdTheme = computed(() => ({
    algorithm: isDark.value ? antdThemeToken.darkAlgorithm : antdThemeToken.defaultAlgorithm,
    cssVar: true as const,
    // 运行时生成浅/深色，才能跟昼夜切换；零运行时只有一份静态 CSS
    zeroRuntime: false,
    token: {
      fontFamily: "var(--font-sans, inherit)",
      fontFamilyCode: "var(--font-mono, inherit)",
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
