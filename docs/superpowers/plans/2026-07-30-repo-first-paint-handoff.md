# 仓库标签首帧让行实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 标签切换首帧只渲染目标标签、目标仓库壳和局部 Loading，缓存恢复与 Git Store 更新统一延后到浏览器完成首帧之后。

**Architecture:** `RepoPage` 直接从项目 Store 派生目标项目，不在 render 阶段同步本地 State。页面是否展示 Loading 壳由“目标路径、当前 Repo Store 路径、已完成水合路径”共同决定；双 `requestAnimationFrame` 后再执行缓存恢复或冷加载。

**Tech Stack:** React 19、TypeScript、Zustand。

## Global Constraints

- 不在 `useLayoutEffect` 或 render 阶段写入 Repo Store。
- 首帧 Loading 壳不得读取并展示上一仓库的动态数据。
- 保留现有请求 generation 竞态隔离。
- 不引入新依赖，不修改 `src/components/ui/**`。

---

### Task 1: 首帧状态判定

**Files:**
- Modify: `src/utils/repoPageBootstrap.ts`

**Interfaces:**
- Produces: `shouldShowRepoLoadingShell({ targetPath, activeStorePath, readyRepoPath }): boolean`

- [x] **Step 1: 明确状态矩阵**

覆盖目标路径与当前 Store 不一致、目标尚未完成水合、三者一致三种情况。

- [x] **Step 2: 实现纯函数并删除绘制前动作接口**

删除 `RepoPrepaintAction` 与 `resolveRepoPrepaintAction()`；仅保留加载模式和 Loading 壳判定。

- [x] **Step 3: 运行类型检查与切仓冒烟**

### Task 2: RepoPage 首帧让行

**Files:**
- Modify: `src/pages/RepoPage.tsx`

**Interfaces:**
- Consumes: `shouldShowRepoLoadingShell`
- Produces: 无 render 阶段 `setState`、无 `useLayoutEffect` 的标签切换流程
- Produces: `refreshStatus()` 按仓库 generation 隔离过期 A→B→A 返回

- [x] **Step 1: 删除 route 镜像 State 与 render 阶段同步**

项目元数据直接从 `useProjectStore(state => state.projects)` 派生。

- [x] **Step 2: 删除绘制前缓存恢复 Effect**

移除 `useLayoutEffect`、`resolveRepoPrepaintAction()` 以及其中的 `restoreRepoSession()` / `beginRepoSwitch()`。

- [x] **Step 3: 收敛双 rAF 后的水合流程**

双 rAF 后判定 `ready | restore-cache | load`；恢复或加载成功后记录 `readyRepoPath`，失败错误绑定目标路径，避免跨仓泄漏。

- [x] **Step 4: 保证首帧 Loading 壳不读取旧仓库数据**

`RepoToolbar` 与 `CommitBox` 的加载壳模式强制隐藏旧仓库分支、提交信息和身份数据。

- [x] **Step 5: 隔离过期状态刷新**

`refreshStatus()` 写 Store、缓存或错误前校验最新 generation；切仓和同路径重置使旧刷新失效。

### Task 3: 验证

**Files:**
- Modify: `docs/superpowers/specs/2026-07-30-repo-tab-switch-performance-design.md`

- [x] **Step 1: 更新设计文档**

明确缓存命中也允许先出现极短 Loading 帧，缓存恢复不得发生在绘制前。

- [x] **Step 2: 运行完整测试和质量检查**

Run:

```bash
pnpm check
git diff --check
```

- [x] **Step 3: 检查开发运行日志**

确认 `pnpm tauri dev` HMR 后无 React、Vite 或运行时错误。
