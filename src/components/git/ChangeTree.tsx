import { ReactNode, useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { MaterialFileIcon } from "@/components/git/MaterialFileIcon";
import { RepositoryTreeRoot } from "@/components/git/RepositoryTreeRoot";

import { GitStatusEntry } from "@/types/git";

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

interface ChangeTreeProps {
  entries: GitStatusEntry[];
  rootName: string;
  side: "index" | "worktree";
  expandedPaths: ReadonlySet<string>;
  onToggleFolder: (key: string) => void;
  renderEntry: (entry: GitStatusEntry, depth: number) => ReactNode;
}

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

/** 变更按相对路径建立目录树，叶子节点保留原始 Git 状态。 */
export function ChangeTree({
  entries,
  rootName,
  side,
  expandedPaths,
  onToggleFolder,
  renderEntry,
}: ChangeTreeProps) {
  const nodes = useMemo(() => buildChangeTree(entries), [entries]);
  const rootKey = `${side}:__root__`;

  return (
    <ul className="flex flex-col" role="tree">
      <RepositoryTreeRoot
        name={rootName}
        rootKey={rootKey}
        expanded={expandedPaths.has(rootKey)}
        onToggle={onToggleFolder}
      >
        <ChangeTreeNodes
          nodes={nodes}
          side={side}
          depth={1}
          expandedPaths={expandedPaths}
          onToggleFolder={onToggleFolder}
          renderEntry={renderEntry}
        />
      </RepositoryTreeRoot>
    </ul>
  );
}

interface ChangeTreeNodesProps {
  nodes: ChangeTreeNode[];
  side: "index" | "worktree";
  depth: number;
  expandedPaths: ReadonlySet<string>;
  onToggleFolder: (key: string) => void;
  renderEntry: (entry: GitStatusEntry, depth: number) => ReactNode;
}

function ChangeTreeNodes({
  nodes,
  side,
  depth,
  expandedPaths,
  onToggleFolder,
  renderEntry,
}: ChangeTreeNodesProps) {
  return (
    <>
      {nodes.map((node) => {
        if (node.kind === "file") {
          return renderEntry(node.entry, depth);
        }

        const key = `${side}:${node.path}`;
        const open = expandedPaths.has(key);

        return (
          <li key={key} role="treeitem" aria-expanded={open}>
            <button
              type="button"
              className="hover:bg-accent/60 flex h-7 w-full cursor-pointer items-center gap-1 rounded-md px-1.5 text-left text-xs"
              style={{ paddingLeft: `${6 + depth * 14}px` }}
              onClick={() => onToggleFolder(key)}
            >
              {open ? (
                <ChevronDown className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <ChevronRight className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
              )}
              <MaterialFileIcon name={node.name} isDir className="size-3.5" />
              <span className="min-w-0 flex-1 truncate">{node.name}</span>
            </button>

            {open ? (
              <ul role="group">
                <ChangeTreeNodes
                  nodes={node.children}
                  side={side}
                  depth={depth + 1}
                  expandedPaths={expandedPaths}
                  onToggleFolder={onToggleFolder}
                  renderEntry={renderEntry}
                />
              </ul>
            ) : null}
          </li>
        );
      })}
    </>
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
