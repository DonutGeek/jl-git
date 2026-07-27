/** 工作区文件中的一处 Git 冲突块（1-based 行号，含标记行） */
export interface ConflictHunk {
  /** <<<<<<< 所在行 */
  startLine: number;
  /** ======= 所在行 */
  separatorLine: number;
  /** >>>>>>> 所在行 */
  endLine: number;
  ours: string;
  theirs: string;
}

export type ConflictHunkAction = "ours" | "theirs" | "both";

/** 解析文本中的冲突标记块 */
export function parseConflictHunks(text: string): ConflictHunk[] {
  const lines = text.split("\n");
  const hunks: ConflictHunk[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (!line.startsWith("<<<<<<<")) {
      i += 1;
      continue;
    }

    const startLine = i + 1;
    let separator = -1;
    let end = -1;

    for (let j = i + 1; j < lines.length; j += 1) {
      const current = lines[j] ?? "";
      if (separator < 0 && current.startsWith("=======")) {
        separator = j;
        continue;
      }
      if (separator >= 0 && current.startsWith(">>>>>>>")) {
        end = j;
        break;
      }
    }

    if (separator < 0 || end < 0) {
      i += 1;
      continue;
    }

    hunks.push({
      startLine,
      separatorLine: separator + 1,
      endLine: end + 1,
      ours: lines.slice(i + 1, separator).join("\n"),
      theirs: lines.slice(separator + 1, end).join("\n"),
    });
    i = end + 1;
  }

  return hunks;
}

export function hasConflictMarkers(text: string): boolean {
  return parseConflictHunks(text).length > 0;
}

/** 对指定 hunk 应用解决策略，返回新文本 */
export function applyConflictHunkAction(
  text: string,
  hunkIndex: number,
  action: ConflictHunkAction,
): string {
  const hunks = parseConflictHunks(text);
  const hunk = hunks[hunkIndex];
  if (!hunk) {
    return text;
  }

  const lines = text.split("\n");
  const start = hunk.startLine - 1;
  const end = hunk.endLine;
  let replacement: string[];
  switch (action) {
    case "ours":
      replacement = hunk.ours === "" ? [] : hunk.ours.split("\n");
      break;
    case "theirs":
      replacement = hunk.theirs === "" ? [] : hunk.theirs.split("\n");
      break;
    case "both":
      if (hunk.ours === "" && hunk.theirs === "") {
        replacement = [];
      } else if (hunk.ours === "") {
        replacement = hunk.theirs.split("\n");
      } else if (hunk.theirs === "") {
        replacement = hunk.ours.split("\n");
      } else {
        replacement = [...hunk.ours.split("\n"), ...hunk.theirs.split("\n")];
      }
      break;
  }

  return [...lines.slice(0, start), ...replacement, ...lines.slice(end)].join("\n");
}

/** 与 Rust `is_unmerged_entry` 一致：忽略大小写（U / AA / DD） */
export function isConflictStatus(indexStatus: string, worktreeStatus: string): boolean {
  const index = indexStatus.toUpperCase();
  const worktree = worktreeStatus.toUpperCase();
  return (
    index === "U" ||
    worktree === "U" ||
    (index === "A" && worktree === "A") ||
    (index === "D" && worktree === "D")
  );
}

/** 未合并冲突条目 */
export function isConflictEntry(entry: { indexStatus: string; worktreeStatus: string }): boolean {
  return isConflictStatus(entry.indexStatus, entry.worktreeStatus);
}

const EMPTY_DEMOTED = new Set<string>();

/**
 * 待提交：冲突文件固定在此区（解决前不可取消暂存）；
 * demotedConflictPaths 仅兼容旧状态，冲突本身不再允许 demote。
 */
export function isStagedChangeEntry(
  entry: {
    indexStatus: string;
    worktreeStatus: string;
    path?: string;
  },
  _demotedConflictPaths: ReadonlySet<string> = EMPTY_DEMOTED,
): boolean {
  if (isConflictEntry(entry)) {
    return true;
  }
  return entry.indexStatus !== "." && entry.indexStatus !== "?";
}

/**
 * 变更：普通未暂存；冲突文件不出现在此区。
 */
export function isUnstagedChangeEntry(
  entry: {
    indexStatus: string;
    worktreeStatus: string;
    path?: string;
  },
  _demotedConflictPaths: ReadonlySet<string> = EMPTY_DEMOTED,
): boolean {
  if (isConflictEntry(entry)) {
    return false;
  }
  return entry.worktreeStatus === "?" || entry.worktreeStatus !== ".";
}

/** 仅保留仍处于冲突态的 demote 路径 */
export function pruneDemotedConflictPaths(
  demoted: readonly string[],
  entries: readonly { path: string; indexStatus: string; worktreeStatus: string }[],
): string[] {
  if (demoted.length === 0) {
    return [];
  }
  const conflictPaths = new Set(entries.filter(isConflictEntry).map((entry) => entry.path));
  return demoted.filter((path) => conflictPaths.has(path));
}
