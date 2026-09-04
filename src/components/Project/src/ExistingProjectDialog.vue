<script setup lang="ts">
import { ref } from "vue";

import { Modal } from "antdv-next";
import { useI18n } from "vue-i18n";

import type { ExistingProjectOpenPayload, Project } from "@/types/project";
import { withSoftWrapOpportunities } from "@/utils/softWrapText";

defineOptions({ name: "ExistingProjectDialog" });

const emit = defineEmits<{
  confirm: [project: Project];
}>();

const { t } = useI18n();
const visible = ref(false);
const project = ref<Project | null>(null);
const action = ref<"open" | "view">("open");

function open(payload: ExistingProjectOpenPayload): void {
  project.value = payload.project;
  action.value = payload.action ?? "open";
  visible.value = true;
}

function handleOpenChange(next: boolean): void {
  visible.value = next;
  if (!next) {
    project.value = null;
  }
}

function handleOk(): void {
  if (!project.value) {
    return;
  }
  emit("confirm", project.value);
  visible.value = false;
  project.value = null;
}

defineExpose({ open });
</script>

<template>
  <Modal
    :open="visible"
    :title="t('openRepo.existingTitle')"
    :ok-text="action === 'view' ? t('openRepo.existingView') : t('openRepo.existingOpen')"
    :cancel-text="t('common.cancel')"
    @update:open="handleOpenChange"
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
