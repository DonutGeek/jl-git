/** 浏览器 KeyboardEvent 与设置中持久化的快捷键格式之间的转换。 */
export function shortcutBindingFromKeyboardEvent(event: KeyboardEvent): string | null {
  if (!event.metaKey && !event.ctrlKey) {
    return null;
  }

  const key = normalizeShortcutKey(event.key);
  if (!key) {
    return null;
  }

  return ["Mod", ...(event.altKey ? ["Alt"] : []), ...(event.shiftKey ? ["Shift"] : []), key].join(
    "+",
  );
}

function normalizeShortcutKey(key: string): string | null {
  if (["Alt", "Control", "Meta", "Shift", "Dead", "Process", "Unidentified"].includes(key)) {
    return null;
  }

  if (key === " ") {
    return "Space";
  }

  return key.length === 1 ? key.toUpperCase() : key;
}

/** 输入框内保留原生编辑快捷键，提交快捷键是唯一例外。 */
export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}
