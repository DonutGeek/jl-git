import {
  APP_THEME_CLAUDE_CODE,
  type AppThemePack,
} from "@/design/themes/types";

/**
 * Claude Code — 对齐 Anthropic 公开品牌色 / Claude 产品暖纸感
 * 来源：
 * - Anthropic 官网 CSS 品牌原子：Ivory、Slate、Clay、Cloud、Cactus、Sky、Heather、Fig
 * - Claude Code CLI 主题可自定义；桌面整站用品牌 clay 作强调，深色底用 slate
 * 说明：CLI 默认跟随终端底色；深色是基于官网品牌原子的产品化反转映射。
 */
export const claudeCodePack: AppThemePack = {
  id: APP_THEME_CLAUDE_CODE,
  labelKey: "settings.appThemeClaudeCode",
  nativeTokens: false,
  light: {
    accent: "#D97757",
    background: "#FAF9F5",
    foreground: "#141413",
    surface: "#FAF9F5",
    muted: "#F0EEE6",
    mutedForeground: "#5E5D59",
    border: "#D1CFC5",
    sidebar: "#F0EEE6",
    selection: "#EBCECE",
    destructive: "#B42318",
    diffAdded: "#DCEAE5",
    diffDeleted: "#F3DEDE",
    diffHunk: "#E7E6EE",
    gitAdded: "#667A4E",
    gitModified: "#527FAA",
    gitDeleted: "#B55475",
    gitRenamed: "#77758F",
    gitUntracked: "#4F7F72",
    gitConflict: "#A96F46",
  },
  dark: {
    accent: "#D97757",
    background: "#141413",
    foreground: "#FAF9F5",
    surface: "#1E1E1C",
    muted: "#2A2A27",
    mutedForeground: "#B0AEA5",
    border: "#3D3D3A",
    sidebar: "#191918",
    selection: "#452D24",
    destructive: "#F28B82",
    diffAdded: "#20332D",
    diffDeleted: "#3D282D",
    diffHunk: "#2D2C3A",
    gitAdded: "#A8C48A",
    gitModified: "#8AB4DE",
    gitDeleted: "#E39AAF",
    gitRenamed: "#B5B3D0",
    gitUntracked: "#8FC5B7",
    gitConflict: "#E0B48E",
  },
  syntax: {
    light: {
      comment: "#788C5D",
      keyword: "#C6613F",
      string: "#527FAA",
      number: "#B55475",
      type: "#77758F",
      function: "#A96F46",
      variable: "#3D3D3A",
      tag: "#667A4E",
      attribute: "#527FAA",
      regexp: "#B55475",
      operator: "#5E5D59",
    },
    dark: {
      comment: "#8FA276",
      keyword: "#E58B6E",
      string: "#8AB4DE",
      number: "#E39AAF",
      type: "#B5B3D0",
      function: "#E0B48E",
      variable: "#D1CFC5",
      tag: "#A8C48A",
      attribute: "#8AB4DE",
      regexp: "#E39AAF",
      operator: "#B0AEA5",
    },
  },
  defaultContrast: 55,
};
