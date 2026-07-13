# JLGit 基础仓库工作区 — 设计文档

> 日期：2026-07-09  
> 状态：待用户确认后进入实现计划  
> 对齐：roadmap「日常可用」切片（v0.2 闭环 + 分支切换 + 历史；不含 Diff）

---

## 1. 目标

交付可演示的本地 Git 工作流：

1. 打开本地仓库（输入路径或选文件夹，可选别名）
2. 记住最近打开的项目（SQLite）
3. 进入三栏仓库页：左分支 · 中变更/暂存/提交 · 右提交历史

---

## 2. 范围

### 2.1 In Scope

| 能力 | 说明 |
|------|------|
| 打开本地仓库 | 路径输入 + 系统目录选择；别名可选（默认文件夹名） |
| 最近项目 | 登记到 SQLite；首页列表可再次打开 |
| 左栏分支 | **本地 / 远端** 分组；路径按 `/` 折成树；本地点击切换；远端点击检出并跟踪 |
| 中栏变更 | **变更 (N)** / **待提交 (N)** 双区；列表视图；图标 stage/unstage；底部「提交到 {分支}」 |
| 右栏历史 | 分页 `git_log`（hash 短显、作者、相对时间、message 首行） |

### 2.2 Out of Scope（本版明确不做）

- 文件 Diff 视图
- 远程：clone / fetch / pull / push
- 仓库分组 / workspace UI
- 创建 / 删除分支
- discard、amend、stash、tag、merge/rebase
- AI、主题设置页完善

---

## 3. 用户流程

```
Dashboard（/）
  ├─ 最近项目列表 → 点击 → /repo/:projectId
  └─ 「打开仓库」表单
       路径（必填，可输入或「选择」）
       别名（可选）
       → 确定
       → 校验为 Git 仓库 → project_add → touch_opened
       → 导航 /repo/:projectId

RepoWorkspace（/repo/:projectId）
  顶栏：项目名 · 当前分支 · 返回首页
  左：BranchList（本地/远端树）→ checkout → 刷新 status/branches/log
  中：ChangesPanel（变更/待提交）+ CommitBox（提交到当前分支）
  右：HistoryList（加载更多）
```

打开表单字段对齐用户参考图的**本地子集**：无「远程」按钮、无「分组」。

---

## 4. 架构

### 4.1 分层（不变）

```
React Page/Hook → Service → invoke(Command) → Rust → Git CLI / SQLite
```

- UI 不直接 `invoke`，不拼 shell
- Git 仅经 `src/services/git/*`
- 路径校验与 Git 执行仅在 Rust

### 4.2 本版 Command 清单

**项目**

- `project_list`
- `project_add` — `{ path, name? }`
- `project_touch_opened`
- `project_pick_directory`
- `recent_list`

**Git 读**

- `git_status`
- `git_branches` — `includeRemote: true` 时同时返回本地 + `refs/remotes`（`isRemote`）
- `git_log` — 默认 `limit=50`

**Git 写**

- `git_stage` / `git_unstage`
- `git_stage_all` / `git_unstage_all`
- `git_commit` — message 非空；不传 amend；不跳过 hooks
- `git_checkout` — 切换本地分支；远端 ref（如 `origin/foo`）则创建/切换跟踪分支

契约字段以 [docs/architecture/command.md](../../architecture/command.md) 为准。

### 4.3 Rust 结构（目标）

```
src-tauri/src/
  lib.rs                 # 注册 plugin + commands
  error.rs               # AppError
  commands/
    project.rs
    git_status.rs
    git_branch.rs
    git_log.rs
    git_commit.rs        # stage/unstage/commit
    git_checkout.rs
  git/
    runner.rs
    path.rs              # 规范化 + 工作树校验
    parse_status.rs
    parse_branch.rs
    parse_log.rs
  db/
    mod.rs               # 迁移 + projects/recent
```

执行模型：[docs/architecture/git.md](../../architecture/git.md)。

### 4.4 前端结构（目标）

```
src/
  router/index.tsx
  pages/
    DashboardPage.tsx
    RepoPage.tsx
  layouts/
    AppLayout.tsx
  components/
    project/OpenRepoForm.tsx
    project/RecentProjectList.tsx
    git/BranchList.tsx
    git/ChangesPanel.tsx
    git/CommitBox.tsx
    git/HistoryList.tsx
  services/
    project/*.ts
    git/git.status.ts
    git/git.branch.ts
    git/git.commit.ts
    git/git.log.ts
  store/
    useProjectStore.ts
    useRepoStore.ts
  types/
    project.ts
    git.ts
    error.ts
  i18n/locales/zh-CN.json
```

路由本版仅：

| 路径 | 页面 |
|------|------|
| `/` | Dashboard |
| `/repo/:projectId` | 三栏仓库页（同页，不拆子路由） |

`projectId` 为 DB UUID，磁盘路径由 Store/Service 解析。

### 4.5 状态

- `useProjectStore`：项目列表、最近、当前 project
- `useRepoStore`：`status`、`branches`、`commits`、`hasMore`、loading/error、commitMessage
- 瞬时 UI（表单输入、展开折叠）用组件本地 state

打开仓库后并行加载 branches / status / log。写操作成功后：

| 操作 | 刷新 |
|------|------|
| stage/unstage | status |
| commit | status + log（重置 skip） |
| checkout | branches + status + log |

### 4.6 持久化

SQLite 最小集：

