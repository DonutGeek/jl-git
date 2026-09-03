import antdLocale from "antdv-next/locale/zh_CN";

import messages from "@/i18n/locales/zh-CN";

import { toVueI18nMessages, type LocaleMessage } from "@/locales/helper";

export default {
  message: toVueI18nMessages(messages) as LocaleMessage,
  antdLocale,
  dateLocaleName: "zh-cn",
};
