# 仓库局部 Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除仓库首次加载骨架，在真实布局对应区域显示克制的局部 `Spinner + Loading`。

**Architecture:** 保留 `RepoPage` 现有缓存优先、水合和竞态隔离逻辑，只替换 `RepoLoadingWorkspace` 的视觉占位。变更视图保留真实横向与纵向分栏，在侧栏内容、未暂存区、暂存区和右侧预览区分别显示 Loading，中间底部直接展示禁用状态的真实提交区；工作区保留路径栏，只在路径栏下方的文件内容区显示 Loading。

**Tech Stack:** React 19、TypeScript、Tailwind CSS 4、shadcn Spinner。

## Global Constraints

- 不修改缓存恢复、`loadAll()`、请求 generation 或标签激活流程。
- 不修改 `src/components/ui/**`。
- 用户可见文案使用现有 i18n `common.loading`。
- 保留 `h-full min-h-0 min-w-0 overflow-hidden` 高度与溢出约束。
- 不提交 Git commit，除非用户明确要求。

---

### Task 1: 用局部 Loading 替换骨架

**Files:**
- Modify: `src/components/layout/repoLoadingLayout.ts`
- Modify: `src/components/layout/RepoLoadingWorkspace.tsx`
- Modify: `docs/superpowers/specs/2026-07-30-repo-tab-switch-performance-design.md`

**Interfaces:**
- Consumes: `RepoLoadingWorkspaceProps`、`RepoMainView`、`Spinner`、`common.loading`。
- Produces: `REPO_CHANGES_LOADING_AREAS = ["sidebar", "unstaged", "staged", "preview"] as const` 与 `REPO_MAIN_LOADING_AREA = "main"`。

- [ ] **Step 1: 明确布局区域契约**

确认变更区包含 `sidebar`、`unstaged`、`staged`、`preview` 四个局部 Loading 区域。

- [ ] **Step 2: 定义 Loading 区域契约**

在 `repoLoadingLayout.ts` 删除 `REPO_CHANGES_LOADING_REGIONS`，新增：

```ts
export const REPO_CHANGES_LOADING_AREAS = [
  "sidebar",
  "unstaged",
  "staged",
  "preview",
] as const;
export const REPO_MAIN_LOADING_AREA = "main";
```

标签滚动条隐藏与 `resolveRepoTabWheelDelta()` 保持不变；标签内容末端增加 6px 安全间距，保证最后一个分组边框完整显示。

- [ ] **Step 3: 实现统一局部 Loading**

在 `RepoLoadingWorkspace.tsx`：

1. 删除 `Skeleton` import、`LoadingRows` 和 `LoadingBlock`，保留纵向 `changes-commit` 真实分栏。
2. 引入 `useTranslation` 与现有 `Spinner`。
3. 定义统一组件：

```tsx
function LoadingIndicator({ area }: { area: string }) {
  const { t } = useTranslation();
  return (
    <div
      className="text-muted-foreground flex h-full min-h-0 items-center justify-center gap-2 text-xs"
      data-repo-loading-area={area}
    >
      <Spinner className="size-3.5" />
      <span>{t("common.loading")}</span>
    </div>
  );
}
```

4. 侧栏使用 `area="sidebar"`。
5. `mainView === "changes"` 时保留 `changes-preview` 横向 `ResizableSplit`；其 first 内继续保留 `changes-commit` 纵向 `ResizableSplit`，上方再按真实结构拆分为 `area="unstaged"` 与 `area="staged"`，下方复用真实 `CommitBox`；外层 second 使用 `area="preview"`。
6. 其他主视图只渲染填满主区的 `REPO_MAIN_LOADING_AREA`。

- [ ] **Step 4: 运行类型检查与相关桌面冒烟**

- [ ] **Step 5: 运行完整验证**

Run:

```bash
pnpm check
git diff --check
```

Expected:
- ESLint、Prettier、TypeScript 全部通过。
- `git diff --check` 无输出。

- [ ] **Step 6: 运行时冒烟**

在当前 `pnpm tauri dev` 窗口验证：

1. 首次打开无缓存仓库时不出现任何 Skeleton。
2. 变更视图只在侧栏内容、未暂存区、暂存区、右侧预览区显示四个局部 Loading，中间底部直接显示禁用状态的真实提交区。
3. Loading 消失后分栏比例保持稳定，状态栏和滚动区域不重合。
4. 缓存仓库切换不显示 Loading。
5. 标签横向滚动条保持隐藏，普通鼠标滚轮仍可横向浏览标签，最后一个分组边框不被视口裁切。
