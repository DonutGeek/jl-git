import {
  APP_THEME_CODEX,
  type AppThemePack,
} from "@/design/themes/types";

/**
 * Codex（OpenAI Codex 桌面应用观感）
 * 来源：
 * - Codex App Appearance / `codex-theme-v1`：surface（底）、ink（字）、accent（强调）
 * - 默认深色界面常见为近黑 surface + 亮蓝强调（与 ChatGPT/Codex 桌面一致）
 * - 社区与官方分享串字段约定见 openai/codex 主题文档；默认蓝强调约 `#339CFF`
 * 浅色：白底 + 近黑字 + 同系蓝，对齐 Codex Appearance 浅色默认倾向。
 */
export const codexPack: AppThemePack = {
  id: APP_THEME_CODEX,
  labelKey: "settings.appThemeCodex",
  nativeTokens: false,
  light: {
    accent: "#2563EB",
    background: "#FFFFFF",
    foreground: "#0B0B0F",
  },
  dark: {
    accent: "#339CFF",
    background: "#181818",
    foreground: "#F5F5F5",
  },
  defaultContrast: 60,
};
