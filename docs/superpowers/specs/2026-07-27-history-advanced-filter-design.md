# 历史高级筛选设计

> 状态：已实现  
> 日期：2026-07-27  
> 范围：历史页搜索框旁「高级筛选」从占位改为可用；Git 级检索 + 工具栏前端过滤叠加。

## 1. 背景与目标

历史工具栏已有：

- 分支范围（当前 / 全部 / 指定分支）
- 搜索框（对**已加载**提交做前端匹配：说明 / SHA / 作者名 / refs）
- 用户下拉、日期预设（7d / 30d / 90d，前端过滤）
- 滑块按钮目前仅 toast「高级筛选即将支持」

目标：实现真正的高级筛选，使关键词 / 路径 / 自定义日期 / 作者等可走 `git log`，覆盖尚未加载进列表的历史；同时**保留**工具栏现有前端过滤习惯。

非目标（首期不做）：

- 把工具栏搜索/用户/日期整并进面板（用户明确选「工具栏保留现状」）
- 正则模式切换、多路径、committer 与 author 分列
- 持久化高级条件到 SQLite / 跨仓共享

## 2. 决策摘要

| 项 | 决策 |
|----|------|
| 交互模型 | 方案 A：高级条件走 Git；工具栏搜索/用户/日期继续前端叠加 |
| 入口 | 搜索框右侧 `SlidersHorizontal` → Popover |
| 首期字段 | grep、路径、自定义起止日期、Git `--author`、是否显示合并提交 |
| 合并提交 | 与现有「显示合并提交」偏好同步，避免两套开关 |

## 3. 产品行为

### 3.1 打开与应用

1. 点击滑块打开 Popover「高级筛选」。
2. 表单为 draft；**应用**后写入 applied，并触发按当前分支范围 + 高级条件重新 `git_log`（从 skip=0）。
3. **重置**：清空 grep / 路径 / 日期 / Git 作者的 draft 与 applied，重拉无这些条件的 log；合并开关键复打开 Popover 时的 `showMergeCommits` 偏好快照（见 §3.3），不强制改成产品默认值。
4. 关闭 Popover 不自动应用（避免误触改结果）；再次打开时 draft 与 applied 对齐。

### 3.2 与工具栏关系

| 控件 | 行为 |
|------|------|
| 分支范围 | 仍走 store `logRef`；变更后按**当前已应用**高级条件重查 |
| 搜索框 | 仍对当前列表前端过滤（说明 / SHA 等） |
| 用户 / 日期预设 | 仍前端过滤；与高级「Git 作者 / 自定义日期」可同时生效（AND） |
| 高级滑块 | 有任一已应用高级条件时视觉高亮（如 `text-primary` / 小圆点） |

文案需区分：

- 工具栏「用户」：在已加载结果中筛选作者名  
- 高级「Git 作者」：`git log --author`，可匹配未加载提交  

### 3.3 合并提交

- 面板内 Switch：「显示合并提交」。
- 与现有 history viewPrefs `showMergeCommits` **双向同步**：
  - 应用高级筛选时写入偏好；
  - 偏好在别处被改时，下次打开面板 draft 跟随。
- Git 侧：`showMergeCommits === false` 时传 `noMerges: true`（`--no-merges`）。

### 3.4 切换仓库 / 分支

- 切换仓库：清空高级 draft/applied（仓不同，路径/作者无意义）。
- 切换分支范围：保留已应用高级条件，按新范围重查。

## 4. UI

- 组件：`HistoryAdvancedFilterPopover`（业务层，组合 shadcn `Popover` / `Field` / `Input` / `Switch` / `Button`；日期用 `common/DatePicker`，底层为官方 `Calendar`）。
- 布局：纵向表单项 + 底栏「重置 | 应用」。
- 字段：
  1. 提交说明关键字  
  2. 文件路径（仓库相对路径，placeholder：请输入文件路径）  
  3. 开始日期 / 结束日期（本地日期即可，提交时转为 git 可解析字符串）  
  4. Git 作者（自由文本，应用前做正则特殊字符转义，与简历技能一致）  
  5. 显示合并提交（Switch）
- 校验：`until` 早于 `since` 时禁用「应用」并内联错误；路径非法字符前端粗检，最终以后端 `validate_repo_relative_paths` 为准。
- i18n：`repo.historyAdvanced*` 键；去掉对「即将支持」toast 的依赖。

## 5. Command / 类型

### 5.1 `GitLogOptions` 扩展

```ts
grep?: string;
since?: string;
until?: string;
noMerges?: boolean;
// 已有：path?, authors?, ref?, all?, order?, reverse?, skip?, limit?
```

### 5.2 Rust `git_log`

在现有 `log.rs` 参数上增加可选：

| 参数 | Git | 校验 |
|------|-----|------|
| `grep` | `--grep=<pat>` | 非空；长度上限（建议 256）；**禁止** shell；作为独立 argv |
| `since` | `--since=<date>` | 非空；长度上限；无换行 |
| `until` | `--until=<date>` | 同上 |
| `no_merges` | `--no-merges` | bool |

`path` / `authors` 已存在，保持不变。`--grep` / `--since` / `--until` / `--author` 须在 revision / `--` 路径分隔之前按 git 惯例排列。

更新文档：`docs/architecture/command.md`、`docs/api/git.md`。

### 5.3 前端接线

- `git.log.ts` / `buildHistoryLogOptions`：接受 advanced applied 片段。
- `useRepoStore`：会话内保存 `historyAdvanced`（或等价字段）；`loadLog` / `loadMoreLog` / `selectLogRef` 带上条件；`loadMore` 延续同一筛选。
- `HistoryList`：去掉 `handleSoon`；接 Popover；应用/重置调 store。

## 6. 状态形状（建议）

```ts
interface HistoryAdvancedFilters {
  grep: string;
  path: string;
  since: string | null; // ISO date YYYY-MM-DD 或空
  until: string | null;
  author: string;       // 单模式，转义后作为 authors: [pattern]
  showMergeCommits: boolean;
}
```

空串 / null 表示未设置，不传入 Command。

## 7. 错误与空态

- Git / 校验失败：toast（`toUserMessage`），不清空已加载列表除非明确重置。
- 应用后 0 条：沿用历史空列表文案；可提示「尝试放宽高级筛选」。
- 推送/提交等写操作不受影响。

## 8. 测试要点

- Rust：`grep` / `since` / `until` / `no_merges` 参数拼装与非法输入拒绝。
- 前端：应用后 `getLog` 入参含对应字段；重置后字段消失；工具栏 query 仍过滤结果；分支切换保留 advanced；切仓清空。
- 冒烟：大仓路径筛选、grep、自定义日期、与工具栏日期叠加。

## 9. 实现分期（建议）

1. Command + Service 类型与 Rust  
2. Store + `buildHistoryLogOptions`  
3. Popover UI + i18n + 去掉 coming soon  
4. 文档与测试  

## 10. 开放问题（已决议）

| 问题 | 决议 |
|------|------|
| 面板 vs 工具栏 | 工具栏保留前端过滤；面板走 Git |
| 字段范围 | grep、路径、自定义日期、Git 作者、合并提交全做 |
| 合并开关 | 与 viewPrefs 同步 |
