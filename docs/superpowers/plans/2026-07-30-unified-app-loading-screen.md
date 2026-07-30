# 统一整页 Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 所有独立窗口只使用一套无标题栏的整页 Loading，消除路由与页面初始化之间的视觉差异。

**Architecture:** 新增无业务状态的 `AppLoadingScreen`，统一渲染全屏背景、Spinner 与 `common.loading`。路由 Suspense 和独立子窗口的数据初始化分支复用该组件；错误状态与仓库内部局部 Loading 保持原有职责。

**Tech Stack:** React 19、TypeScript、i18next、shadcn Spinner。

## Global Constraints

- 不修改 `src/components/ui/**`。
- 不移除仓库、Diff、文件树和编辑器的局部 Loading。
- 不新增依赖，不恢复 Vitest。
- 错误状态继续展示对应领域错误文案。

---

### Task 1: 创建唯一整页 Loading

**Files:**
- Create: `src/components/common/AppLoadingScreen.tsx`
- Modify: `src/router/index.tsx`

**Interfaces:**
- Produces: `AppLoadingScreen(): JSX.Element`

- [x] 新增共享整页 Loading，内部读取 `common.loading`。
- [x] 删除路由私有 `RouteLoadingFallback`，Suspense 改用 `AppLoadingScreen`。

### Task 2: 删除独立窗口重复实现

**Files:**
- Modify: `src/pages/BranchComparePage.tsx`
- Modify: `src/pages/BranchHistoryPage.tsx`
- Modify: `src/pages/FileHistoryPage.tsx`
- Modify: `src/pages/BranchManagePage.tsx`
- Modify: `src/pages/ProjectManagePage.tsx`

**Interfaces:**
- Consumes: `AppLoadingScreen`

- [x] 页面初始化期间统一返回 `AppLoadingScreen`。
- [x] 保留页面原有错误状态与正常工作区。
- [x] 删除仅为加载状态存在的重复全屏 JSX。

### Task 3: 验证

- [x] 搜索确认整页 Loading 只由 `AppLoadingScreen` 提供。
- [x] 运行 ESLint、Prettier check、TypeScript。
- [x] 在 Tauri 开发窗口确认 HMR 后无新增运行时错误。
