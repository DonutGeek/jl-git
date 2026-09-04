<script setup lang="ts">
import { onMounted, ref } from "vue";

import { Button, Descriptions, DescriptionsItem, Space, Tag, Typography } from "antdv-next";
import { useI18n } from "vue-i18n";

import { Icon } from "@/components/Icon";

import { useMessage } from "@/hooks/web/useMessage";

import { detectPostgres } from "@/api/setup";
import { openExternalUrl } from "@/api/system/open-url";

import type { SetupDetectResult } from "@/api/setup";

defineOptions({ name: "SetupEnvironmentStep" });

const emit = defineEmits<{
  /** 探测到的主机/端口用于回填连接表单默认值 */
  detected: [result: SetupDetectResult];
}>();

const { t } = useI18n();
const message = useMessage();
const detecting = ref(false);
const result = ref<SetupDetectResult | null>(null);

onMounted(() => {
  // 首次自动探测不弹提示，结果直接体现在下面的检测项里
  void detect(true);
});

async function detect(silent = false): Promise<void> {
  if (detecting.value) {
    return;
  }
  detecting.value = true;
  try {
    const detected = await detectPostgres();
    result.value = detected;
    emit("detected", detected);
    // 端口是否可连接由下面的检测项呈现，toast 只回答检测这个动作本身
    if (!silent) {
      message.success(t("setup.detect.success"));
    }
  } catch (error) {
    message.error(error);
  } finally {
    detecting.value = false;
  }
}

async function openDownloadPage(): Promise<void> {
  const url = result.value?.downloadUrl;
  if (!url) {
    return;
  }
  try {
    await openExternalUrl(url);
  } catch (error) {
    message.error(error);
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <Typography.Text strong>{{ t("setup.detect.title") }}</Typography.Text>

    <Descriptions :column="1" bordered size="small">
      <DescriptionsItem
        :label="
          t('setup.detect.port', {
            host: result?.host ?? '127.0.0.1',
            port: result?.port ?? 5432,
          })
        "
      >
        <Tag v-if="detecting">…</Tag>
        <Tag v-else-if="result?.portReachable" color="success">
          {{ t("setup.detect.portReachable") }}
        </Tag>
        <Tag v-else color="warning">{{ t("setup.detect.portUnreachable") }}</Tag>
      </DescriptionsItem>
      <DescriptionsItem :label="t('setup.detect.psql')">
        <Typography.Text v-if="result?.psqlVersion" code>
          {{ result.psqlVersion }}
        </Typography.Text>
        <Typography.Text v-else type="secondary">
          {{ t("setup.detect.psqlMissing") }}
        </Typography.Text>
      </DescriptionsItem>
    </Descriptions>

    <Space>
      <Button :loading="detecting" @click="detect()">
        <template #icon>
          <Icon name="RefreshCw" :size="16" />
        </template>
        {{ t("setup.actions.recheck") }}
      </Button>
      <Button type="link" :disabled="!result" @click="openDownloadPage">
        <template #icon>
          <Icon name="ExternalLink" :size="16" />
        </template>
        {{ t("setup.actions.download") }}
      </Button>
    </Space>
  </div>
</template>
