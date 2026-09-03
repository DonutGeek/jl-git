<script setup lang="ts">
import { computed } from "vue";

import { Button, Tooltip, message } from "antdv-next";
import { useI18n } from "vue-i18n";

import { Icon } from "@/components/Icon";
import { useHasAgentApiKey } from "@/hooks/core/useHasAgentApiKey";
import { cn } from "@/lib/utils";
import { openMultiAgentWindow } from "@/services/window/multiAgentWindow";
import { toUserMessage } from "@/types/error";

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
    message.error(toUserMessage(error) || t("multiAgent.openFailed"));
  }
}
</script>

<template>
  <Tooltip :title="accessibleLabel" :placement="tooltipSide">
    <Button
      type="text"
      size="small"
      :class="cn('text-muted-foreground', className)"
      :aria-label="accessibleLabel"
      :disabled="!hasApiKey"
      @click="void handleOpen()"
    >
      <Icon name="Sparkles" :class="iconClassName" :size="14" />
    </Button>
  </Tooltip>
</template>
