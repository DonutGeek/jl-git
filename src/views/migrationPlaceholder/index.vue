<script setup lang="ts">
import { Empty, Typography } from "antdv-next";
import { useI18n } from "vue-i18n";

import { Icon } from "@/components/Icon";

defineOptions({ name: "MigrationPlaceholder" });

const { t } = useI18n();
</script>

<template>
  <main class="flex h-full min-h-screen items-center justify-center px-6">
    <Empty :description="null">
      <template #image>
        <Icon name="Layers" :size="36" class="text-muted-foreground" />
      </template>
      <Typography.Title :level="4" class="!mb-2">
        {{ t("common.migrationTitle") }}
      </Typography.Title>
      <Typography.Paragraph class="text-muted-foreground !mb-0 max-w-md text-center">
        {{ t("common.migrationDescription") }}
      </Typography.Paragraph>
    </Empty>
  </main>
</template>
