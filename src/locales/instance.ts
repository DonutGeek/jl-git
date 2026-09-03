import { createI18n } from "vue-i18n";

import enUS from "@/locales/lang/en";
import zhCN from "@/locales/lang/zh-CN";

/** vue-i18n 实例；setup / 门面共用，避免与 store 循环依赖 */
export const i18n = createI18n({
  legacy: false,
  locale: "zh-CN",
  fallbackLocale: "zh-CN",
  messages: {
    "zh-CN": zhCN.message,
    en: enUS.message,
  },
});
