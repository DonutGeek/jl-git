import type { GitStatusEntry } from "@/types/git";

export interface ChangeTreeDirectory {
  kind: "directory";
  name: string;
  path: string;
  children: ChangeTreeNode[];
}

export interface ChangeTreeFile {
  kind: "file";
  entry: GitStatusEntry;
}

export type ChangeTreeNode = ChangeTreeDirectory | ChangeTreeFile;

/** 树形视图虚拟列表的可见行 */
export type ChangeTreeVisibleRow =
  | { kind: "root"; key: string; name: string; open: boolean }
  | { kind: "directory"; key: string; name: string; depth: number; open: boolean }
  | { kind: "file"; key: string; entry: GitStatusEntry; depth: number };

/** 单次线性构建变更树；目录按完整路径索引，避免在同级节点中反复查找。 */
export function buildChangeTree(entries: GitStatusEntry[]): ChangeTreeNode[] {
  const roots: ChangeTreeNode[] = [];
  const directories = new Map<string, ChangeTreeDirectory>();

  for (const entry of entries) {
    const segments = entry.path.split("/").filter(Boolean);
    let children = roots;
    let parentPath = "";

    for (let index = 0; index < segments.length - 1; index += 1) {
      const name = segments[index];
      const path = parentPath ? `${parentPath}/${name}` : name;
      let directory = directories.get(path);
      if (!directory) {
        directory = { kind: "directory", name, path, children: [] };
        directories.set(path, directory);
        children.push(directory);
      }
      children = directory.children;
      parentPath = path;
    }

    if (segments.length > 0) {
      children.push({ kind: "file", entry });
    }
  }

  return roots;
}

/** 取已构建树的所有目录 key，供外部展开/折叠全部使用。 */
export function getChangeTreeFolderKeys(
  tree: ChangeTreeNode[],
  side: "index" | "worktree",
): string[] {
  const result: string[] = [`${side}:__root__`];

  function visit(nodes: ChangeTreeNode[]): void {
    for (const node of nodes) {
      if (node.kind === "directory") {
        result.push(`${side}:${node.path}`);
        visit(node.children);
      }
    }
  }

  visit(tree);
  return result;
}

/** 按展开状态将已构建树展平为可见行（含仓库根）。 */
export function flattenChangeTreeRows(
  tree: ChangeTreeNode[],
  rootName: string,
  side: "index" | "worktree",
  expandedPaths: ReadonlySet<string>,
): ChangeTreeVisibleRow[] {
  const rootKey = `${side}:__root__`;
  const rootOpen = expandedPaths.has(rootKey);
  const rows: ChangeTreeVisibleRow[] = [
    { kind: "root", key: rootKey, name: rootName, open: rootOpen },
  ];

  if (!rootOpen) {
    return rows;
  }

  function visit(nodes: ChangeTreeNode[], depth: number): void {
    for (const node of nodes) {
      if (node.kind === "file") {
        rows.push({
          kind: "file",
          key: `${side}:file:${node.entry.path}`,
          entry: node.entry,
          depth,
        });
        continue;
      }

      const key = `${side}:${node.path}`;
      const open = expandedPaths.has(key);
      rows.push({
        kind: "directory",
        key,
        name: node.name,
        depth,
        open,
      });
      if (open) {
        visit(node.children, depth + 1);
      }
    }
  }

  visit(tree, 1);
  return rows;
}
