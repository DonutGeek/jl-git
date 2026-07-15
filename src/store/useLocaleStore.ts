import { create } from "zustand";
import { persist } from "zustand/middleware";

import i18n from "@/i18n";
import { applyLocaleSideEffects, type AppLocale } from "@/i18n/locale";
import {
  listenGlobalPreferenceChange,
  notifyGlobalPreferenceChange,
} from "@/services/window/globalPreferences";

interface LocaleState {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  toggleZhEn: () => void;
}

const LOCALE_STORAGE_KEY = "jlgit-locale";

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set, get) => ({
      locale: "zh-CN",

      setLocale(locale) {
        void i18n.changeLanguage(locale);
        applyLocaleSideEffects(locale);
        set({ locale });
        notifyGlobalPreferenceChange("locale");
      },

      toggleZhEn() {
        const next: AppLocale = get().locale === "zh-CN" ? "en" : "zh-CN";
        get().setLocale(next);
      },
    }),
    {
      name: LOCALE_STORAGE_KEY,
      onRehydrateStorage: () => (state) => {
        const locale = state?.locale ?? "zh-CN";
        void i18n.changeLanguage(locale);
        applyLocaleSideEffects(locale);
      },
    },
  ),
);

/** 启动时同步 i18n / dayjs（在 persist 水合前先用默认，水合后再校正） */
export function initLocale(): void {
  const locale = useLocaleStore.getState().locale;
  void i18n.changeLanguage(locale);
  applyLocaleSideEffects(locale);

  // 其他 WebView 修改语言时同步 i18n 与日期 locale。
  window.addEventListener("storage", (event) => {
    if (event.key === LOCALE_STORAGE_KEY) {
      void useLocaleStore.persist.rehydrate();
    }
  });

  void listenGlobalPreferenceChange((kind) => {
    if (kind === "locale") {
      void useLocaleStore.persist.rehydrate();
    }
  }).catch((error: unknown) => {
    console.error("Failed to listen for locale changes", error);
  });
}
