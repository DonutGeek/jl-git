# 变更树形工具栏布局实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 树形模式下将“展开全部 / 折叠全部”移到变更工具栏左侧，避免挤占中间视图切换与右侧搜索操作。

**Architecture:** 用纯函数统一决定左侧操作区内容：列表模式显示排序，树形模式显示展开/折叠，搜索展开时隐藏左侧操作。右侧固定只保留搜索和更多菜单。

**Tech Stack:** React 19、TypeScript、shadcn Button/Tooltip。

## Global Constraints

- 不修改展开、折叠、搜索和视图切换行为。
- 不新增依赖，不修改 `src/components/ui/**`。
- Git 加载期间写操作继续禁止；本任务不改加载流程。

### Task 1: 工具栏区域判定

**Files:**
- Create: `src/utils/changesToolbarLayout.ts`

- [x] 实现 `resolveChangesToolbarLeadingControl()`。

### Task 2: 调整 ChangesPanel 布局

**Files:**
- Modify: `src/components/git/ChangesPanel.tsx`

- [x] 列表模式左侧继续显示排序。
- [x] 树形模式左侧显示展开与折叠。
- [x] 从右侧操作区移除展开与折叠。
- [x] 搜索展开时隐藏左侧操作。

### Task 3: 验证

- [x] 运行 `pnpm check`、`git diff --check` 与相关运行时冒烟。
