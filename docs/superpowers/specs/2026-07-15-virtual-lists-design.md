# 分支 / 变更列表虚拟滚动 — 设计文档

日期：2026-07-15  
范围：

- `src/components/git/BranchList.tsx` / `BranchTree.tsx`
- `src/components/git/ChangesPanel.tsx` / `ChangeTree.tsx`
- 必要时抽出可复用的「ScrollArea + viewport + useVirtualizer」薄封装（可选）

## 背景

切标签与仓库保活优化后，左侧分支树与变更区在数据量大时仍全量渲染 DOM，滚动与切换主视图时易卡顿。`docs/development/performance.md` 已要求大列表使用 `@tanstack/react-virtual`；Agent 消息列表已落地同栈模式。

用户标注三处必须虚拟化：

1. 左侧「分支」树（本地 / 远端分组 + 路径文件夹）
2. 「变更」文件列表（含列表 / 树形两种视图）
3. 「待提交」文件列表（含列表 / 树形两种视图）

## 目标

1. 上述三处在数百～数千行时滚动跟手，DOM 节点数近似 viewport + overscan
2. **列表与树形两种视图都虚拟化**
3. 复用现有 `@tanstack/react-virtual` + shadcn `ScrollArea` + Radix viewport 绑定方式（对齐 `AgentMessageList`）
4. 折叠、过滤、选中、双击 checkout、右键菜单、暂存/取消暂存、空态等行为与视觉不变

## 非目标

- 不改 History 提交列表（可另开专项）
- 不改工作区 `FileTree` / Tags 列表（本轮未标注）
- 不引入第二套虚拟列表库
- 不做「仅超过 N 条才虚拟」的双路径（始终走同一虚拟路径，空态除外）
- 不改 Git Service / store 契约；仅 UI 渲染层

## 方案选型

**采用：展平可见行（VisibleRow）+ 每个滚动容器一个 `useVirtualizer`。**

| 备选 | 结论 |
|------|------|
| 递归树内嵌多层虚拟滚动 | 否：与单一 ScrollArea 冲突 |
| count &gt; N 才虚拟 | 否：两套渲染易抖、维护成本高 |

## 公共约定

### 滚动容器

- 继续使用 `ScrollArea`，Root 保持定高（`h-full` / `flex-1 min-h-0`）
- `getScrollElement` 取 Radix `[data-radix-scroll-area-viewport]`
- 绑定方式可抽小 hook（如 `useScrollAreaViewport`），与 Agent 一致：mount + `rAF` 再取一次

### 行高

- 分支行 / 变更行现有多为 `h-7`（28px）→ `estimateSize: () => 28`
- 固定行高，**不做**逐行 `measureElement`（避免抖动；与 performance 文档「固定或估算行高」一致）
- `overscan`: 8～12

### 空态

- `count === 0`（或业务 empty / noMatch）时不挂 virtualizer 内容区，沿用现有 `EmptyState` / 文案

## 1. 分支侧栏

### 展平模型（示意）

```ts
type BranchVisibleRow =
  | { kind: "group"; id: "local" | "remote"; labelKey: string; open: boolean }
  | { kind: "folder"; id: string; segment: string; depth: number; open: boolean; variant: "local" | "remote" }
  | { kind: "branch"; id: string; branch: GitBranch; depth: number; variant: "local" | "remote" };
```

- 输入：`localTree` / `remoteTree`、`localOpen` / `remoteOpen`、`collapsedPaths`、过滤结果
- 分组关闭则不输出其子行；文件夹关闭则不输出子孙
- `BranchGroup` / `BranchTree` 的行 UI 尽量复用为「按 row 渲染」；右键菜单仍挂在分支行上

### 结构

```
BranchList
├── header + filter (shrink-0)
└── ScrollArea
      └── virtual list (flatten → useVirtualizer)
```

本地与远端在**同一**滚动容器内展平（保持现交互：一个滚动条滚完全部树）。

## 2. 变更 / 待提交

### 分区

上下两个 `ChangeGroup` 各自独立：

- 各自 `ScrollArea` + 各自 `useVirtualizer`
- 不把两区合成一个虚拟列表（避免分栏高度与 sticky 标题复杂化）

### 列表模式展平

```ts
type ChangeVisibleRow =
  | { kind: "default-header" }  // 仅「变更」区且 showDefaultGroup
  | { kind: "file"; entry: GitStatusEntry; indentDepth?: number };
```

- Default 折叠时只保留 header 行（或不渲染文件行，与现逻辑一致）
- 待提交区无 Default header，直接文件行

### 树形模式展平

按 `expandedPaths` DFS 展平：

```ts
type ChangeTreeVisibleRow =
  | { kind: "root"; rootKey: string; open: boolean }
  | { kind: "directory"; key: string; name: string; path: string; depth: number; open: boolean }
  | { kind: "file"; entry: GitStatusEntry; depth: number };
```

- `ChangeTree` 改为（或内部改为）「build tree → flatten → 由父级虚拟渲染」
- `getChangeTreeFolderKeys` 等展开/折叠全部逻辑保持可用

### 行组件

继续复用 `ChangeRow`；目录行 / 根节点复用现有按钮样式与缩进公式。

## 3. 可选抽取

若 Branch / Changes 两处 viewport 绑定重复明显，可增加：

- `src/hooks/useScrollAreaViewport.ts`（或 `components/common` 下极薄封装）

**YAGNI**：先在一处实现，第二处复制仍啰嗦再抽。

## 验收

- [ ] 分支数 / 变更数百级时滚动流畅，DevTools 中可见行 DOM 远小于总数
- [ ] 分支：折叠分组/文件夹、过滤、选中、双击切换、右键菜单正常
- [ ] 变更列表：选中、暂存/取消、stage all / unstage all、Default 折叠正常
- [ ] 变更树形：展开/折叠目录、展开全部/折叠全部、选中与暂存正常
- [ ] 待提交区列表 + 树形同上
- [ ] 空态（无分支 / 无匹配 / 无变更 / 无待提交）与现文案一致
- [ ] `tsc` 通过；相关冒烟无 S0/S1

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| ContextMenu 在虚拟行回收后异常 | 菜单内容 portal 到 body（现 Radix 已如此）；trigger 仅挂可见行 |
| ScrollArea 内层 `display` 与 absolute 定位冲突 | 沿用现有 `[&_[data-slot=scroll-area-viewport]>div]:!block` 与 Agent 的 `relative` + `translateY` |
| 展平在每次折叠重算 | `useMemo` 依赖 open/collapsed/entries；行高固定，成本可接受 |

## 实施顺序（实现阶段）

1. 变更区列表模式虚拟化（两区）— 收益直观、树模型简单
2. 变更区树形展平 + 虚拟化
3. 分支树展平 + 虚拟化
4. 必要时抽 viewport hook；补 performance 文档一句交叉引用（可选）
