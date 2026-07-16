# 分支 / 变更列表虚拟滚动 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将分支树、变更列表、待提交列表（含列表/树形）改为 `@tanstack/react-virtual` 虚拟滚动。

**Architecture:** 按展开状态展平为 `VisibleRow[]`，每个 `ScrollArea` 一个 `useVirtualizer`；固定行高 28px；复用 Agent 消息列表的 viewport 绑定方式。

**Tech Stack:** React 19、`@tanstack/react-virtual`、shadcn `ScrollArea`

## Global Constraints

- 不引入第二套虚拟列表库
- 行为与视觉不变；空态直渲
- 注释中文；文案走 i18n
- 改完 `tsc` + 相关冒烟

---

## File map

| 文件 | 职责 |
|------|------|
| `src/hooks/useScrollAreaViewport.ts` | ScrollArea Root → Radix viewport |
| `src/components/git/ChangeTree.tsx` | 导出展平 API；可保留薄包装或仅工具 |
| `src/components/git/ChangesPanel.tsx` | ChangeGroup 虚拟化（list + tree） |
| `src/components/git/BranchTree.tsx` | 导出展平 API；叶子/文件夹行可复用 |
| `src/components/git/BranchList.tsx` | 单一 ScrollArea 虚拟化整棵展平树 |

---

### Task 1: viewport hook

- [x] 新增 `useScrollAreaViewport`（mount + rAF 取 `[data-radix-scroll-area-viewport]`）
- [x] `tsc` 无报错

### Task 2: 变更区 list + tree 虚拟化

- [x] `ChangeTree` 导出 `flattenChangeTreeRows` / 行类型；`getChangeTreeFolderKeys` 保持
- [x] `ChangeGroup`：空态除外；list/tree 展平后 `useVirtualizer`；Default header 作为行
- [x] `ChangeRow` 外层改为 `div`（适配虚拟列表，非真实 ul）
- [x] `tsc`；手动冒烟列表/树形暂存

### Task 3: 分支树虚拟化

- [x] `BranchTree` 导出 `flattenBranchVisibleRows`
- [x] `BranchList` 本地+远端展平进同一 virtualizer
- [x] `tsc`；冒烟折叠/过滤/右键

### Task 4: 收尾

- [x] 可选：performance.md 交叉引用一行
- [x] 自检无 S0/S1
