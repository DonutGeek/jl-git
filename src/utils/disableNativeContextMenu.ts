/**
 * 禁用 WebView / 浏览器默认右键菜单（返回、重新载入、检查元素等）。
 *
 * 必须用冒泡阶段（勿 capture）：Radix ContextMenu 的 composeEventHandlers
 * 在 defaultPrevented 时会跳过打开；capture 里先 preventDefault 会导致业务菜单失效。
 * 冒泡时 Trigger 已先打开并 preventDefault；无业务菜单的区域再由此拦原生菜单。
 */
export function disableNativeContextMenu(): void {
  document.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });
}
