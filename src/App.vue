<script setup lang="ts">
import { computed } from "vue";

import { App as AntdApp, ConfigProvider } from "antdv-next";
import { useI18n } from "vue-i18n";

import { useTheme } from "@/hooks/setting/useTheme";
import { localeModules } from "@/locales";

import type { AppLocale } from "@/i18n/locale";

defineOptions({ name: "App" });

const { locale } = useI18n();
const { antdTheme } = useTheme();
const antdLocale = computed(() => localeModules[locale.value as AppLocale].antdLocale);
</script>

<template>
  <ConfigProvider :locale="antdLocale" :theme="antdTheme">
    <AntdApp class="h-full">
      <RouterView />
    </AntdApp>
  </ConfigProvider>
</template>
