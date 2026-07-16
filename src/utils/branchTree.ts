import { GitBranch } from "@/types/git";

/** 分支树节点：按分支名中的 "/" 拆分形成的层级结构 */
export interface BranchTreeNode {
  /** 当前层级的路径片段（如 "feature"、"origin"） */
  segment: string;
  /** 从根到当前节点的完整路径，用于生成唯一 key 与折叠状态标识 */
  path: string;
  /** 仅叶子节点（对应一个真实分支）才有值 */
  branch?: GitBranch;
  children: BranchTreeNode[];
}

/**
 * 将分支列表按名称中的 "/" 拆分构建树。
 * 远端形如 origin/hl/feature → origin → hl → feature，逐级向右展开。
 * 同层排序：文件夹优先，组内按名称（数字自然序）。
 */
export function buildBranchTree(branches: GitBranch[]): BranchTreeNode[] {
  const roots: BranchTreeNode[] = [];

  for (const branch of branches) {
    insertBranch(roots, branch.name.split("/"), branch, "");
  }

  sortBranchTreeNodes(roots);
  return roots;
}

function insertBranch(
  siblings: BranchTreeNode[],
  segments: string[],
  branch: GitBranch,
  parentPath: string,
): void {
  const [segment, ...rest] = segments;
  const path = parentPath ? `${parentPath}/${segment}` : segment;

  let node = siblings.find((candidate) => candidate.segment === segment);
  if (!node) {
    node = { segment, path, children: [] };
    siblings.push(node);
  }

  if (rest.length === 0) {
    node.branch = branch;
  } else {
    insertBranch(node.children, rest, branch, path);
  }
}

/** 同层：有子节点的文件夹在前，叶子分支在后；组内按 segment 名称排序 */
function sortBranchTreeNodes(nodes: BranchTreeNode[]): void {
  nodes.sort((left, right) => {
    const leftFolder = left.children.length > 0;
    const rightFolder = right.children.length > 0;
    if (leftFolder !== rightFolder) {
      return leftFolder ? -1 : 1;
    }
    return left.segment.localeCompare(right.segment, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });

  for (const node of nodes) {
    if (node.children.length > 0) {
      sortBranchTreeNodes(node.children);
    }
  }
}
