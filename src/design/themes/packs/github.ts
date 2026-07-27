import { APP_THEME_GITHUB, type AppThemePack } from "@/design/themes/types";

/**
 * GitHub — Primer 功能色（公开设计系统）
 * 来源：
 * - primer.style / Primer color usage
 * - github.com 默认浅/深色画布（canvas.default）
 * - 强调蓝：light accent.fg `#0969DA`；dark `#4493F8`
 * - 正文：light `#1F2328`；dark `#F0F6FC`
 * - 画布：light `#FFFFFF`；dark `#0D1117`
 * - 卡片/次要区、边框与状态色均直接采用 Primer functional tokens
 */
export const githubPack: AppThemePack = {
  id: APP_THEME_GITHUB,
  labelKey: "settings.appThemeGithub",
  nativeTokens: false,
  light: {
    accent: "#0969DA",
    background: "#FFFFFF",
    foreground: "#1F2328",
    surface: "#FFFFFF",
    muted: "#F6F8FA",
    mutedForeground: "#59636E",
    border: "#D1D9E0",
    sidebar: "#F6F8FA",
    selection: "#DDF4FF",
    destructive: "#D1242F",
    diffAdded: "#DAFBE1",
    diffDeleted: "#FFEBE9",
    diffHunk: "#DDF4FF",
    gitAdded: "#1A7F37",
    gitModified: "#0969DA",
    gitDeleted: "#D1242F",
    gitRenamed: "#8250DF",
    gitUntracked: "#1A7F37",
    gitConflict: "#9A6700",
  },
  dark: {
    accent: "#4493F8",
    background: "#0D1117",
    foreground: "#F0F6FC",
    surface: "#151B23",
    muted: "#212830",
    mutedForeground: "#9198A1",
    border: "#3D444D",
    sidebar: "#010409",
    selection: "#111D2E",
    destructive: "#F85149",
    diffAdded: "#12261E",
    diffDeleted: "#25181C",
    diffHunk: "#132339",
    gitAdded: "#3FB950",
    gitModified: "#4493F8",
    gitDeleted: "#F85149",
    gitRenamed: "#AB7DF8",
    gitUntracked: "#3FB950",
    gitConflict: "#D29922",
  },
  syntax: {
    light: {
      comment: "#6E7781",
      keyword: "#CF222E",
      string: "#0A3069",
      number: "#0550AE",
      type: "#953800",
      function: "#8250DF",
      variable: "#24292F",
      tag: "#116329",
      attribute: "#0550AE",
      regexp: "#0A3069",
      operator: "#CF222E",
    },
    dark: {
      comment: "#8B949E",
      keyword: "#FF7B72",
      string: "#A5D6FF",
      number: "#79C0FF",
      type: "#FFA657",
      function: "#D2A8FF",
      variable: "#E6EDF3",
      tag: "#7EE787",
      attribute: "#79C0FF",
      regexp: "#A5D6FF",
      operator: "#FF7B72",
    },
  },
  defaultContrast: 65,
};
