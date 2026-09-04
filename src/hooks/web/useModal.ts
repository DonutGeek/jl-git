import { App } from "antdv-next";

/**
 * 取挂在 `<App>` 上的 modal，才能吃到 ConfigProvider 昼夜主题与 antd 语言包。
 * 二次确认用 `modal.confirm()`，禁止再静态 `Modal.confirm` 或手搓确认框。
 */
export function useModal() {
  return App.useApp().modal;
}

export type AppModal = ReturnType<typeof useModal>;
