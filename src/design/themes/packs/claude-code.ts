import {
  APP_THEME_CLAUDE_CODE,
  type AppThemePack,
} from "@/design/themes/types";

/**
 * Claude Code — 对齐 Anthropic 公开品牌色 / Claude 产品暖纸感
 * 来源：
 * - Anthropic 品牌原子：Ivory `#FAF9F5`、Slate `#141413`、Clay `#D97757`
 * - brand-atoms.com/brands/anthropic、claude.ai / Anthropic 站点观感
 * - Claude Code CLI 主题可自定义；桌面整站用品牌 clay 作强调，深色底用 slate
 * 说明：CLI 默认跟随终端底色，无单一 hex；产品级以 Anthropic 设计 token 为准。
 */
export const claudeCodePack: AppThemePack = {
  id: APP_THEME_CLAUDE_CODE,
  labelKey: "settings.appThemeClaudeCode",
  nativeTokens: false,
  light: {
    accent: "#D97757",
    background: "#FAF9F5",
    foreground: "#141413",
  },
  dark: {
    accent: "#D97757",
    background: "#141413",
    foreground: "#FAF9F5",
  },
  defaultContrast: 55,
};
