import { describe, expect, it } from "vitest";

import type { Workspace } from "@/types/project";
import {
  buildWorkspaceTree,
  collectWorkspaceAncestorIds,
  collectWorkspaceSubtreeIds,
  findWorkspaceTreeLabel,
} from "@/utils/workspaceOptions";

function workspace(id: string, name: string, parentId: string | null = null): Workspace {
  return {
    id,
    parentId,
    name,
    icon: "folder",
    color: "blue",
    sortOrder: 0,
    createdAt: "",
    updatedAt: "",
  };
}

describe("buildWorkspaceTree", () => {
  it("按层级构建可折叠树", () => {
    const tree = buildWorkspaceTree([
      workspace("a", "工作"),
      workspace("b", "前端", "a"),
      workspace("c", "后端", "a"),
      workspace("d", "个人"),
    ]);

    expect(tree).toEqual([
      {
        value: "a",
        label: "工作",
        children: [
          { value: "b", label: "前端", children: [] },
          { value: "c", label: "后端", children: [] },
        ],
      },
      { value: "d", label: "个人", children: [] },
    ]);
  });

  it("排除节点后不出现在树中", () => {
    const tree = buildWorkspaceTree(
      [workspace("a", "工作"), workspace("b", "前端", "a")],
      new Set(["b"]),
    );
    expect(tree).toEqual([{ value: "a", label: "工作", children: [] }]);
  });
});

describe("collectWorkspaceSubtreeIds", () => {
  it("包含自身与全部子孙", () => {
    const ids = collectWorkspaceSubtreeIds(
      [workspace("a", "工作"), workspace("b", "前端", "a"), workspace("c", "组件", "b")],
      "a",
    );
    expect([...ids].sort()).toEqual(["a", "b", "c"]);
  });
});

describe("findWorkspaceTreeLabel / collectWorkspaceAncestorIds", () => {
  const tree = buildWorkspaceTree([workspace("a", "工作"), workspace("b", "前端", "a")]);

  it("查找标签", () => {
    expect(findWorkspaceTreeLabel(tree, "b")).toBe("前端");
  });

  it("收集祖先", () => {
    expect(collectWorkspaceAncestorIds(tree, "b")).toEqual(["a"]);
  });
});
