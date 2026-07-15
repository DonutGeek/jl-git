# 新标签页仓库管理与分组设计

> 日期：2026-07-15  
> 范围：新标签页中的最近仓库、打开仓库和真实仓库分组；不含收藏

## 目标

新标签页提供面向本地 Git 仓库的双栏管理页。左栏用于在“最近”“打开…”与“分组”之间切换，右侧聚焦当前任务；视觉沿用 JLGit 的 Design Tokens、紧凑工具型布局和现有 shadcn 基础控件。

本轮不显示、不存储也不实现收藏。仓库分组使用既有 `workspaces` / `projects.workspace_id` 模型，数据写入 SQLite，重启后保持。

## 页面与交互

### 左侧导航

- 固定三项：最近、打开…、分组；使用 lucide 图标、可见选中态、键盘可达焦点环。
- 活动项使用现有 `accent` / `primary` token 的低饱和表达，不使用参考图的高饱和色块。
- 不提供收藏入口，避免显示未实现能力。

### 最近

- 顶部显示“最近使用的仓库”与搜索输入框；搜索同时匹配仓库名和本地路径。
- 列表行显示仓库名、完整路径及最近打开时间；单击选中，双击或在选中行按 Enter 打开。
- 打开成功后，当前新标签页原地替换为仓库标签；打开失败时保留列表和错误提示。
- 无最近仓库时显示已有空状态与一个“打开仓库”主操作。

### 打开…

- 把现有 `OpenRepoDialog` 的本地仓库打开表单改为可复用内容，嵌入右侧页面。
- 用户可选择目录、填写可选别名，并从“未分组”或已有分组中选择归属。
- 提交成功后登记项目、写入分组并原地替换当前新标签页；失败时保留输入并展示领域错误。
- 本轮仅支持本地目录；不实现远程 URL 克隆。

### 分组

- 顶部提供“仓库分组”标题、名称/路径过滤框和“新建分组”按钮。
- 内容以可展开树展示：根节点为全部分组，每个分组下显示所属仓库；未分组仓库单列显示。
- 双击仓库或选中后按 Enter 打开；分组节点只控制展开，不触发 Git 操作。
- 新建与重命名分组使用现有 `Dialog`；仓库归属通过打开表单和分组页的仓库菜单变更。
- 删除分组需确认；成功后将其项目 `workspace_id` 置空，不删除项目登记或磁盘目录。

## 数据与分层

已有 SQLite 表结构直接复用：`workspaces` 是分组表，`projects.workspace_id` 是可空外键。新增实现遵循：

```text
Dashboard feature
  → projectService / workspaceService
  → workspace_* / project_update Command
  → Rust db workspace helpers / SQLite
```

前端新增 `Workspace` 类型与 `workspace.service.ts`，Project 更新接口增加 `workspaceId?: string | null`。`useProjectStore` 维护 `workspaces` 并在创建、更新、删除分组后同步项目列表；UI 不直接 invoke 或拼 SQL。

Rust 在 `db` 中补齐 workspace 的 list/create/update/delete 查询，在 `commands/project.rs` 或同域模块注册 `workspace_*` Command；输入名称需 trim、非空并限制合理长度，错误统一为可序列化领域错误。迁移只追加：保证 `workspaces` 表存在，`projects.workspace_id` 已存在时不重建数据。

## 组件与依赖

- 复用：`Button`、`Input`、`ScrollArea`、`Dialog`、`Tooltip`（均为已引入的 shadcn 组件）。
- 新增业务组件放在 `src/components/project/`：管理页壳、最近列表、打开表单、分组树；不手写或修改 `src/components/ui/`。
- 图标使用 `lucide-react`；颜色、边框、圆角、焦点态只使用现有 CSS tokens 和 Tailwind 语义类。
- 不新增 shadcn 组件、第三方依赖或第二套 UI 体系。

## 错误、性能与验收

- 所有异步操作禁用重复提交；失败由 toast 或表单内提示可感知。
- 分组树先按当前登记仓库数量渲染；若未来大规模列表出现，再按性能规范引入虚拟滚动，本轮不预埋。
- 运行时验收：切换三个页面、搜索、创建/重命名/删除分组、未分组与分组仓库的移动、打开仓库、双击最近仓库、重启持久化。
- 机器检查：`pnpm exec tsc --noEmit`、`pnpm build`、`cd src-tauri && cargo test`。
- 无已知 S0/S1；若桌面运行环境不可启动，必须明确记录未完成的运行时冒烟，不得以构建通过代替。
