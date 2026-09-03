<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";

import { Layout, LayoutContent, LayoutHeader } from "antdv-next";
import { useI18n } from "vue-i18n";

import { Icon } from "@/components/Icon";

import AppWindowHeader from "./AppWindowHeader.vue";

defineOptions({ name: "PageLayout" });

/**
 * 子窗壳（项目管理等独立 WebView）。
 * 仓库类子窗自己带标题栏时，把 `meta.windowHeader` 设为 false。
 */
const route = useRoute();
const { t } = useI18n();

const showWindowHeader = computed(() => route.meta.windowHeader === true);
const headerIcon = computed(() => route.meta.headerIcon);
const title = computed(() => (route.meta.title ? t(String(route.meta.title)) : ""));
</script>

<template>
  <Layout class="jlgit-page-layout">
    <LayoutHeader v-if="showWindowHeader" class="jlgit-page-layout__header">
      <AppWindowHeader>
        <Icon v-if="headerIcon" :name="headerIcon" :size="16" class="shrink-0" />
        <span class="truncate text-sm font-medium">{{ title }}</span>
      </AppWindowHeader>
    </LayoutHeader>
    <LayoutContent class="jlgit-page-layout__content">
      <RouterView />
    </LayoutContent>
  </Layout>
</template>

<style scoped>
.jlgit-page-layout {
  height: 100vh;
  overflow: hidden;
}

.jlgit-page-layout :deep(.jlgit-page-layout__header.ant-layout-header) {
  height: auto;
  padding: 0;
  line-height: normal;
  background: transparent;
}

.jlgit-page-layout :deep(.jlgit-page-layout__content.ant-layout-content) {
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}
</style>
