# 主视图骨架 Implementation Plan

> **For agentic workers:** 按任务顺序实现；本轮为布局骨架，不做 Diff/详情 API。

**Goal:** 工具栏三视图切换时，侧栏右侧主区分别呈现工作区文件浏览器、变更左右栏、历史左右栏骨架。

**Architecture:** `RepoPage` 按 `mainView` 渲染不同主区；工作区新建 `WorkspaceBrowser`（复用 `gitService.listDir`）；变更/历史复用现有面板 + 右侧占位。

**Tech Stack:** React、Zustand、现有 `SplitPane`、`fs_list_dir`、i18next、lucide-react

---

### Task 1: WorkspaceBrowser
### Task 2: Changes / History 主区壳
### Task 3: RepoPage 接入 + i18n + feature-list
### Task 4: tsc + 冒烟
