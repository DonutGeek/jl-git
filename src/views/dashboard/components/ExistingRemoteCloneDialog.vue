<script setup lang="ts">
import { ref } from "vue";

import { Modal } from "antdv-next";
import { useI18n } from "vue-i18n";

import { ScrollArea } from "@/components/ScrollArea";

import type { ProjectRemoteMatch } from "@/types/project";
import { withSoftWrapOpportunities } from "@/utils/softWrapText";

defineOptions({ name: "ExistingRemoteCloneDialog" });

const emit = defineEmits<{
  continue: [openAfter: boolean];
}>();

const { t } = useI18n();
const visible = ref(false);
const matches = ref<ProjectRemoteMatch[]>([]);
const pendingOpenAfter = ref(true);

function open(nextMatches: ProjectRemoteMatch[], openAfter = true): void {
  matches.value = nextMatches;
  pendingOpenAfter.value = openAfter;
  visible.value = true;
}

function handleOpenChange(next: boolean): void {
  visible.value = next;
  if (!next) {
    matches.value = [];
  }
}

function handleOk(): void {
  const openAfter = pendingOpenAfter.value;
  visible.value = false;
  matches.value = [];
  emit("continue", openAfter);
}

defineExpose({ open });
</script>

<template>
  <Modal
    :open="visible"
    :title="t('cloneRepo.existingRemoteTitle')"
    :ok-text="t('cloneRepo.existingRemoteContinue')"
    :cancel-text="t('common.cancel')"
    @update:open="handleOpenChange"
    @ok="handleOk"
  >
    <div class="space-y-2 text-sm">
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
