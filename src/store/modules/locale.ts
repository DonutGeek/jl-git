import { defineStore } from "pinia";

import i18n from "@/i18n";
import { applyLocaleSideEffects, type AppLocale } from "@/i18n/locale";
import { store } from "@/store";
import { deserializeZustandPersist, serializeZustandPersist } from "@/store/plugin/zustandPersist";
import {
  listenGlobalPreferenceChange,
  notifyGlobalPreferenceChange,
} from "@/services/window/globalPreferences";

/** 与旧 Zustand persist 同一把钥匙，跨窗口 storage 事件才能对上 */
const LOCALE_STORAGE_KEY = "jlgit-locale";

interface LocaleState {
  /** 当前界面语言；默认简体中文 */
  locale: AppLocale;
}

export const useLocaleStore = defineStore("locale", {
  state: (): LocaleState => ({
    locale: "zh-CN",
  }),
  actions: {
    /** 切换语言：同步 vue-i18n / dayjs，并通知其它 WebView */
    setLocale(locale: AppLocale): void {
      void i18n.changeLanguage(locale);
      applyLocaleSideEffects(locale);
      this.locale = locale;
      notifyGlobalPreferenceChange("locale");
    },
    /** 状态栏中英一键切换 */
    toggleZhEn(): void {
      const next: AppLocale = this.locale === "zh-CN" ? "en" : "zh-CN";
      this.setLocale(next);
    },
  },
  persist: {
    key: LOCALE_STORAGE_KEY,
    serializer: {
      deserialize: deserializeZustandPersist<LocaleState>,
      serialize: (value) => serializeZustandPersist(value),
    },
  },
});

/** setup 外取 store，对齐 vben `useXxxStoreWithOut` */
export function useLocaleStoreWithOut() {
  return useLocaleStore(store);
}

/** 启动时同步 i18n / dayjs；persist 水合前先用默认，水合后再校正 */
export function initLocale(): void {
  const localeStore = useLocaleStoreWithOut();
  void i18n.changeLanguage(localeStore.locale);
  applyLocaleSideEffects(localeStore.locale);

  // 其它 WebView 改语言时，从同源 localStorage 再水合一遍
  window.addEventListener("storage", (event) => {
    if (event.key === LOCALE_STORAGE_KEY) {
      localeStore.$hydrate();
    }
  });

  void listenGlobalPreferenceChange((kind) => {
    if (kind === "locale") {
      localeStore.$hydrate();
    }
  }).catch((error: unknown) => {
    console.error("Failed to listen for locale changes", error);
  });
}
