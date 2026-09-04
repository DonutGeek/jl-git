import { App } from "antdv-next";

/**
 * 取挂在 `<App>` 上的 notification，才能吃到 ConfigProvider 昼夜主题。
 * 禁止再静态 `import { notification } from "antdv-next"`。
 */
export function useNotification() {
  return App.useApp().notification;
}

export type AppNotification = ReturnType<typeof useNotification>;
