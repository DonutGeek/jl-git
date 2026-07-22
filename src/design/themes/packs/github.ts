import {
  APP_THEME_GITHUB,
  type AppThemePack,
} from "@/design/themes/types";

/**
 * GitHub — Primer 功能色（公开设计系统）
 * 来源：
 * - primer.style / Primer color usage
 * - github.com 默认浅/深色画布（canvas.default）
 * - 强调蓝：light accent.fg `#0969DA`；dark `#4493F8`
 * - 正文：light `#1F2328`；dark `#E6EDF3`
 * - 画布：light `#FFFFFF`；dark `#0D1117`
 */
export const githubPack: AppThemePack = {
  id: APP_THEME_GITHUB,
  labelKey: "settings.appThemeGithub",
  nativeTokens: false,
  light: {
    accent: "#0969DA",
    background: "#FFFFFF",
    foreground: "#1F2328",
  },
  dark: {
    accent: "#4493F8",
    background: "#0D1117",
    foreground: "#E6EDF3",
  },
  defaultContrast: 65,
};
