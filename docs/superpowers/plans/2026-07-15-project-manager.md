# 新标签页仓库管理与分组 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在新标签页提供最近、打开和可持久化仓库分组，不实现收藏。

**Architecture:** 复用 SQLite `workspaces` 与 `projects.workspace_id`；补齐 Rust Command、前端 Service、Store 与业务 UI。仓库管理组件仅调用 Store/Service，所有 Git 加载仍由 RepoPage 承担。

**Tech Stack:** Tauri 2、Rust/sqlx/SQLite、React 19、TypeScript strict、Zustand、i18next、shadcn/ui、lucide-react。

## Global Constraints

- 不实现收藏入口、数据或 Command；不新增依赖。
- 复用现有 shadcn `Button`、`Input`、`ScrollArea`、`Dialog`、`Tooltip`。
- UI → Service → Tauri Command → Rust/SQLite；不直接 invoke 或拼 SQL。
- 文案走 i18n，图标仅 lucide，色彩只用现有 tokens。
- 当前没有前端测试框架：Rust 用 `cargo test`；前端用 `tsc`、构建与桌面冒烟。

---

### Task 1: Workspace 数据与 Command

**Files:**
- Modify: `src-tauri/src/db/mod.rs`
- Modify: `src-tauri/src/commands/project.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `docs/architecture/command.md`
- Modify: `docs/api/project.md`

**Interfaces:**

```rust
pub struct WorkspaceRow { pub id: String, pub name: String, pub sort_order: i64, pub created_at: String, pub updated_at: String }
pub async fn list_workspaces(pool: &SqlitePool) -> Result<Vec<WorkspaceRow>, AppError>;
pub async fn create_workspace(pool: &SqlitePool, name: String) -> Result<WorkspaceRow, AppError>;
pub async fn update_workspace(pool: &SqlitePool, id: &str, name: Option<String>, sort_order: Option<i64>) -> Result<WorkspaceRow, AppError>;
pub async fn delete_workspace(pool: &SqlitePool, id: &str) -> Result<(), AppError>;
```

- [ ] **Step 1: 写失败测试**：在 `db/mod.rs` 现有测试模块添加创建/列表、项目归组、删除后项目解绑三个测试。
- [ ] **Step 2: 运行失败测试**：`cd src-tauri && cargo test workspace -- --nocapture`；预期因函数/表不存在失败。
- [ ] **Step 3: 最小实现**：在迁移创建 `workspaces`；创建时 trim 非空校验，更新支持名称或排序，删除先将项目 `workspace_id` 置空再删除；扩展 `update_project` 以接收 `Option<Option<String>>`。
- [ ] **Step 4: 添加并注册 Command**：实现 `workspace_list/create/update/delete`，扩展 `project_update` 的 `workspace_id`，在 `lib.rs` 注册。
- [ ] **Step 5: 验证**：`cd src-tauri && cargo test`，预期全绿。
- [ ] **Step 6: 同步命令/API 文档并提交**：

```bash
git add src-tauri/src/db/mod.rs src-tauri/src/commands/project.rs src-tauri/src/lib.rs docs/architecture/command.md docs/api/project.md
git commit -m "feat(project): 支持仓库分组持久化"
```

### Task 2: 前端 Workspace Service 与 Store

**Files:**
- Modify: `src/types/project.ts`
- Create: `src/services/project/workspace.service.ts`
- Modify: `src/services/project/index.ts`
- Modify: `src/services/project/project.service.ts`
- Modify: `src/store/useProjectStore.ts`

**Interfaces:**

```ts
export interface Workspace { id: string; name: string; sortOrder: number; createdAt: string; updatedAt: string; }
workspaceService.list(): Promise<Workspace[]>;
workspaceService.create(name: string): Promise<Workspace>;
workspaceService.update(input: { id: string; name?: string; sortOrder?: number }): Promise<Workspace>;
workspaceService.remove(id: string): Promise<void>;
```

- [ ] **Step 1:** 为 Workspace/结果类型建模；`projectService.update` 支持 `workspaceId?: string | null`。
- [ ] **Step 2:** 实现 `workspace.service.ts`，全部调用 `invokeCommand`；导出该 Service。
- [ ] **Step 3:** Store 新增 `workspaces` 和 load/create/update/remove/updateProject 动作；删除后将匹配项目改为未分组，错误规范化后重抛。
- [ ] **Step 4:** 运行 `pnpm exec tsc --noEmit`，预期通过。
- [ ] **Step 5: 提交**：

```bash
git add src/types/project.ts src/services/project src/store/useProjectStore.ts
git commit -m "feat(project): 接入仓库分组服务"
```

### Task 3: 仓库管理页面

**Files:**
- Create: `src/components/project/ProjectManager.tsx`
- Create: `src/components/project/OpenProjectForm.tsx`
- Create: `src/components/project/WorkspaceTree.tsx`
- Modify: `src/components/project/RecentProjectList.tsx`
- Modify: `src/pages/DashboardPage.tsx`
- Modify: `src/i18n/locales/zh-CN.json`
- Modify: `src/i18n/locales/en.json`

**Interfaces:**

```ts
type ProjectManagerView = "recent" | "open" | "groups";
interface OpenProjectFormProps { workspaces: Workspace[]; onOpened: (projectId: string) => void; }
interface WorkspaceTreeProps { projects: Project[]; workspaces: Workspace[]; onOpened: (projectId: string) => void; onMoveProject: (projectId: string, workspaceId: string | null) => Promise<void>; }
```

- [ ] **Step 1:** ProjectManager 使用三项左栏（最近、打开…、分组），不渲染收藏；Dashboard 加载 workspaces，复用新标签页替换回调。
- [ ] **Step 2:** RecentProjectList 增加名称/路径过滤，并保留单击选中、双击/Enter 打开；空状态主操作切至打开页。
- [ ] **Step 3:** OpenProjectForm 复用目录选择与登记流程，增加“未分组 / 已有分组”选择；成功调用 `onOpened`，失败内联提示。
- [ ] **Step 4:** WorkspaceTree 按 workspaceId 分树，含未分组节点、过滤、展开、双击/Enter 打开；用已有 Dialog 创建/重命名/确认删除，用 ContextMenu 移动仓库。
- [ ] **Step 5:** 两种语言补齐 `projectManager.*` 文案及 Tooltip/aria-label。
- [ ] **Step 6:** 运行 `pnpm exec tsc --noEmit && pnpm build`，预期通过。
- [ ] **Step 7: 提交**：

```bash
git add src/components/project src/pages/DashboardPage.tsx src/i18n/locales/zh-CN.json src/i18n/locales/en.json
git commit -m "feat(project): 新增仓库管理分组页面"
```

### Task 4: 完整验收

- [ ] **Step 1:** 运行 `pnpm exec tsc --noEmit && pnpm build && (cd src-tauri && cargo test)`，预期所有命令退出码为 0。
- [ ] **Step 2:** 在 `pnpm tauri dev` 验收：三项导航、最近过滤、目录打开、分组创建/重命名/移动/删除、双击打开、重启持久化；不存在收藏入口、白屏或无限渲染。
- [ ] **Step 3:** 仅当 `docs/product/feature-list.md` 已有对应条目时更新状态并提交。

## Plan Self-Review

- Spec coverage: Task 1/2 覆盖持久化与分层契约；Task 3 覆盖三页、不做收藏、i18n 和现有组件复用；Task 4 覆盖机器和桌面验收。
- Placeholder scan: 每项给出文件、实现边界或精确命令；未留下待补充标记。
- Type consistency: `WorkspaceRow`、`Workspace`、`workspaceId` 与 `workspaceService` 在所有任务使用一致语义。
