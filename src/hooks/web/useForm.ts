import { computed, reactive } from "vue";

import { useForm as useAntdForm, type Rule } from "antdv-next";

export type FormRules = Record<string, Rule[]>;

/** antdv Form `validateFields` 失败时抛带 `errorFields` 的实体，不是业务异常 */
function isFormValidateFail(error: unknown): boolean {
  return typeof error === "object" && error !== null && "errorFields" in error;
}

/**
 * 业务提交表单的统一写法：一个 reactive 对象放字段，rules 用 antdv-next 官方校验。
 * `formInst` 是懒代理，必须整份使用（`:ref="formInst"` / `formInst.validateFields()`），禁止解构。
 */
export function useForm<T extends object>(initial: () => T, getRules: () => FormRules) {
  // reactive 解包后与初始对象形状相同，表单字段均为原始值
  const form = reactive(initial()) as T;
  const formInst = useAntdForm();
  const rules = computed(getRules);

  function resetForm(next?: Partial<T>): void {
    Object.assign(form, initial(), next);
    formInst.clearValidate();
  }

  async function validate(): Promise<boolean> {
    try {
      await formInst.validateFields();
      return true;
    } catch (error) {
      if (isFormValidateFail(error)) {
        return false;
      }
      throw error;
    }
  }

  return { form, formInst, rules, resetForm, validate };
}
