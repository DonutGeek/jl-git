<script setup lang="ts">
import { Empty } from "antdv-next";
import { useI18n } from "vue-i18n";

import { Icon } from "@/components/Icon";

defineOptions({ name: "RepoSidebarPlaceholder" });

defineProps<{
  title: string;
  description: string;
  icon: string;
}>();

const { t } = useI18n();
</script>

<template>
  <div class="flex h-full items-center justify-center px-4">
    <Empty>
      <template #image>
        <Icon :name="icon" :size="28" class="text-muted-foreground" />
      </template>
      <template #description>
        <p class="text-sm font-medium">{{ title }}</p>
        <p class="text-muted-foreground mt-1 max-w-xs text-center text-xs">{{ description }}</p>
        <p class="text-muted-foreground mt-2 text-center text-[11px]">
          {{ t("common.migrationDescription") }}
        </p>
      </template>
    </Empty>
  </div>
</template>
