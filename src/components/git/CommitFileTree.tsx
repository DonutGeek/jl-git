import { useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { MaterialFileIcon } from "@/components/git/MaterialFileIcon";
import { DiffLineStats } from "@/components/git/DiffLineStats";
import { RepositoryTreeRoot } from "@/components/git/RepositoryTreeRoot";
import { cn } from "@/lib/utils";

import { GitChangedFile } from "@/types/git";
import { gitStatusLetterClass } from "@/utils/gitStatusStyle";

interface CommitFileTreeDirectory {
  kind: "directory";
  name: string;
  path: string;
  children: CommitFileTreeNode[];
}

interface CommitFileTreeFile {
  kind: "file";
  file: GitChangedFile;
}

type CommitFileTreeNode = CommitFileTreeDirectory | CommitFileTreeFile;

interface CommitFileTreeProps {
  files: GitChangedFile[];
  rootName: string;
  expandedPaths: ReadonlySet<string>;
  onToggleFolder: (path: string) => void;
  /** 改动文件显示状态字母 */
  showStatus?: boolean;
  /** 显示增加 / 减少行数 */
  showLineStats?: boolean;
}

/** 返回提交文件目录树全部路径，供外层控制展开与折叠。 */
export function getCommitFileTreeFolderPaths(files: GitChangedFile[]): string[] {
  const paths: string[] = ["__root__"];
  function visit(nodes: CommitFileTreeNode[]): void {
    for (const node of nodes) {
      if (node.kind === "directory") {
        paths.push(node.path);
        visit(node.children);
      }
    }
  }
  visit(buildCommitFileTree(files));
  return paths;
}

/** 提交改动文件按路径组织为目录树。 */
export function CommitFileTree({
  files,
  rootName,
  expandedPaths,
  onToggleFolder,
  showStatus = true,
  showLineStats = false,
}: CommitFileTreeProps) {
  const nodes = useMemo(() => buildCommitFileTree(files), [files]);
  return (
    <ul className="flex flex-col" role="tree">
      <RepositoryTreeRoot
        name={rootName}
        rootKey="__root__"
        expanded={expandedPaths.has("__root__")}
        onToggle={onToggleFolder}
      >
        <CommitFileTreeNodes
          nodes={nodes}
          depth={1}
          expandedPaths={expandedPaths}
          onToggleFolder={onToggleFolder}
          showStatus={showStatus}
          showLineStats={showLineStats}
        />
      </RepositoryTreeRoot>
    </ul>
  );
}

interface CommitFileTreeNodesProps {
  nodes: CommitFileTreeNode[];
  depth: number;
  expandedPaths: ReadonlySet<string>;
  onToggleFolder: (path: string) => void;
  showStatus: boolean;
  showLineStats: boolean;
}

function CommitFileTreeNodes({
  nodes,
  depth,
  expandedPaths,
  onToggleFolder,
  showStatus,
  showLineStats,
}: CommitFileTreeNodesProps) {
  return (
    <>
      {nodes.map((node) => {
        if (node.kind === "file") {
          return (
            <li key={node.file.path} role="treeitem">
              <div
                className="hover:bg-accent/60 flex h-7 w-full min-w-0 items-center gap-1.5 overflow-hidden rounded-md pr-1.5 transition-colors duration-150"
                style={{ paddingLeft: `${6 + depth * 14}px` }}
              >
                {showStatus ? (
                  <span
                    className={cn(
                      "w-3.5 shrink-0 text-center font-mono text-[11px] leading-none font-semibold",
                      node.file.status ? gitStatusLetterClass(node.file.status) : "text-transparent",
                    )}
                    aria-label={node.file.status || undefined}
                    aria-hidden={!node.file.status}
                  >
                    {node.file.status || "·"}
                  </span>
                ) : null}
                <MaterialFileIcon name={node.file.path} isDir={false} className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate font-mono text-xs">
                  {node.file.path.split("/").pop()}
                </span>
                {showLineStats ? (
                  <DiffLineStats
                    additions={node.file.additions}
                    deletions={node.file.deletions}
                  />
                ) : null}
              </div>
            </li>
          );
        }

        const open = expandedPaths.has(node.path);
        return (
          <li key={node.path} role="treeitem" aria-expanded={open}>
            <button
              type="button"
              className="hover:bg-accent/60 flex h-7 w-full cursor-pointer items-center gap-1 rounded-md px-1.5 text-left text-xs"
              style={{ paddingLeft: `${6 + depth * 14}px` }}
              onClick={() => onToggleFolder(node.path)}
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
                <CommitFileTreeNodes
                  nodes={node.children}
                  depth={depth + 1}
                  expandedPaths={expandedPaths}
                  onToggleFolder={onToggleFolder}
                  showStatus={showStatus}
                  showLineStats={showLineStats}
                />
              </ul>
            ) : null}
          </li>
        );
      })}
    </>
  );
}

function buildCommitFileTree(files: GitChangedFile[]): CommitFileTreeNode[] {
  const roots: CommitFileTreeNode[] = [];
  for (const file of files) {
    insertFile(roots, file, file.path.split("/").filter(Boolean), "");
  }
  return roots;
}

function insertFile(
  nodes: CommitFileTreeNode[],
  file: GitChangedFile,
  segments: string[],
  parentPath: string,
): void {
  const [name, ...rest] = segments;
  if (!name) return;
  if (rest.length === 0) {
    nodes.push({ kind: "file", file });
    return;
  }
  const path = parentPath ? `${parentPath}/${name}` : name;
  let directory = nodes.find(
    (node): node is CommitFileTreeDirectory => node.kind === "directory" && node.name === name,
  );
  if (!directory) {
    directory = { kind: "directory", name, path, children: [] };
    nodes.push(directory);
  }
  insertFile(directory.children, file, rest, path);
}
