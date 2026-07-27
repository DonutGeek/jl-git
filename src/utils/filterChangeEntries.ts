import type { GitStatusEntry } from "@/types/git";

/** 按当前路径或重命名前路径筛选 Git 变更。 */
export function filterChangeEntries(entries: GitStatusEntry[], query: string): GitStatusEntry[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return entries;
  }

  return entries.filter((entry) => {
    const pathMatches = entry.path.toLowerCase().includes(normalizedQuery);
    const renamedPathMatches = entry.renamedFrom?.toLowerCase().includes(normalizedQuery);
    return pathMatches || renamedPathMatches === true;
  });
}
