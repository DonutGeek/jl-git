<script setup lang="ts">
import { ref } from "vue";

import { Button, Spin, Typography } from "antdv-next";
import { useI18n } from "vue-i18n";

import { useMessage } from "@/hooks/web/useMessage";

import { initDatabase, saveDbConfig } from "@/api/setup";

import type { SetupConnectionInput } from "@/api/setup";

defineOptions({ name: "SetupInitializeStep" });

interface Props {
  config: SetupConnectionInput;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  /** 建库 + 迁移 + 落盘装池全部成功 */
  completed: [];
}>();

const { t } = useI18n();
const message = useMessage();
const running = ref(false);
/** 只用来把按钮文案切成「重试」，具体原因由 toast 呈现 */
const failed = ref(false);

/** 建库跑迁移后立刻落盘装池：两步都成功才算配通 */
async function run(): Promise<void> {
  if (running.value) {
    return;
  }
  running.value = true;
  failed.value = false;
  try {
    await initDatabase(props.config);
    await saveDbConfig(props.config);
    message.success(t("setup.init.success"));
    emit("completed");
  } catch (error) {
    failed.value = true;
    message.error(error);
  } finally {
    running.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <Typography.Text strong>{{ t("setup.init.title") }}</Typography.Text>

    <div v-if="running" class="flex items-center gap-2">
      <Spin size="small" />
      <Typography.Text type="secondary">{{ t("setup.init.running") }}</Typography.Text>
    </div>

    <div>
      <Button type="primary" :loading="running" @click="run">
        {{ failed ? t("setup.actions.retry") : t("setup.actions.init") }}
      </Button>
    </div>
  </div>
</template>
