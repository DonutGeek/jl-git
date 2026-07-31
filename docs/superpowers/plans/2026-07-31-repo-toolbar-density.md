# Repo Toolbar Density Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按工具栏容器宽度在 comfortable / compact / minimal 三态间切换：藏文案，再将右侧四工具收进 `⋯`。

**Architecture:** 纯函数根据宽度与上一档位（含 hysteresis）解析密度；`RepoToolbar` 用 `ResizeObserver` 测量根节点并驱动条件渲染。

**Tech Stack:** React, ResizeObserver, shadcn DropdownMenu / Tooltip / Button, lucide-react, i18next

## Global Constraints

- 遵循 AGENTS.md：不改 `src/components/ui/**`；文案走 i18n；图标仅 lucide
- 触发基于工具栏容器宽度，非窗口媒体查询
- `⋯` 仅收：编辑器 / 分支比较 / 文件管理器 / 终端

---

### Task 1: Density resolver

**Files:**
- Create: `src/utils/repoToolbarDensity.ts`

**Interfaces:**
- Produces: `RepoToolbarDensity`, `resolveRepoToolbarDensity(width, previous)`, 阈值常量

- [x] **Step 1:** 实现 `comfortable | compact | minimal` 解析与 hysteresis
- [x] **Step 2:** 用手工断言或临时 node 片段验证边界（无 vitest 时）

### Task 2: Wire RepoToolbar

**Files:**
- Modify: `src/components/layout/RepoToolbar.tsx`
- Modify: `src/i18n/locales/zh-CN/repo.json`, `src/i18n/locales/en/repo.json`

- [x] **Step 1:** 根节点 ref + ResizeObserver
- [x] **Step 2:** compact 时隐藏视图/同步文案，保留角标与 Tooltip
- [x] **Step 3:** minimal 时右侧四工具改为 `⋯` DropdownMenu
- [x] **Step 4:** `pnpm check`（typecheck + 相关 lint/format）+ 拖窗口冒烟

---
