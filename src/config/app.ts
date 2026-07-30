function envText(value: string | undefined, fallback: string): string {
  const normalized = value?.trim();
  return normalized || fallback;
}

export const APP_NAME_ZH = envText(import.meta.env.VITE_APP_NAME_ZH, "鲸灵Git");
export const APP_NAME_EN = envText(import.meta.env.VITE_APP_NAME_EN, "JLGit");

export function getAppDisplayName(locale: string): string {
  return locale === "zh-CN" || locale === "Simplified Chinese" ? APP_NAME_ZH : APP_NAME_EN;
}
