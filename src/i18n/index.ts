import { i18n } from "@/locales/instance";

import type { AppLocale } from "@/i18n/locale";

type TranslateOptions = Record<string, unknown>;

function translate(key: string, options?: TranslateOptions): string {
  const locale = typeof options?.lng === "string" ? options.lng : undefined;
  const params: TranslateOptions = { ...options };
  delete params.lng;
  if (locale) {
    return String(i18n.global.t(key, params, locale));
  }
  return String(i18n.global.t(key, params));
}

/** 服务层兼容门面：`t` / `changeLanguage` 对齐旧 i18next 调用点 */
const i18nFacade = {
  t: translate,
  changeLanguage(locale: string): void {
    i18n.global.locale.value = locale as AppLocale;
  },
};

export default i18nFacade;
