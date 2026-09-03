<script setup lang="ts">
import { Spin } from "antdv-next";
import { useI18n } from "vue-i18n";

defineOptions({ name: "AppLoadingScreen" });

const { t } = useI18n();
</script>

<template>
  <main
    class="bg-background text-muted-foreground flex h-screen items-center justify-center gap-2 text-xs"
    aria-busy="true"
    :aria-label="t('common.loading')"
  >
    <Spin size="small" />
    <span>{{ t("common.loading") }}</span>
  </main>
</template>
