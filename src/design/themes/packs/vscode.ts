import {
  APP_THEME_VSCODE,
  type AppThemePack,
} from "@/design/themes/types";

/**
 * VS Code — 当前默认「Modern」主题色（非旧 Dark+）
 * 来源：microsoft/vscode `extensions/theme-defaults/themes/`
 * - dark_modern.json：sideBar/panel `#181818`，foreground `#CCCCCC`，button/focus `#0078D4`
 * - light_modern.json：editor `#FFFFFF`，foreground `#3B3B3B`，button `#005FB8`
 * 整站背景取 workbench 侧栏底，更接近打开 VS Code 时的整体观感。
 */
export const vscodePack: AppThemePack = {
  id: APP_THEME_VSCODE,
  labelKey: "settings.appThemeVscode",
  nativeTokens: false,
  light: {
    accent: "#005FB8",
    background: "#FFFFFF",
    foreground: "#3B3B3B",
  },
  dark: {
    accent: "#0078D4",
    background: "#181818",
    foreground: "#CCCCCC",
  },
  defaultContrast: 60,
};
