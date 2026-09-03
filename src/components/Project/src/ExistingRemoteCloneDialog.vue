<script setup lang="ts">
import { Modal } from "antdv-next";
import { useI18n } from "vue-i18n";

import { ScrollArea } from "@/components/ScrollArea";
import type { ProjectRemoteMatch } from "@/types/project";
import { withSoftWrapOpportunities } from "@/utils/softWrapText";

defineOptions({ name: "ExistingRemoteCloneDialog" });

defineProps<{
  open: boolean;
  matches: ProjectRemoteMatch[];
}>();

const emit = defineEmits<{
  "update:open": [open: boolean];
  continue: [];
}>();

const { t } = useI18n();
</script>

<template>
  <Modal
    :open="open"
    :title="t('cloneRepo.existingRemoteTitle')"
    :ok-text="t('cloneRepo.existingRemoteContinue')"
    :cancel-text="t('common.cancel')"
    @update:open="(next: boolean) => emit('update:open', next)"
    @ok="emit('continue')"
  >
    <div class="space-y-2 text-sm">
      <p class="text-muted-foreground">{{ t("cloneRepo.existingRemoteDescription") }}</p>
      <ScrollArea class="border-border max-h-40 rounded-md border">
        <ul class="space-y-2 p-3">
          <li v-for="item in matches" :key="item.id">
            <p class="font-medium">{{ item.name }}</p>
            <p class="text-muted-foreground break-words text-xs">
              {{ withSoftWrapOpportunities(item.path) }}
            </p>
          </li>
        </ul>
      </ScrollArea>
    </div>
  </Modal>
</template>
