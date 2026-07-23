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
    surface: "#FFFFFF",
    muted: "#F5F5F5",
    mutedForeground: "#737373",
    border: "#E5E5E5",
    sidebar: "#FAFAFA",
    selection: "#F5F5F5",
    destructive: "#DC2626",
    diffAdded: "#E6F4EA",
    diffDeleted: "#FCE8E6",
    diffHunk: "#EEF2F7",
    gitAdded: "#15803D",
    gitModified: "#2563EB",
    gitDeleted: "#DC2626",
    gitRenamed: "#7E22CE",
    gitUntracked: "#0F766E",
    gitConflict: "#C2410C",
  },
  dark: {
    accent: "#EBEBEB",
    background: "#252525",
    foreground: "#FAFAFA",
    surface: "#303030",
    muted: "#414141",
    mutedForeground: "#A3A3A3",
    border: "#404040",
    sidebar: "#303030",
    selection: "#414141",
    destructive: "#F87171",
    diffAdded: "#1A3D2A",
    diffDeleted: "#4A2020",
    diffHunk: "#1E2A3A",
    gitAdded: "#4ADE80",
    gitModified: "#60A5FA",
    gitDeleted: "#FB7185",
    gitRenamed: "#C084FC",
    gitUntracked: "#2DD4BF",
    gitConflict: "#FB923C",
  },
  defaultContrast: 60,
};
