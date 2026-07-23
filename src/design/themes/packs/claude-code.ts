import {
  APP_THEME_CLAUDE_CODE,
  type AppThemePack,
} from "@/design/themes/types";

/**
 * Claude（内部沿用 claude-code id 兼容既有偏好）
 * 来源：
 * - Claude 设置页实测昼夜 CDS Variables 与组件计算样式
 * - 应用整站以 Claude Web 的中性界面层级作映射
 * 说明：品牌 Clay 仅作内容装饰，不再误用为整站主强调色。
 */
export const claudeCodePack: AppThemePack = {
  id: APP_THEME_CLAUDE_CODE,
  labelKey: "settings.appThemeClaudeCode",
  nativeTokens: false,
  light: {
    accent: "#0B0B0B",
    background: "#F9F9F7",
    foreground: "#0B0B0B",
    surface: "#FFFFFF",
    muted: "#F3F3F0",
    mutedForeground: "#52514E",
    border: "#E7E6E1",
    sidebar: "#FCFCFB",
    selection: "#E4E3DD",
    destructive: "#8E2626",
    diffAdded: "#D2ECD8",
    diffDeleted: "#F5D2DD",
    diffHunk: "#E7E6E1",
    gitAdded: "#1E9E3C",
    gitModified: "#98801F",
    gitDeleted: "#CD2054",
    gitRenamed: "#8E6BD9",
    gitUntracked: "#2A78D6",
    gitConflict: "#C5621B",
  },
  dark: {
    accent: "#FFFFFF",
    background: "#0D0D0D",
    foreground: "#FFFFFF",
    surface: "#2C2C2A",
    muted: "#20201F",
    mutedForeground: "#C3C2B7",
    border: "#383835",
    sidebar: "#1A1A19",
    selection: "#383835",
    destructive: "#EC7E7E",
    diffAdded: "#16351C",
    diffDeleted: "#3D1320",
    diffHunk: "#20201F",
    gitAdded: "#32D74B",
    gitModified: "#FFD014",
    gitDeleted: "#FF2C56",
    gitRenamed: "#AC95E8",
    gitUntracked: "#70B8FF",
    gitConflict: "#FF9F0A",
  },
  syntax: {
    light: {
      comment: "#898781",
      keyword: "#C6613F",
      string: "#527FAA",
      number: "#B55475",
      type: "#77758F",
      function: "#A96F46",
      variable: "#0B0B0B",
      tag: "#667A4E",
      attribute: "#527FAA",
      regexp: "#B55475",
      operator: "#52514E",
    },
    dark: {
      comment: "#898781",
      keyword: "#E58B6E",
      string: "#8AB4DE",
      number: "#E39AAF",
      type: "#B5B3D0",
      function: "#E0B48E",
      variable: "#FFFFFF",
      tag: "#A8C48A",
      attribute: "#8AB4DE",
      regexp: "#E39AAF",
      operator: "#C3C2B7",
    },
  },
  defaultContrast: 60,
};
