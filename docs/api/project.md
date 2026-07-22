# ProjectService API

> **相关文档：** [command](../architecture/command.md) · [database](../architecture/database.md) · [state-management](../development/state-management.md)

前端项目域门面。UI / Hook 只依赖本 Service，不直接 `invoke`。

实现位置（目标）：`src/services/project/`。

---

## 类型

```ts
interface Project {
  id: string;
  workspaceId: string | null;
  name: string;
  description: string | null;
  path: string;
  lastOpenedAt: string | null;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Workspace {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface RecentItem {
  projectId: string;
  openedAt: string;
}
```

字段与 [database](../architecture/database.md) / Command 输出一致（camelCase）。

---

## `projectService`

### `list(workspaceId?: string): Promise<Project[]>`

- **Command：** `project_list`
- **错误：** `DB_ERROR` → 抛出/返回领域错误

### `add(input: { path: string; workspaceId?: string; name?: string; description?: string }): Promise<Project>`

- **Command：** `project_add`
- **前置：** 路径存在且为 Git 仓库
- **错误：** `INVALID_PATH` `NOT_A_REPO` `VALIDATION` `DB_ERROR`

### `remove(id: string): Promise<void>`

- **Command：** `project_remove`
- **语义：** 仅取消登记，不删除磁盘文件

### `update(input: { id: string; name?: string; workspaceId?: string | null; description?: string | null }): Promise<Project>`

- **Command：** `project_update`
- **语义：** `description: null` 清空简介；省略则不改

### `touchOpened(id: string): Promise<void>`

- **Command：** `project_touch_opened`
- **时机：** 进入 `/repo/:id` 时由 RepoLayout 调用

### `pickDirectory(): Promise<string | null>`

- **Command：** `project_pick_directory`
- **语义：** 只选路径；入库需再调 `add`

### `getProjectProfileSnapshot(path: string): Promise<ProjectProfileSnapshot>`

- **Command：** `project_profile_snapshot`
- **语义：** 收集 README / 清单文本，供 `generateProjectDescription` 使用
- **错误：** `INVALID_PATH` `NOT_A_REPO` `IO_ERROR`

### `listRecent(limit?: number): Promise<RecentItem[]>`

- **Command：** `recent_list`

### `listFavorites(): Promise<string[]>`

- **Command：** `favorite_list`
- **返回：** projectId 数组

### `setFavorite(projectId: string, favorite: boolean): Promise<void>`

- **Command：** `favorite_set`

---

## Workspace API（可同模块导出 `workspaceService`）

| 方法 | Command |
|------|---------|
| `list()` | `workspace_list` |
| `create(name, parentId?)` | `workspace_create` |
| `update({ id, name?, parentId?, icon?, color? })` | `workspace_update` |
| `remove(id)` | `workspace_delete` |

---

## 与 Store 协作

```ts
const projects = await projectService.list();
useProjectStore.getState().setProjects(projects);
```

写成功后再改 Store；失败不更新。

---

## 使用示例

```ts
const path = await projectService.pickDirectory();
if (!path) return;

try {
  const project = await projectService.add({ path });
  useProjectStore.getState().upsertProject(project);
  navigate(`/repo/${project.id}`);
} catch (error) {
  toast.error(toUserMessage(error));
}
```

---

## 非职责

- 不执行 Git 查询（交给 GitService）
- 不渲染 UI
- 不解析 porcelain
