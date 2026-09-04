<script setup lang="ts">
import { computed } from "vue";

import { Button, Tooltip } from "antdv-next";
import { useI18n } from "vue-i18n";

import { Icon } from "@/components/Icon";
import { useHasAgentApiKey } from "@/hooks/core/useHasAgentApiKey";
import { useMessage } from "@/hooks/web/useMessage";
import { cn } from "@/lib/utils";
import { openMultiAgentWindow } from "@/services/window/multiAgentWindow";

defineOptions({ name: "MultiAgentWindowButton" });

const props = withDefaults(
  defineProps<{
    label: string;
    className?: string;
    iconClassName?: string;
    tooltipSide?: "top" | "right" | "bottom" | "left";
  }>(),
  { className: "", iconClassName: "", tooltipSide: "top" },
);

const { t } = useI18n();
const message = useMessage();
const hasApiKey = useHasAgentApiKey();
const accessibleLabel = computed(() =>
  hasApiKey.value ? props.label : t("common.aiApiKeyRequired"),
);

async function handleOpen(): Promise<void> {
  if (!hasApiKey.value) {
    return;
  }
  try {
    await openMultiAgentWindow();
  } catch (error) {
    message.error(error);
  }
}
</script>

<template>
  <Tooltip :title="accessibleLabel" :placement="tooltipSide">
    <Button
      type="text"
      size="small"
      :class="cn('text-muted-foreground', className)"
      :disabled="!hasApiKey"
      @click="handleOpen"
    >
      <template #icon>
        <Icon name="Sparkles" :class="iconClassName" :size="14" />
      </template>
    </Button>
  </Tooltip>
</template>
