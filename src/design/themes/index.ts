/**
 * 主题辅助：色运算 + 清掉旧主题包 inline Token。
 * 昼夜由 `html.dark` 切换；组件样式以 antdv-next 为准。
 */

export {
  COLOR_INPUT_FORMATS,
  contrastingForeground,
  formatColor,
  hexToHsv,
  hsvToHex,
  isDocumentDark,
  normalizeContrast,
  normalizeHexColor,
  parseCssColor,
  type ColorInputFormat,
} from "@/design/themes/color-utils";

export {
  APP_THEME_BOOT_STORAGE_KEY,
  clearAppThemeTokenOverrides,
} from "@/design/themes/apply-document";
