# 搜索匹配高亮实现计划

> **For agentic workers:** 按任务顺序实现；每任务完成后勾选。

**Goal:** 可复用的连续子串高亮，接入仓库快速切换（名 + 路径）。

**Architecture:** 纯函数算区间 → `HighlightText` 渲染 `<mark>` → QuickSwitcher 受控 query。

**Tech Stack:** React、cmdk CommandInput、Design Tokens（`bg-primary/15`）。

---

### Task 1: util + 组件

- 新建 `src/utils/textHighlight.ts`
- 新建 `src/components/common/HighlightText.tsx`

### Task 2: 接入 QuickSwitcher

- `RepositoryQuickSwitcher`：`query` state、`CommandInput` 受控、名/路径用 `HighlightText`、关对话框清空 query

### Task 3: 校验

- `pnpm check`
