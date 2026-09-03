import antdLocale from "antdv-next/locale/en_US";

import messages from "@/i18n/locales/en";

import { toVueI18nMessages, type LocaleMessage } from "@/locales/helper";

export default {
  message: toVueI18nMessages(messages) as LocaleMessage,
  antdLocale,
  dateLocaleName: "en",
};
