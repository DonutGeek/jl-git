<script setup lang="ts">
import { Layout, LayoutContent, LayoutFooter, LayoutHeader } from "antdv-next";

import LayoutPageContent from "./content/index.vue";
import LayoutFeatures from "./feature/index.vue";
import LayoutPageFooter from "./footer/index.vue";
import LayoutPageHeader from "./header/index.vue";
import LayoutSetting from "./setting/index.vue";
import LayoutSider from "./sider/index.vue";
import { useAppLayout } from "./hooks/useAppLayout";

defineOptions({ name: "DefaultLayout" });

/**
 * 主窗外壳，目录对齐 vben 2：header / content / footer / setting / feature。
 * 子路由由 WorkspaceHost 按 path 保活，RouterView 仅用于匹配。
 */
useAppLayout();
</script>

<template>
  <Layout class="jlgit-app-layout">
    <LayoutSider />
    <LayoutHeader class="jlgit-app-layout__header">
      <LayoutPageHeader />
    </LayoutHeader>
    <LayoutContent class="jlgit-app-layout__content">
      <LayoutPageContent />
      <div hidden>
        <RouterView />
      </div>
    </LayoutContent>
    <LayoutFooter class="jlgit-app-layout__footer">
      <LayoutPageFooter />
    </LayoutFooter>
    <LayoutFeatures />
    <LayoutSetting />
  </Layout>
</template>

<style scoped>
.jlgit-app-layout {
  height: 100vh;
  overflow: hidden;
}

.jlgit-app-layout :deep(.jlgit-app-layout__header.ant-layout-header) {
  height: auto;
  padding: 0;
  line-height: normal;
  background: transparent;
}

.jlgit-app-layout :deep(.jlgit-app-layout__content.ant-layout-content) {
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

.jlgit-app-layout :deep(.jlgit-app-layout__footer.ant-layout-footer) {
  padding: 0;
  line-height: normal;
  background: transparent;
}
</style>
