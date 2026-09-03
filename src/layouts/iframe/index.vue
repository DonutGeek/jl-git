<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";

import { Layout, LayoutContent } from "antdv-next";

defineOptions({ name: "FrameLayout" });

/**
 * 对齐 vben iframe 布局：路由 `meta.frameSrc` 时内嵌页面。
 * JLGit 目前没有后台那种外链菜单，有 frameSrc 才渲染 iframe。
 */
const route = useRoute();
const frameSrc = computed(() => {
  const src = route.meta.frameSrc;
  return typeof src === "string" && src.length > 0 ? src : "";
});
</script>

<template>
  <Layout class="h-screen overflow-hidden">
    <LayoutContent class="min-h-0">
      <iframe
        v-if="frameSrc"
        class="h-full w-full border-0"
        :src="frameSrc"
        :title="String(route.meta.title ?? 'frame')"
      />
      <RouterView v-else />
    </LayoutContent>
  </Layout>
</template>
