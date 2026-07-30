import type { FsEntry } from "@/types/git";

export interface FileTreeVisibleRow {
  entry: FsEntry;
  depth: number;
}

/** 将已加载且已展开的目录树转换为可供虚拟列表渲染的可见行。 */
export function flattenVisibleFileTreeRows(
  rootEntries: readonly FsEntry[],
  expanded: ReadonlySet<string>,
  childrenCache: ReadonlyMap<string, readonly FsEntry[]>,
  filter: string,
): FileTreeVisibleRow[] {
  const rows: FileTreeVisibleRow[] = [];
  const filterLower = filter.trim().toLowerCase();

  function append(entries: readonly FsEntry[], depth: number): void {
    for (const entry of entries) {
      const matchesFilter =
        filterLower.length === 0 || entry.name.toLowerCase().includes(filterLower);
      if (!entry.isDir && !matchesFilter) {
        continue;
      }

      rows.push({ entry, depth });
      if (entry.isDir && expanded.has(entry.path)) {
        append(childrenCache.get(entry.path) ?? [], depth + 1);
      }
    }
  }

  append(rootEntries, 0);
  return rows;
}
