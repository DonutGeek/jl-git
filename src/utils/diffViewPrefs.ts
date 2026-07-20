/** 差异预览「更多」菜单偏好（跨会话） */
export interface DiffViewPrefs {
  /** 忽略空白字符差异（Monaco ignoreTrimWhitespace） */
  ignoreWhitespace: boolean;
  /** 行追溯（git blame 装饰） */
  lineBlame: boolean;
  /** 自动换行 */
  wordWrap: boolean;
  /** 等宽字体 */
  monospace: boolean;
}

export const DEFAULT_DIFF_VIEW_PREFS: DiffViewPrefs = {
  ignoreWhitespace: false,
  lineBlame: false,
  wordWrap: false,
  monospace: false,
};

const STORAGE_KEY = "jlgit:diff-view-prefs";

export function readDiffViewPrefs(): DiffViewPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_DIFF_VIEW_PREFS;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return DEFAULT_DIFF_VIEW_PREFS;
    }
    const record = parsed as Record<string, unknown>;
    return {
      ignoreWhitespace:
        typeof record.ignoreWhitespace === "boolean"
          ? record.ignoreWhitespace
          : DEFAULT_DIFF_VIEW_PREFS.ignoreWhitespace,
      lineBlame:
        typeof record.lineBlame === "boolean"
          ? record.lineBlame
          : DEFAULT_DIFF_VIEW_PREFS.lineBlame,
      wordWrap:
        typeof record.wordWrap === "boolean"
          ? record.wordWrap
          : DEFAULT_DIFF_VIEW_PREFS.wordWrap,
      monospace:
        typeof record.monospace === "boolean"
          ? record.monospace
          : DEFAULT_DIFF_VIEW_PREFS.monospace,
    };
  } catch {
    return DEFAULT_DIFF_VIEW_PREFS;
  }
}

export function writeDiffViewPrefs(prefs: DiffViewPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore quota / private mode
  }
}

/** 差异预览偏好：本地 state + localStorage 持久化 */
export function patchDiffViewPrefs(
  current: DiffViewPrefs,
  patch: Partial<DiffViewPrefs>,
): DiffViewPrefs {
  const next = { ...current, ...patch };
  writeDiffViewPrefs(next);
  return next;
}
