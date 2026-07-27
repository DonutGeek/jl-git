import { ChevronDown, ChevronRight } from "lucide-react";

import { MaterialFileIcon } from "@/components/git/MaterialFileIcon";

import type { GitStatusEntry } from "@/types/git";

interface ChangeTreeDirectory {
  kind: "directory";
  name: string;
  path: string;
  children: ChangeTreeNode[];
}

interface ChangeTreeFile {
  kind: "file";
  entry: GitStatusEntry;
}

type ChangeTreeNode = ChangeTreeDirectory | ChangeTreeFile;

/** 树形视图虚拟列表的可见行 */
export type ChangeTreeVisibleRow =
  | { kind: "root"; key: string; name: string; open: boolean }
  | { kind: "directory"; key: string; name: string; depth: number; open: boolean }
  | { kind: "file"; key: string; entry: GitStatusEntry; depth: number };

/** 取树形视图所有目录 key，供外部展开/折叠全部使用。 */
export function getChangeTreeFolderKeys(
  entries: GitStatusEntry[],
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

  visit(buildChangeTree(entries));
  return result;
}

/**
 * 按展开状态将变更树展平为可见行（含仓库根）。
 */
export function flattenChangeTreeRows(
  entries: GitStatusEntry[],
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

  visit(buildChangeTree(entries), 1);
  return rows;
}

/** 树形目录 / 根节点行（供虚拟列表复用） */
export function ChangeTreeFolderRow({
  name,
  open,
  depth,
  onToggle,
}: {
  name: string;
  open: boolean;
  /** 根节点传 undefined，目录从 1 起 */
  depth?: number;
  onToggle: () => void;
}) {
  const isRoot = depth == null;

  return (
    <button
      type="button"
      className={
        isRoot
          ? "hover:bg-accent/60 flex h-7 w-full cursor-pointer items-center gap-1 rounded-md px-1.5 text-left text-xs font-medium"
          : "hover:bg-accent/60 flex h-7 w-full cursor-pointer items-center gap-1 rounded-md px-1.5 text-left text-xs"
      }
      style={isRoot ? undefined : { paddingLeft: `${6 + depth * 14}px` }}
      onClick={onToggle}
    >
      {open ? (
        <ChevronDown className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <ChevronRight className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
      )}
      <MaterialFileIcon name={name} isDir className="size-3.5" />
      <span className="min-w-0 flex-1 truncate">{name}</span>
    </button>
  );
}

function buildChangeTree(entries: GitStatusEntry[]): ChangeTreeNode[] {
  const roots: ChangeTreeNode[] = [];

  for (const entry of entries) {
    insertEntry(roots, entry, entry.path.split("/").filter(Boolean), "");
  }

  return roots;
}

function insertEntry(
  nodes: ChangeTreeNode[],
  entry: GitStatusEntry,
  segments: string[],
  parentPath: string,
): void {
  const [name, ...rest] = segments;
  if (!name) {
    return;
  }

  if (rest.length === 0) {
    nodes.push({ kind: "file", entry });
    return;
  }

  const path = parentPath ? `${parentPath}/${name}` : name;
  let directory = nodes.find(
    (node): node is ChangeTreeDirectory => node.kind === "directory" && node.name === name,
  );
  if (!directory) {
    directory = { kind: "directory", name, path, children: [] };
    nodes.push(directory);
  }

  insertEntry(directory.children, entry, rest, path);
}
