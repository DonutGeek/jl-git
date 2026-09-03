<script setup lang="ts">
import { computed } from "vue";

import { Button, Tooltip } from "antdv-next";
import { useI18n } from "vue-i18n";

import { Icon } from "@/components/Icon";
import { useHasAgentApiKey } from "@/hooks/core/useHasAgentApiKey";
import { useSettingsDrawerStore } from "@/store/modules/setting";
import type { SidebarView } from "@/utils/activityBarOrder";

defineOptions({ name: "ActivityBar" });

const props = defineProps<{
  /** 当前侧栏视图 */
  active: SidebarView;
}>();

const emit = defineEmits<{
  change: [view: SidebarView];
}>();

const { t } = useI18n();
const hasApiKey = useHasAgentApiKey();
const settingsDrawerStore = useSettingsDrawerStore();

const items = computed(() => [
  { id: "files" as const, icon: "FolderTree", label: t("repo.fileTree") },
  { id: "branches" as const, icon: "GitBranch", label: t("repo.branches") },
  { id: "tags" as const, icon: "Tag", label: t("repo.tags") },
  { id: "agent" as const, icon: "Sparkles", label: t("agent.title") },
]);

function handleClick(id: SidebarView): void {
  if (id === "agent" && !hasApiKey.value) {
    return;
  }
  emit("change", id);
}
</script>

<template>
  <nav
    class="border-border bg-muted/30 flex w-11 shrink-0 flex-col items-center gap-1 border-r py-2"
    :aria-label="t('repo.activityBar')"
  >
    <Tooltip v-for="item in items" :key="item.id" :title="item.label" placement="right">
      <Button
        size="small"
        class="size-8"
        :type="props.active === item.id ? 'primary' : 'text'"
        :ghost="props.active === item.id"
        :aria-label="item.label"
        :aria-pressed="props.active === item.id"
        :disabled="item.id === 'agent' && !hasApiKey"
        @click="handleClick(item.id)"
      >
        <Icon :name="item.icon" :size="16" />
      </Button>
    </Tooltip>
    <div class="flex-1" />
    <Tooltip :title="t('repo.settings')" placement="right">
      <Button
        type="text"
        size="small"
        class="size-8"
        :aria-label="t('repo.settings')"
        @click="settingsDrawerStore.openDrawer()"
      >
        <Icon name="Settings" :size="16" />
      </Button>
    </Tooltip>
  </nav>
</template>
