<script setup lang="ts">
import { Modal } from "antdv-next";
import { useI18n } from "vue-i18n";

import type { Project } from "@/types/project";
import { withSoftWrapOpportunities } from "@/utils/softWrapText";

defineOptions({ name: "ExistingProjectDialog" });

const props = withDefaults(
  defineProps<{
    open: boolean;
    project: Project | null;
    action?: "open" | "view";
  }>(),
  { action: "open" },
);

const emit = defineEmits<{
  "update:open": [open: boolean];
  confirm: [project: Project];
}>();

const { t } = useI18n();

function handleOk(): void {
  if (props.project) {
    emit("confirm", props.project);
  }
}
</script>

<template>
  <Modal
    :open="open"
    :title="t('openRepo.existingTitle')"
    :ok-text="action === 'view' ? t('openRepo.existingView') : t('openRepo.existingOpen')"
    :cancel-text="t('common.cancel')"
    @update:open="(next: boolean) => emit('update:open', next)"
    @ok="handleOk"
  >
    <div class="space-y-2 text-sm">
      <div v-if="project" class="bg-muted/40 border-border rounded-md border px-3 py-2">
        <p class="font-medium">{{ project.name }}</p>
        <p class="text-muted-foreground mt-0.5 break-words text-xs">
          {{ withSoftWrapOpportunities(project.path) }}
        </p>
      </div>
    </div>
  </Modal>
</template>
