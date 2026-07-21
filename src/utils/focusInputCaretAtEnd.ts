/**
 * 聚焦输入框并把光标移到文末。
 * 预填草稿后需在 React 提交 DOM 后再调用（建议双 rAF）。
 */
export function focusInputCaretAtEnd(
  input: HTMLInputElement | HTMLTextAreaElement | null,
): void {
  if (!input) {
    return;
  }
  input.focus();
  const length = input.value.length;
  try {
    input.setSelectionRange(length, length);
  } catch {
    // 部分控件不支持选区
  }
}

/** 等一帧渲染后再聚焦到文末（适配 Mentions 受控更新） */
export function scheduleFocusInputCaretAtEnd(
  getInput: () => HTMLInputElement | HTMLTextAreaElement | null,
): void {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      focusInputCaretAtEnd(getInput());
    });
  });
}
