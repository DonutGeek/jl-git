# 状态管理

> **相关文档：** [frontend](../architecture/frontend.md) · [database](../architecture/database.md) · [AGENTS.md](../../AGENTS.md)

---

## 优先级

```
Local State → Zustand → SQLite
```

| 层级 | 何时用 | 示例 |
|------|--------|------|
| Local | 仅单组件关心 | 输入框、popover 开关 |
| Zustand | 跨组件会话状态 | 当前项目、选中文件、status 缓存 |
| SQLite | 跨启动、需查询 | 项目列表、设置、AI 历史 |

不要用 Context 做全局业务状态。不要引入第二套全局库。

---

## Zustand 约定

- 文件：`src/store/useXxxStore.ts`
- 导出：`useXxxStore`
- 按域拆分：`useProjectStore`、`useGitStore`、`useUiStore`、`useSettingsStore`
- 可选用 `subscribeWithSelector`；避免一个巨型 store

```ts
interface GitState {
  status: GitStatusResult | null;
  selectedPaths: string[];
  setStatus: (status: GitStatusResult | null) => void;
  setSelectedPaths: (paths: string[]) => void;
  reset: () => void;
}
```

### 规则

1. Store **不**直接 `invoke`；由 Service / Hook 写入
2. 仓库状态按规范化路径隔离；切换时还原目标仓会话，冷开仓才重置展示数据
3. 选择器取值，避免整树订阅导致重渲染：

```ts
const branch = useGitStore((s) => s.status?.branch);
```

4. 派生数据优先在 selector 或 utils 计算，不在每个组件复制逻辑

---

## 与 SQLite 的同步

```mermaid
sequenceDiagram
  participant UI
  participant Hook
  participant Svc as ProjectService
  participant DB as SQLite
  participant Store as useProjectStore
  UI->>Hook: 挂载仪表盘
  Hook->>Svc: listProjects()
  Svc->>DB: project_list
  DB-->>Svc: rows
  Svc-->>Hook: projects
  Hook->>Store: setProjects(projects)
  UI->>Store: 渲染
```

- 写路径：UI → Service → DB →（成功）更新 Store
- 禁止只改 Store 假装已持久化

---

## Git 状态缓存

- `git status` 结果放 `useGitStore`
- 真相源仍是 Git；任何写操作成功后必须刷新
- 可对 status 请求做 in-flight 合并（debounce / shared promise）
- 异步 Git 操作在第一次 `await` 前捕获 `repoPath` 与查询偏好；完成、失败和后续刷新都只回写发起仓库
- `loading` / `error` 必须按仓库隔离。A 仓操作未完成时切到 B，B 不继承 A 的状态；切回 A 要恢复 A 的 pending 状态
- 禁止在复合操作的 `await` 间隙重新读取“当前仓库”作为 Git 命令目标

---

## 设置状态

- `useSettingsStore` 持有运行时设置
- 启动时 `settings_get_all` 注入
- 变更：乐观更新 UI + `settings_set`；失败则回滚并 toast

主题类设置还需同步 DOM class / CSS，见 [theme](theme.md)。

---

## 反模式

- 把表单全程塞进 Zustand
- 在 store 里导入 React 组件
- 深度克隆整棵巨大状态代替细粒度更新
- 用 SQLite 缓存每次 keystroke