- `projects`（id, name, path UNIQUE, last_opened_at, …）
- `recent_projects`（或仅靠 `projects.last_opened_at` 排序；若文档已有 recent 表则按 [database.md](../../architecture/database.md) 实现）

本版不暴露 workspace / favorite UI；表可按迁移预留，但 UI 不依赖。

---

## 5. UI

### 5.1 布局

```
┌─────────────────────────────────────────────────────────┐
│ [项目名] · [当前分支]                        [返回]      │  ← Overlay 标题栏
├──────────┬────────────────────────────┬─────────────────┤
│ 分支     │ [列表|树形]                │ History         │
│ ▾ 本地   │ ▾ 变更 (N)            [↓] │                 │
│   main ✓ │   Default                 │ abc123 message  │
│   feat/x │     file…                 │ def456 …        │
│ ▾ 远端   │ ▾ 待提交 (N)          [↑] │ [加载更多]      │
│  ▾ origin│   …                       │                 │
│    daily │ ───────────────────────── │                 │
│          │ message                   │                 │
│          │ [提交到 {branch}]         │                 │
└──────────┴────────────────────────────┴─────────────────┘
```

风格：Minimal / Professional；颜色仅 Design Tokens；图标仅 lucide-react；基础控件用 shadcn。

### 5.2 Dashboard

- 标题 + 「打开仓库」表单（路径、选择按钮、别名、确定）
- 下方最近项目列表（名称、路径、上次打开）

### 5.3 交互细则

- Commit：message trim 后为空则禁用；按钮文案「提交到 {当前分支}」；成功 toast + 清空 message
- Checkout：本地分支直接 `git switch`；远端 `origin/foo` 用 `git switch -c foo --track origin/foo`（本地已有同名则切本地）
- 分支树：本地 / 远端分组；名称按 `/` 折叠为文件夹
- 中栏：变更=未暂存，待提交=已暂存；列表视图可用；树形 Tab 本轮占位
- 历史：短 hash + 首行 message；「加载更多」用 skip/limit
- 空状态：无变更时中栏提示「工作区干净」；无历史时右栏提示
- 明确不做：push 勾选、stash 入口、TAPD/工蜂关联、真正树形文件视图

### 5.4 i18n

用户可见文案进 `zh-CN` 资源；品牌名 `JLGit` 可硬编码。

### 5.5 窗口标题栏（macOS）

- `titleBarStyle: Overlay` + `hiddenTitle`
- 统一 `TitleBar` 高度约 52px，`pl-[78px]` 避开红绿灯，`trafficLightPosition.y ≈ 18` 垂直居中
- 顶栏空白 `data-tauri-drag-region`；按钮等交互控件 `WebkitAppRegion: no-drag`
- 仓库名可点击：下拉切换已登记项目，或「打开新仓库」回首页

---

## 6. 错误处理

| 场景 | 处理 |
|------|------|
| 路径不存在 / 非仓库 | 表单内联错误（`INVALID_PATH` / `NOT_A_REPO`） |
| 选目录取消 | 无操作（path null） |
| Git 命令失败 | toast + 可选内联；Service 映射 `AppError` |
| 项目路径失效（再打开） | 提示无法打开，可从列表移除（若本版实现 remove；否则仅提示） |
| 空 catch | 禁止 |

日志：开发期 console / tauri-plugin-log；不记录凭据。

---

## 7. 安全

- Git 参数数组化，无 `shell: true`
- stage 路径必须相对仓库根，拒绝 `..`
- 打开前 `rev-parse --show-toplevel` 校验工作树
- 路径规范化后再入库

---

## 8. 验收标准

- [ ] 左栏分「本地 / 远端」；本地点击可切换；远端可检出跟踪
- [ ] 中栏为「变更 / 待提交」双区，可 stage/unstage，提交按钮显示当前分支
- [ ] 可通过输入或选目录打开本地 Git 仓库并进入三栏页
- [ ] 重启应用后最近项目仍可打开
- [ ] 可 stage/unstage 单文件与全部，列表状态正确
- [ ] 可填写 message 并 commit，历史列表出现新提交，变更清空
- [ ] 历史可分页加载更多
- [ ] 非仓库路径有明确错误提示
- [ ] 前端无散落 `invoke`；无新增 `any`；无硬编码色值
- [ ] `tsc` / 项目类型检查通过

---

## 9. 测试策略（本版）

- Rust：runner / status porcelain 解析 / path 校验单元测试（能测的优先）
- 前端：关键 Service 错误映射可测；UI 以手动验收为主
- 不强制 E2E（后续再加）

---

## 10. 文档同步（实现时）

实现合并前更新：

- `docs/product/feature-list.md` 相关项 → In Progress / Done
- 若 Command 有偏差，同步 `command.md` / `api/git.md` / `api/project.md`

---

## 11. 决策记录

| 决策 | 选择 |
|------|------|
| 范围档位 | 日常可用（分支 + 变更提交 + 历史） |
| 打开表单 | 仅本地 + 可选别名 |
| 主布局 | 左分支 · 中变更/提交 · 右历史 |
| 左栏分支 | 本地 / 远端分组树；远端可跟踪检出 |
| 中栏变更 | 变更/待提交双区；列表视图；提交到当前分支 |
| Diff | 本版不做 |
| 最近项目 | SQLite 记住 |
| 实现路径 | 契约先行（Command → Service → UI） |
| 仓库路由 | 单页三栏，不拆子路由 |
| 窗口 | macOS Overlay 标题栏与内容顶栏融合 |
