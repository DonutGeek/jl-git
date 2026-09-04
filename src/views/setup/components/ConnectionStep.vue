<script setup lang="ts">
import { ref, watch } from "vue";

import { Button, Col, Form, FormItem, Input, InputNumber, InputPassword, Row } from "antdv-next";
import { useI18n } from "vue-i18n";

import { useForm } from "@/hooks/web/useForm";
import { useMessage } from "@/hooks/web/useMessage";

import { testDbConnection } from "@/api/setup";

import type { SetupConnectionInput } from "@/api/setup";

defineOptions({ name: "SetupConnectionStep" });

interface Props {
  /** 环境检测结果与已保存配置的回填值 */
  initial?: Partial<SetupConnectionInput>;
}

const props = defineProps<Props>();

const { t } = useI18n();
const message = useMessage();

/** 仅作探测结果到达前的占位；真正的默认值由 `/api/setup/detect` 下发 */
function createForm(): SetupConnectionInput {
  return {
    host: "127.0.0.1",
    port: 5432,
    user: "",
    password: "",
    database: "jl_git",
  };
}

const { form, formInst, rules, validate } = useForm(createForm, () => ({
  host: [{ required: true, whitespace: true, message: () => t("setup.form.required.host") }],
  port: [{ required: true, type: "number", message: () => t("setup.form.required.port") }],
  user: [{ required: true, whitespace: true, message: () => t("setup.form.required.user") }],
  database: [
    { required: true, whitespace: true, message: () => t("setup.form.required.database") },
    {
      pattern: /^[A-Za-z_][A-Za-z0-9_]*$/,
      message: () => t("setup.form.databasePattern"),
    },
  ],
}));

const testing = ref(false);

const placeholder = createForm();
/** 上一次回填进表单的值，用来区分「用户改过」与「还是默认值」 */
const applied: Partial<SetupConnectionInput> = {};

/** 探测结果可能晚于本步挂载到达，此时不能冲掉用户已经改过的字段 */
function assignIfUntouched<K extends keyof SetupConnectionInput>(
  key: K,
  next: SetupConnectionInput[K] | undefined,
): void {
  if (next === undefined) {
    return;
  }
  if (form[key] !== (applied[key] ?? placeholder[key])) {
    return;
  }
  form[key] = next;
  applied[key] = next;
}

watch(
  () => props.initial,
  (initial) => {
    if (!initial) {
      return;
    }
    assignIfUntouched("host", initial.host);
    assignIfUntouched("port", initial.port);
    assignIfUntouched("user", initial.user);
    assignIfUntouched("password", initial.password);
    assignIfUntouched("database", initial.database);
  },
  { immediate: true, deep: true },
);

function currentConfig(): SetupConnectionInput {
  return {
    host: form.host.trim(),
    port: form.port,
    user: form.user.trim(),
    password: form.password,
    database: form.database.trim(),
  };
}

/** 先过表单校验再请求，避免拿半填的参数去连库。返回是否连通。 */
async function test(): Promise<boolean> {
  if (testing.value || !(await validate())) {
    return false;
  }
  testing.value = true;
  try {
    await testDbConnection(currentConfig());
    message.success(t("setup.test.success"));
    return true;
  } catch (error) {
    message.error(error);
    return false;
  } finally {
    testing.value = false;
  }
}

/**
 * 供向导「下一步」调用：必须真连通才放行。
 * 只做必填校验会让错误凭据一路带到初始化步骤才暴露。
 * 每次都重连一遍，因为用户可能在上次成功测试之后又改了参数。
 */
async function collect(): Promise<SetupConnectionInput | null> {
  return (await test()) ? currentConfig() : null;
}

defineExpose({ collect });
</script>

<template>
  <Form :ref="formInst" :model="form" :rules="rules" layout="vertical">
    <Row :gutter="16">
      <Col :xs="24" :sm="16">
        <FormItem :label="t('setup.form.host')" name="host" required>
          <Input v-model:value="form.host" autocomplete="off" />
        </FormItem>
      </Col>
      <Col :xs="24" :sm="8">
        <FormItem :label="t('setup.form.port')" name="port" required>
          <!-- antdv 的 90px 默认宽度由 cssinjs 运行时注入，同优先级会盖掉 w-full -->
          <InputNumber v-model:value="form.port" class="w-full!" :min="1" :max="65535" />
        </FormItem>
      </Col>
      <Col :xs="24" :sm="12">
        <FormItem :label="t('setup.form.user')" name="user" required>
          <Input v-model:value="form.user" autocomplete="off" />
        </FormItem>
      </Col>
      <Col :xs="24" :sm="12">
        <FormItem :label="t('setup.form.password')" name="password">
          <InputPassword
            v-model:value="form.password"
            :placeholder="t('setup.form.passwordPlaceholder')"
            autocomplete="off"
          />
        </FormItem>
      </Col>
      <Col :span="24">
        <FormItem :label="t('setup.form.database')" name="database" required>
          <Input v-model:value="form.database" autocomplete="off" />
        </FormItem>
      </Col>
      <Col :span="24">
        <FormItem>
          <Button :loading="testing" @click="test">{{ t("setup.actions.test") }}</Button>
        </FormItem>
      </Col>
    </Row>
  </Form>
</template>
