<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";

import { Button, Card, Result, Space, Steps, Typography } from "antdv-next";
import { useI18n } from "vue-i18n";

import { ScrollArea } from "@/components/ScrollArea";

import { useMessage } from "@/hooks/web/useMessage";

import { getSetupStatus } from "@/api/setup";
import { markSetupReady } from "@/utils/localServerBootstrap";

import ConnectionStep from "./components/ConnectionStep.vue";
import EnvironmentStep from "./components/EnvironmentStep.vue";
import InitializeStep from "./components/InitializeStep.vue";

import type { SetupConnectionInput, SetupDetectResult } from "@/api/setup";

defineOptions({ name: "SetupWizard" });

const router = useRouter();
const { t } = useI18n();
const message = useMessage();

const current = ref(0);
/** 探测建议值与已保存配置分开存，避免两个异步请求的先后顺序影响回填结果 */
const detectedConfig = ref<Partial<SetupConnectionInput>>({});
const savedConfig = ref<Partial<SetupConnectionInput>>({});
const config = ref<SetupConnectionInput | null>(null);
// 已填过的值优先级最高：初始化失败后退回上一步改口令时，表单不能被重置
const initialConfig = computed<Partial<SetupConnectionInput>>(() => ({
  ...detectedConfig.value,
  ...savedConfig.value,
  ...(config.value ?? {}),
}));
const completed = ref(false);
/** 「下一步」要等连接校验回来，期间显示 loading 并拦截重复点击 */
const advancing = ref(false);
const connectionRef = ref<{
  collect: () => Promise<SetupConnectionInput | null>;
} | null>(null);

const steps = computed(() => [
  { title: t("setup.steps.detect") },
  { title: t("setup.steps.connect") },
  { title: t("setup.steps.init") },
  { title: t("setup.steps.done") },
]);

onMounted(() => {
  void loadSavedConfig();
});

/** 曾配过但连不上时回填旧参数，用户只需改口令 */
async function loadSavedConfig(): Promise<void> {
  try {
    const status = await getSetupStatus();
    if (status.config) {
      savedConfig.value = status.config;
    }
  } catch {
    // 未配置时 status 也可能失败，向导用探测到的默认值即可
  }
}

/** 默认值以后端 `DbConfig::default()` 为准，前端不再硬编码一份 */
function handleDetected(result: SetupDetectResult): void {
  detectedConfig.value = {
    host: result.host,
    port: result.port,
    user: result.suggestedUser,
    database: result.suggestedDatabase,
  };
}

/** 连接配置步要真连通才放行，失败原因由该步自己就地展示 */
async function next(): Promise<void> {
  if (current.value !== 1) {
    current.value += 1;
    return;
  }
  if (advancing.value) {
    return;
  }
  advancing.value = true;
  try {
    const collected = await connectionRef.value?.collect();
    if (!collected) {
      return;
    }
    config.value = collected;
    current.value += 1;
  } finally {
    advancing.value = false;
  }
}

function back(): void {
  current.value = Math.max(0, current.value - 1);
}

function handleCompleted(): void {
  completed.value = true;
  current.value = 3;
}

/** 解除守卫的强制重定向后再跳主界面 */
async function enterApp(): Promise<void> {
  markSetupReady();
  try {
    await router.replace("/");
  } catch (error) {
    message.error(error);
  }
}
</script>

<template>
  <ScrollArea class="h-full">
    <div class="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center gap-6 px-6 py-10">
      <Typography.Title :level="3" class="mb-0!">{{ t("setup.heading") }}</Typography.Title>

      <Steps :current="current" :items="steps" size="small" />

      <Card>
        <EnvironmentStep v-if="current === 0" @detected="handleDetected" />

        <ConnectionStep v-else-if="current === 1" ref="connectionRef" :initial="initialConfig" />

        <InitializeStep
          v-else-if="current === 2 && config"
          :config="config"
          @completed="handleCompleted"
        />

        <Result
          v-else-if="current === 3"
          status="success"
          :title="t('setup.done.title')"
          :sub-title="t('setup.done.subtitle')"
        />
      </Card>

      <Space>
        <Button v-if="current > 0 && current < 3" :disabled="completed || advancing" @click="back">
          {{ t("setup.actions.back") }}
        </Button>
        <Button v-if="current < 2" type="primary" :loading="advancing" @click="next">
          {{ t("setup.actions.next") }}
        </Button>
        <Button v-if="current === 3" type="primary" @click="enterApp">
          {{ t("setup.actions.enter") }}
        </Button>
      </Space>
    </div>
  </ScrollArea>
</template>
