export type LocaleMessage = { [key: string]: string | LocaleMessage };

const I18NEXT_INTERPOLATION = /\{\{(\w+)\}\}/g;

/** 把 i18next 的 `{{name}}` 收成 vue-i18n 的 `{name}`，过渡期共用现有 JSON */
export function toVueI18nMessages(input: unknown): LocaleMessage | string {
  if (typeof input === "string") {
    return input.replace(I18NEXT_INTERPOLATION, "{$1}");
  }

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  const result: LocaleMessage = {};
  for (const [key, value] of Object.entries(input)) {
    result[key] = toVueI18nMessages(value);
  }
  return result;
}
