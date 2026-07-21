/** 右键菜单关闭后再打开 Dialog，避免焦点陷阱导致确认框不出现 */
export function deferUi(action: () => void): void {
  window.setTimeout(action, 0);
}
