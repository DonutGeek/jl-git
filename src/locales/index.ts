import type { App } from "vue";

import { applyLocaleSideEffects, type AppLocale } from "@/i18n/locale";
import { i18n } from "@/locales/instance";
import enUS from "@/locales/lang/en";
import zhCN from "@/locales/lang/zh-CN";
import { useLocaleStore } from "@/store/modules/locale";

export { i18n };

export const localeModules = {
  "zh-CN": zhCN,
  en: enUS,
} as const;

export function setLocale(locale: AppLocale): void {
  i18n.global.locale.value = locale;
  applyLocaleSideEffects(locale);
}

export function setupI18n(app: App): void {
  app.use(i18n);
  const localeStore = useLocaleStore();
  setLocale(localeStore.locale);
  localeStore.$subscribe((_mutation, state) => {
    setLocale(state.locale);
  });
}
