import {
  APP_THEME_CODEX,
  type AppThemePack,
} from "@/design/themes/types";

/**
 * ChatGPT（内部沿用 codex id 兼容既有偏好）
 * 来源：
 * - ChatGPT 设置页实测昼夜 CSS Variables 与组件计算样式
 * - OpenAI 未公开完整 ChatGPT Design Tokens；以下为产品界面语义映射，不冒充官方色值表
 * - 状态色保留开发工具语义，仅降低饱和度以融入中性界面
 */
export const codexPack: AppThemePack = {
  id: APP_THEME_CODEX,
  labelKey: "settings.appThemeCodex",
  nativeTokens: false,
  light: {
    accent: "#0D0D0D",
    background: "#FCFCFC",
    foreground: "#0D0D0D",
    surface: "#FFFFFF",
    muted: "#F9F9F9",
    mutedForeground: "#5D5D5D",
    border: "#E5E5E5",
    sidebar: "#FCFCFC",
    selection: "#F5F5F5",
    destructive: "#FF002A",
    diffAdded: "#E8F5EC",
    diffDeleted: "#FBE9E7",
    diffHunk: "#EEF2F6",
    gitAdded: "#16803C",
    gitModified: "#2563EB",
    gitDeleted: "#D92D20",
    gitRenamed: "#7C3AED",
    gitUntracked: "#0F766E",
    gitConflict: "#B45309",
  },
  dark: {
    accent: "#FFFFFF",
    background: "#000000",
    foreground: "#FFFFFF",
    surface: "#212121",
    muted: "#2F2F2F",
    mutedForeground: "#CDCDCD",
    border: "#2B2B2B",
    sidebar: "#000000",
    selection: "#303030",
    destructive: "#FF6764",
    diffAdded: "#152D20",
    diffDeleted: "#321B1B",
    diffHunk: "#182434",
    gitAdded: "#4ADE80",
    gitModified: "#60A5FA",
    gitDeleted: "#FB7185",
    gitRenamed: "#C084FC",
    gitUntracked: "#2DD4BF",
    gitConflict: "#FBBF24",
  },
  syntax: {
    light: {
      comment: "#737373",
      keyword: "#7C3AED",
      string: "#16803C",
      number: "#B45309",
      type: "#2563EB",
      function: "#0F766E",
      variable: "#0D0D0D",
      tag: "#D92D20",
      attribute: "#2563EB",
      regexp: "#B45309",
      operator: "#5D5D5D",
    },
    dark: {
      comment: "#858585",
      keyword: "#C084FC",
      string: "#86EFAC",
      number: "#FBBF24",
      type: "#93C5FD",
      function: "#5EEAD4",
      variable: "#E5E5E5",
      tag: "#FB7185",
      attribute: "#60A5FA",
      regexp: "#F59E0B",
      operator: "#A1A1A1",
    },
  },
  defaultContrast: 60,
};
