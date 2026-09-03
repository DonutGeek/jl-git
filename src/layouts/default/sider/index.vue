<script setup lang="ts">
/**
 * vben 的 Sider 是后台全局菜单。
 * JLGit 主窗没有应用级侧栏；仓库活动栏在 `views/repo`，不在这里挂。
 */
defineOptions({ name: "LayoutSider" });
</script>

<template>
  <aside v-if="false" aria-hidden="true" />
</template>
