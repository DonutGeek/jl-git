<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";

import { Drawer, Empty, Form, FormItem, Menu, Segmented, Typography } from "antdv-next";
import { useI18n } from "vue-i18n";

import { Icon } from "@/components/Icon";
import { ScrollArea } from "@/components/ScrollArea";
import { useZustand } from "@/hooks/core/useZustand";
import { getAppInfo, type SystemAppInfo } from "@/services/system/system.info";
import {
  useAppPrefsStore,
  useAppPrefsStoreWithOut,
  type StartupTabsMode,
} from "@/store/modules/app";
import { useLocaleStore } from "@/store/modules/locale";
import { useSettingsDrawerStore, type SettingsDrawerCategory } from "@/store/modules/setting";
import { useThemeStore } from "@/store/modules/theme";

import type { ThemeMode } from "@/services/theme/theme.service";

defineOptions({ name: "SettingsDrawer" });

const { t } = useI18n();
const settingsDrawerStore = useSettingsDrawerStore();
const themeStore = useThemeStore();
const localeStore = useLocaleStore();
const { open, requestedCategory } = storeToRefs(settingsDrawerStore);
const { mode: themeMode } = storeToRefs(themeStore);
const { locale } = storeToRefs(localeStore);
const startupTabsMode = useZustand(useAppPrefsStore, (state) => state.startupTabsMode);
const activeCategory = ref<SettingsDrawerCategory>("appearance");
const appInfo = ref<SystemAppInfo | null>(null);

const categories = computed(() => [
  { key: "appearance", label: t("settings.sectionAppearance"), icon: "Palette" },
  { key: "git", label: t("settings.sectionGit"), icon: "GitBranch" },
  { key: "ssh", label: t("settings.sectionSsh"), icon: "KeyRound" },
  { key: "ai", label: t("settings.sectionAi"), icon: "Sparkles" },
  { key: "tools", label: t("settings.sectionTools"), icon: "Terminal" },
  { key: "data", label: t("settings.sectionData"), icon: "Database" },
  { key: "general", label: t("settings.sectionGeneral"), icon: "Settings2" },
  { key: "shortcuts", label: t("settings.sectionShortcuts"), icon: "Keyboard" },
  { key: "performance", label: t("settings.sectionPerformance"), icon: "Activity" },
  { key: "about", label: t("settings.sectionAbout"), icon: "Info" },
]);

const menuItems = computed(() =>
  categories.value.map((item) => ({
    key: item.key,
    label: item.label,
    icon: undefined,
  })),
);

watch(requestedCategory, (category) => {
  if (category) {
    activeCategory.value = category;
    settingsDrawerStore.clearRequestedCategory();
  }
});

onMounted(() => {
  void getAppInfo()
    .then((info) => {
      appInfo.value = info;
    })
    .catch(() => {
      appInfo.value = null;
    });
});

const themeOptions = computed(() => [
  { label: t("settings.themeLight"), value: "light" },
  { label: t("settings.themeDark"), value: "dark" },
  { label: t("settings.themeSystem"), value: "system" },
]);

const localeOptions = computed(() => [
  { label: t("settings.localeZh"), value: "zh-CN" },
  { label: t("settings.localeEn"), value: "en" },
]);

const startupOptions = computed(() => [
  { label: t("settings.startupTabsRestore"), value: "restore" },
  { label: t("settings.startupTabsFresh"), value: "fresh" },
]);

function handleThemeChange(value: string | number): void {
  themeStore.setMode(value as ThemeMode);
}

function handleLocaleChange(value: string | number): void {
  localeStore.setLocale(value === "en" ? "en" : "zh-CN");
}

function handleStartupChange(value: string | number): void {
  useAppPrefsStoreWithOut().setStartupTabsMode(value as StartupTabsMode);
}
</script>

<template>
  <Drawer
    :open="open"
    placement="right"
    :width="720"
    :title="t('settings.title')"
    @close="settingsDrawerStore.closeDrawer"
  >
    <div class="flex h-full min-h-0 gap-4">
      <Menu
        class="w-44 shrink-0"
        mode="inline"
        :selected-keys="[activeCategory]"
        :items="menuItems"
        @click="({ key }) => (activeCategory = key as SettingsDrawerCategory)"
      />
      <ScrollArea class="min-h-0 min-w-0 flex-1">
        <section v-if="activeCategory === 'appearance'" class="pr-2">
          <Typography.Title :level="5">{{ t("settings.sectionAppearance") }}</Typography.Title>
          <Form layout="vertical">
            <FormItem :label="t('settings.theme')">
              <Segmented :value="themeMode" :options="themeOptions" @change="handleThemeChange" />
            </FormItem>
            <FormItem :label="t('settings.language')">
              <Segmented :value="locale" :options="localeOptions" @change="handleLocaleChange" />
            </FormItem>
          </Form>
        </section>

        <section v-else-if="activeCategory === 'general'" class="pr-2">
          <Typography.Title :level="5">{{ t("settings.sectionGeneral") }}</Typography.Title>
          <Form layout="vertical">
            <FormItem :label="t('settings.startupTabs')">
              <Segmented
                :value="startupTabsMode"
                :options="startupOptions"
                @change="handleStartupChange"
              />
            </FormItem>
          </Form>
        </section>

        <section v-else-if="activeCategory === 'about'" class="space-y-3 pr-2">
          <Typography.Title :level="5">{{ t("settings.sectionAbout") }}</Typography.Title>
          <p class="text-sm">{{ t("common.productName") }}</p>
          <p v-if="appInfo" class="text-muted-foreground text-xs">
            {{ appInfo.version }}{{ appInfo.arch ? ` · ${appInfo.arch}` : "" }}
          </p>
        </section>

        <Empty v-else :description="t('common.migrationDescription')" class="py-16">
          <template #image>
            <Icon
              :name="categories.find((item) => item.key === activeCategory)?.icon ?? 'Settings'"
              :size="32"
            />
          </template>
        </Empty>
      </ScrollArea>
    </div>
  </Drawer>
</template>
