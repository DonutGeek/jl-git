import { App } from "antdv-next";

/**
 * 取挂在 `<App>` 上的 message，才能吃到 ConfigProvider 昼夜主题。
 * 禁止再静态 `import { message } from "antdv-next"`。
 */
export function useMessage() {
  return App.useApp().message;
}

export type AppMessage = ReturnType<typeof useMessage>;
