<script setup lang="ts">
import RepoTabBar from "./RepoTabBar.vue";

defineOptions({ name: "LayoutHeader" });
</script>

<template>
  <!-- 主窗顶栏：多仓标签。JLGit 没有后台那种 Logo + 面包屑 Header。 -->
  <RepoTabBar />
</template>
