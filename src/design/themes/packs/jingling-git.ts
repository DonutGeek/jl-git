import {
  APP_THEME_JINGLING_GIT,
  type AppThemePack,
} from "@/design/themes/types";

/**
 * 鲸灵 Git：默认沿用 tokens.css 原色（nativeTokens）。
 * 色板仅作设置色块展示与「用户微调后」覆写基准；未改色时不注入 hex。
 */
export const jinglingGitPack: AppThemePack = {
  id: APP_THEME_JINGLING_GIT,
  labelKey: "settings.appThemeJinglingGit",
  nativeTokens: true,
  light: {
    accent: "#333333",
    background: "#FFFFFF",
    foreground: "#252525",
  },
  dark: {
    accent: "#EBEBEB",
    background: "#252525",
    foreground: "#FAFAFA",
  },
  defaultContrast: 60,
};
