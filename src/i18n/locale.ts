import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import "dayjs/locale/en";

export type AppLocale = "zh-CN" | "en";

/** 语言切换时的附属效果（日期等） */
export function applyLocaleSideEffects(locale: AppLocale): void {
  dayjs.locale(locale === "zh-CN" ? "zh-cn" : "en");
  document.documentElement.lang = locale === "zh-CN" ? "zh-CN" : "en";
}
