# 项目 / 分组 API

> **相关文档：** [command](../architecture/command.md) · [database](../architecture/database.md) · [state-management](../development/state-management.md)

本地后端接口与 HTTP 同一写法：在 `src/api/project.ts` 用 `requestClient.get/post/put/delete`，地址小驼峰。Axios adapter 转到 Tauri Command。UI / Store 只调这些函数。

Rust 查库后整理 DTO 再返回；前端绑定展示，不再把扁平列表改写成树。

---

## 类型

字段与 [database](../architecture/database.md) / Command 输出一致（camelCase）。树节点见 `WorkspaceTreeNode` / `CatalogTreeNode`（`src/types/project.ts`）。

---

## 项目

| 函数 | 地址 | Command |
|------|------|---------|
| `listProjects(workspaceId?)` | `projectList` | `project_list` |
| `addProject(input)` | `projectAdd` | `project_add` |
| `checkProjectUniqueness(input)` | `projectCheckUniqueness` | `project_check_uniqueness` |
| `removeProject(id)` | `projectRemove` | `project_remove` |
| `updateProject(input)` | `projectUpdate` | `project_update` |
| `touchProjectOpened(id)` | `projectTouchOpened` | `project_touch_opened` |
| `pickProjectDirectory()` | `projectPickDirectory` | `project_pick_directory` |
| `getProjectProfileSnapshot(path)` | `projectProfileSnapshot` | `project_profile_snapshot` |
| `listRecentProjects(limit?)` | `recentList` | `recent_list` |
| `removeRecentProject(id)` | `recentRemove` | `recent_remove` |

路径已登记时 `addProject` 返回 `{ project, alreadyExists: true }`，不覆盖名称/简介/图标/分组。

---

## 分组

| 函数 | 地址 | Command |
|------|------|---------|
| `listWorkspaces()` | `workspaceList` | `workspace_list` |
| `getWorkspaceTree(excludeId?)` | `workspaceTree` | `workspace_tree` |
| `getProjectCatalogTree(query?)` | `projectCatalogTree` | `project_catalog_tree` |
| `createWorkspace(...)` | `workspaceCreate` | `workspace_create` |
| `updateWorkspace(input)` | `workspaceUpdate` | `workspace_update` |
| `removeWorkspace(id)` | `workspaceDelete` | `workspace_delete` |
| `reorderWorkspaces(input)` | `workspaceReorder` | `workspace_reorder` |

`getWorkspaceTree`：上级 TreeSelect 用。编辑时传 `excludeId`，后端排除该节点及子孙。

`getProjectCatalogTree`：仪表盘混合树。`query` 只过滤仓库名称/路径，分组仍保留。

颜色在 Rust 读出时已收成 `#RRGGBB` 或空串。

---

## 使用示例

```ts
import { pickProjectDirectory, addProject, getWorkspaceTree } from "@/api/project";

const path = await pickProjectDirectory();
if (!path) return;

const { project, alreadyExists } = await addProject({ path });
const tree = await getWorkspaceTree();
```

底层等价于：

```ts
requestClient.get("projectList", { params: { workspaceId } });
requestClient.post("projectAdd", { path });
```

---

## 非职责

- 不执行 Git 查询（交给 `src/api/git`）
- 不渲染 UI
- 不在前端把 DTO 改写成另一种领域模型
