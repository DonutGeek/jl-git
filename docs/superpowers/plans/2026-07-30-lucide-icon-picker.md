# 全量 Lucide 图标选择器 Implementation Plan

> **For agentic workers:** Implement task-by-task.

**Goal:** 仓库与分组统一全量 Lucide 图标选择器（搜索 + 每页 36）。

**Architecture:** `lucide-react/dynamic` 提供名称表与按需加载；共享 `LucideIconPicker`；`ProjectIcon` / 分组展示走动态组件；Rust 校验 kebab-case。

**Tech Stack:** React、lucide-react DynamicIcon、shadcn Popover/Command/Pagination/Tooltip

---

### Task 1: Registry + DynamicIcon wrapper
### Task 2: LucideIconPicker UI
### Task 3: Wire ProjectIconPicker + WorkspaceGroupDialog + renderers
### Task 4: Types + Rust validation + i18n + docs + verify
