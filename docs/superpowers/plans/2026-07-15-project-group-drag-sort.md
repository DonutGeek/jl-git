# 项目分组拖拽排序 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 支持同级分组排序、分组内项目排序和项目跨分组移动，并将结果可靠持久化到 SQLite。

**Architecture:** Rust 负责对项目归属与两类顺序做原子批量更新；前端 Service/Store 提供一个明确的排序入口。`ProjectManager` 将分组树的同级区域建模为 dnd-kit 容器，拖放后根据结果生成批量请求，失败则从 Store 的快照恢复。

**Tech Stack:** Tauri 2、Rust/sqlx/SQLite、React 19、TypeScript strict、Zustand、@dnd-kit/core、@dnd-kit/sortable、Vitest。

## Global Constraints

- 分组只能在相同 `parentId` 下排序，不通过拖拽改变层级。
- 项目可以在分组内排序，或移动到另一分组及无分组根区域。
- 所有持久化排序在一个 SQLite 事务内完成；失败不得部分写入。
- 分组树项目不显示本地路径；组行与项目行高度统一。
- 复用现有 dnd-kit 与 Design Tokens，不新增依赖；UI 不直接 invoke。

---

### Task 1: SQLite 排序模型和原子 Command

**Files:**
- Modify: `src-tauri/src/db/mod.rs`
- Modify: `src-tauri/src/commands/project.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `docs/architecture/command.md`
- Modify: `docs/api/project.md`

**Interfaces:**

```rust
#[derive(Deserialize)]
pub struct WorkspaceOrderItem { pub id: String, pub sort_order: i64 }
#[derive(Deserialize)]
pub struct ProjectOrderItem { pub id: String, pub workspace_id: Option<String>, pub sort_order: i64 }
pub async fn reorder_projects_and_workspaces(
  pool: &SqlitePool,
  workspaces: Vec<WorkspaceOrderItem>,
  projects: Vec<ProjectOrderItem>,
) -> Result<(), AppError>;
```

- [ ] **Step 1: 写 Rust 失败测试**：在 `db/mod.rs` 的测试模块创建临时数据库，断言迁移后的 `projects` 含 `sort_order`；断言批量请求可重排两个同级分组、将项目移动到另一分组并更新顺序；传入不存在项目 ID 时断言返回错误且已写入的顺序未改变。
- [ ] **Step 2: 运行失败测试**：`cd src-tauri && cargo test reorder_projects_and_workspaces -- --nocapture`；预期因函数或列不存在失败。
- [ ] **Step 3: 最小数据库实现**：给 `ProjectRow` 增加 `sort_order`，新建表定义与旧库迁移均补 `projects.sort_order INTEGER NOT NULL DEFAULT 0`；`list_projects` 改为按 `pinned DESC, sort_order ASC, name COLLATE NOCASE ASC`。创建项目时将排序值设为所属 workspace 内最大值加一。
- [ ] **Step 4: 实现事务排序**：`pool.begin()` 后先验证每个 workspace / project ID 存在，校验项目目标 workspace 存在或为 `NULL`，再更新 `workspaces.sort_order` 与 `projects.workspace_id, sort_order, updated_at`；任一验证失败返回错误，事务自动回滚，成功后 commit。
- [ ] **Step 5: 暴露 Command**：在 project command 中定义 `workspace_reorder` 输入与返回 `OkResult`，在 `lib.rs` 注册；更新 Command/API 文档。
- [ ] **Step 6: 验证并提交**：运行 `cd src-tauri && cargo test`，然后：

  ```bash
  git add src-tauri/src/db/mod.rs src-tauri/src/commands/project.rs src-tauri/src/lib.rs docs/architecture/command.md docs/api/project.md
  git commit -m "feat(project): 持久化分组与项目排序"
  ```

### Task 2: 前端排序 Service、类型与 Store

**Files:**
- Modify: `src/types/project.ts`
- Modify: `src/services/project/workspace.service.ts`
- Modify: `src/services/project/index.ts`
- Modify: `src/store/useProjectStore.ts`

**Interfaces:**

```ts
export interface Project { sortOrder: number; /* existing fields */ }
export interface WorkspaceOrderItem { id: string; sortOrder: number; }
export interface ProjectOrderItem { id: string; workspaceId: string | null; sortOrder: number; }
workspaceService.reorder(input: {
  workspaces: WorkspaceOrderItem[];
  projects: ProjectOrderItem[];
}): Promise<void>;
useProjectStore.getState().reorderGroupedItems(input): Promise<void>;
```

- [ ] **Step 1: 写失败测试**：在 `src/utils/projectGroupOrder.test.ts` 写纯函数测试，给出拖放后的 root/group 项目列表，断言生成的项目项含连续 `sortOrder` 和正确 `workspaceId`；非法目标分组返回 `null`。
- [ ] **Step 2: 运行失败测试**：`pnpm test src/utils/projectGroupOrder.test.ts`；预期模块不存在失败。
- [ ] **Step 3: 建立纯排序请求函数**：新建 `src/utils/projectGroupOrder.ts`，定义 `buildProjectOrderItems(groups, projectsByWorkspace)`，仅接受存在的 workspace ID；按显示顺序产出连续位置。运行步骤 1 测试至通过。
- [ ] **Step 4: 接通边界**：给 `Project` 增加 `sortOrder`；Service 通过 `invokeCommand<OkResult>("workspace_reorder", input)` 调用 Command；Store 先写入乐观的 `projects/workspaces` 排序快照，失败时恢复并抛出规范化错误。
- [ ] **Step 5: 类型验证并提交**：运行 `pnpm exec tsc --noEmit`，然后：

  ```bash
  git add src/types/project.ts src/services/project src/store/useProjectStore.ts src/utils/projectGroupOrder.ts src/utils/projectGroupOrder.test.ts
  git commit -m "feat(project): 接入分组排序服务"
  ```

### Task 3: 分组树拖拽与统一行布局

**Files:**
- Modify: `src/components/project/ProjectManager.tsx`

**Interfaces:**

```ts
type DragItem = { type: "workspace" | "project"; id: string; parentId?: string | null; };
function handleGroupDragEnd(event: DragEndEvent): Promise<void>;
```

- [ ] **Step 1: 引入现有 dnd-kit 模式**：参照 `RepoTabBar.tsx` 使用 `DndContext`、`PointerSensor`（activationConstraint: distance 6）、`SortableContext`、`useSortable`、`DragOverlay` 与 `CSS.Transform`。创建就近的 `SortableWorkspaceRow` 和 `SortableProjectRow`，其 props 只接受显示数据、拖拽状态与既有打开回调。
- [ ] **Step 2: 建模合法容器**：每个同级 workspace 数组使用独立 `SortableContext`；每个展开 workspace 和无分组根节点使用项目 `SortableContext`。`onDragEnd` 仅接受 workspace→同 parent workspace，或 project→project/container；其它组合调用 `onDragCancel` 复位。
- [ ] **Step 3: 写回排序**：拖放后以 `arrayMove` 更新内存数组，调用 `buildProjectOrderItems` 和 `reorderGroupedItems`；失败时 `toast.error(toUserMessage(error))` 并恢复快照。拖拽期间设置 `isDragging`，禁用创建/打开/其他拖拽。
- [ ] **Step 4: 调整布局**：分组及项目按钮统一 `h-9`、紧凑内边距；项目行删除路径节点，仅保留图标、名称和打开中状态。保留悬停、选择、焦点环与图标背景对比样式。
- [ ] **Step 5: 运行前端验证并提交**：

  ```bash
  pnpm test
  pnpm exec tsc --noEmit
  pnpm exec vite build
  git add src/components/project/ProjectManager.tsx
  git commit -m "feat(project): 支持分组内拖拽排序"
  ```

### Task 4: 端到端验收

- [ ] **Step 1:** 运行 `cd src-tauri && cargo test`、`pnpm test`、`pnpm exec tsc --noEmit`、`pnpm exec vite build`，确认全部 exit code 为 0。
- [ ] **Step 2:** 在 `pnpm tauri dev` 验收：拖动根分组、子分组、同组项目，项目跨组和移至无分组；取消拖拽；双击/Enter 打开；重启后顺序保留；浅色/深色下 overlay、焦点、行高均正常。
- [ ] **Step 3:** 仅在已有对应条目时更新 `docs/product/feature-list.md`，不添加占位说明。

## Plan Self-Review

- Spec coverage: Task 1 覆盖迁移、事务与 Command；Task 2 覆盖前端契约与失败恢复；Task 3 覆盖全部拖拽规则和视觉要求；Task 4 覆盖自动与桌面验收。
- Placeholder scan: 每个任务有精确文件、接口、验证命令与数据流；无待定实现项。
- Type consistency: `sortOrder`、`workspaceId`、`WorkspaceOrderItem`、`ProjectOrderItem` 在 Rust Command、Service、Store 和组件中使用相同语义。
