# 仓库登记清单导入 / 导出设计

日期：2026-07-31

## 目标

在「仓库管理」中支持导入与导出**已登记仓库元数据 + 分组结构**，便于换机备份或迁移列表。不打包磁盘上的 Git 仓库本体；与设置中的整库 `app_data` zip 备份区分开。

## 非目标

- 不导出 / 不导入：打开标签、最近记录、凭据、AI 配置、会话。
- 不克隆远程仓库；不复制仓库工作区文件。
- 不做路径批量重映射向导（本机路径不存在则该条不可导入）。
- 不引入第二套备份体系；整库备份仍走设置「数据」。

## 已确认产品规则

| 项 | 规则 |
|----|------|
| 内容 | 项目：路径、别名、图标、简介、分组归属；分组：名称、父级、图标、颜色、锁定。JSON 可含 `pinned` / `sortOrder`（导出原样写出） |
| 冲突 | 导入前预览：每条标为「新增 / 跳过 / 更新」；用户勾选后执行 |
| 导出范围 | 对话框勾选「全部」→ 全量仓库 + 全部分组；**不勾选** → 当前**已应用筛选**后的全量列表（非仅当前页），分组只含这些仓库用到的祖先链 |
| 格式 | JSON；另存为扩展名 `json`，默认文件名 `jlgit-projects-YYYY-MM-DD.json` |
| 路径不存在 | 预览可见，标记「路径无效」，**不可勾选** |
| 分组对齐 | **名称优先（消歧后），id 兜底**：见下文匹配序；都没有则新建 |
| 架构 | 纯前端组装 / 解析 JSON + 现有 `workspace_*` / `project_*` Service；读写文件走系统文本文件能力 |
| 首期忽略 | 导入**不应用** `pinned` / `sortOrder`（新建走库默认）；不做「同远程已有副本」预览附注 |

## 文件格式

```json
{
  "schema": "jlgit.project-catalog",
  "version": 1,
  "exportedAt": "2026-07-31T02:00:00.000Z",
  "workspaces": [
    {
      "id": "uuid",
      "parentId": null,
      "name": "鲸灵",
      "icon": "code",
      "color": "#5F75C1",
      "locked": false,
      "sortOrder": 0
    }
  ],
  "projects": [
    {
      "id": "uuid",
      "workspaceId": "uuid-or-null",
      "name": "JLGit",
      "description": "可选简介",
      "icon": "folder-git-2",
      "path": "/absolute/path/to/repo",
      "pinned": false,
      "sortOrder": 0
    }
  ]
}
```

约束：

- `schema` 必须为 `jlgit.project-catalog`；`version` 当前仅接受 `1`。
- 路径必须为绝对路径字符串；导入侧再做存在性与是否 Git 仓库校验。
- 导出写入当前本机绝对路径；换机后路径无效的条目按「不可勾选」处理。
- 不包含 `lastOpenedAt` / `createdAt` / `updatedAt`（导入后由本机生成或保持已有记录时间）。
- `pinned` / `sortOrder`：导出写入以便未来版本；**v1 导入忽略**，`project_add` / `project_update` 不传这两项。

## 导出

### 入口

仓库管理工具栏（「打开 / 克隆 / 刷新」旁）增加 **导出** 按钮。

### 交互

1. 打开导出对话框：
   - Checkbox「导出全部仓库与分组」：勾选 = 全量；不勾选 = 当前筛选结果。
   - 展示将导出的仓库数量（与分组数量）摘要。
2. 确认后弹出系统「另存为」；默认文件名 `jlgit-projects-YYYY-MM-DD.json`。
3. 成功 toast；取消另存为则无副作用。

### 数据组装

- **全量**：`projectService.list()` + `workspaceService.list()`（或 store 已加载全集）。
- **当前筛选**：以 `ProjectManagePanel` 中 `appliedFilters` 算出的 **`filtered` 全量**（非当前分页页）为准，经 props 传给工具栏 / 导出对话框；分组集合 = 这些项目的 `workspaceId` 及其全部祖先（保证树可重建），按原 `sortOrder` 排序写出。
- 使用现有 `exportTextFile`（`system_write_text_file`）写入。

## 导入

### 入口

工具栏 **导入** 按钮 → 系统文件选择（filter：`json`）。

### 流水线

```
选文件 → 读文本 → 解析 / schema 校验
  → 构建预览行（分组解析 + 项目分类）
  → 用户勾选 → 确认执行
  → 先确保分组映射，再新增/更新项目
  → 刷新列表 + toast 摘要
```

### 读取文件

对称于导出：新增薄封装 `readTextFile` / 或 `system_read_text_file`（绝对路径、大小上限，如 2 MiB），禁止读未通过对话框选定的任意路径。前端不直接拼 shell。

### 预览分类（项目）

对清单中每一条 `projects[]`：

1. **路径无效**：对 path 调用 `projectService.checkUniqueness({ path })`；若抛出 `INVALID_PATH` / `NOT_A_REPO`（或等价路径错误）→ 状态 `invalid`，展示原因，**禁止勾选**。不新增独立探测 Command。
2. 否则按 uniqueness 结果：
   - `new` → 默认勾选，动作 `create`。
   - `existingPath` → 默认勾选，动作 `update`（将更新别名、图标、简介、分组归属；**不改 path**；**不改 pinned / sortOrder**）。
3. 本功能只按本地路径登记；**首期不做**「同远程已有其他本地副本」附注（不额外 `listRemotes`）。
4. 用户可将 `create` / `update` 取消勾选（等同跳过）；`invalid` 始终不可勾选。

预览列表列：勾选、名称、路径（前省略）、动作（新增 / 更新 / 无效）、备注。

提供「全选可导入项 / 全不选」；底部显示将执行的新增 / 更新计数。

### 分组解析与执行顺序

1. 将导出 `workspaces` 拓扑排序（父先于子）；环或缺失父则校验失败并中止导入（整文件拒绝，toast 说明）。
2. 构建 `exportId → localId` 映射（首期分组无独立勾选，随导入一并处理）。对每个导出分组，按序匹配本机分组：
   1. **同父 + 同名**：父级取已映射的本地 `parentId`（根为 `null`），在本机该父下找同名 → 复用；
   2. 否则 **全局同名且仅一条** → 复用；
   3. 否则若全局同名多条 → **不按名称撞**，进入下一步；
   4. 否则若本机存在相同 **id** → 复用（**id 兜底**）；
   5. 否则 `workspace_create`（名称、图标、颜色、父级用已映射 `parentId`；create API 不带 `locked`），记下新 id；若清单 `locked: true`，再 `workspace_update({ locked: true })`。
   - 复用已有分组时：best-effort `workspace_update` 图标 / 颜色 / 锁定 / 父级（成环或锁定规则禁止则跳过该字段并记入摘要）。
3. 再处理勾选的项目：
   - `create` → `project_add`（path + name + description + icon + 映射后的 workspaceId；**不传 pinned / sortOrder**）；若并发下变为已存在，按 `alreadyExists` 转为跳过，不覆盖。
   - `update` → `project_update`（name、description、icon、workspaceId）。

空分组：全量导出含全部分组；筛选导出仅含用到的祖先链。导入时对文件中的全部分组按上序映射/创建（即使暂无勾选项目引用），以保证树完整。

### 结果

- Toast：`新增 N · 更新 M · 跳过 K · 无效 P`。
- 刷新项目 / 分组 store；关闭预览对话框。
- 单条失败不回滚已成功条目；失败项记入摘要（克制：首期列表 toast + console）。

## UI 结构

| 模块 | 职责 |
|------|------|
| `ProjectManageToolbar` | 导入 / 导出按钮 |
| `ProjectCatalogExportDialog` | 全部勾选 + 数量摘要 + 确认 |
| `ProjectCatalogImportPreviewDialog` | 预览表、勾选、执行 |
| `src/services/project/project.catalog.ts` | 组装导出 JSON、解析校验、预览构建、执行导入 |
| `src/utils/projectCatalog.ts` | 纯函数：schema 校验、分组拓扑、名称/id 匹配、筛选子集裁剪 |
| `system_read_text_file`（若尚无） | 读用户选定绝对路径文本 |

样式：shadcn Dialog / Checkbox / Table 或列表 + ScrollArea；文案走 i18n（`projectManager.catalog*`）。

## 错误处理

- JSON 无法解析 / schema 不匹配 / version 不支持 → 不打开预览，toast 错误。
- 文件过大 → 拒绝读取。
- 执行中禁用确认按钮；部分失败见结果摘要。
- 路径校验与 `project_add` 一致：预览阶段仅通过 `checkUniqueness({ path })`；捕获 `INVALID_PATH` / `NOT_A_REPO` 标为无效，不新增探测 Command。

## 安全

- 仅读写用户经对话框选择的绝对路径。
- 不执行清单内任何命令字段（格式无命令字段）。
- 导入内容展示时按文本处理，防 XSS（无 HTML 渲染）。

## 测试要点

- 导出全量 / 筛选子集（分组祖先链完整）。
- 导入：纯新增；更新已存在；路径无效不可勾选；同名分组复用；仅 id 相同名称不同时走 id 兜底；父级拓扑正确。
- 取消文件对话框无写入。
- 与 `project_add` alreadyExists 语义一致（不静默覆盖未勾选更新的字段）。

## 文档同步（实现时）

- `docs/product/feature-list.md`：仓库管理导入导出 → Done / In Progress。
- `docs/api/project.md`：补充 catalog 辅助 API（若导出为 service 方法）。
- 若新增 `system_read_text_file`：更新 `docs/architecture/command.md`。

## 实现策略

采用**方案 1（纯前端 JSON + 现有 Service）**：改动面可控，复用唯一性与分组锁定规则；不新增整包事务 Command。文件读写复用 / 对称扩展 system 文本文件命令。
