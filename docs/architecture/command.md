# Tauri Command 清单

> **相关文档：** [tauri](tauri.md) · [git](git.md) · [database](database.md) · [api/git](../api/git.md) · [api/project](../api/project.md)

本文是 **Command 契约的唯一真相源**。前端 Service 必须与此对齐；字段变更需同步 API 文档与 CHANGELOG。

通用错误形状：

```ts
interface AppError {
  code:
    | "INVALID_PATH"
    | "NOT_A_REPO"
    | "GIT_FAILED"
    | "GIT_NOT_FOUND"
    | "GIT_TIMEOUT"
    | "GIT_AUTH"
    | "DB_ERROR"
    | "NOT_FOUND"
    | "VALIDATION"
    | "CANCELLED"
    | "INTERNAL";
  message: string;
  details?: string;
}
```

未额外说明时，失败均返回 `AppError`。

---

## 系统

### `git_version`

| | |
|--|--|
| **目的** | 探测本机 Git 是否可用及版本 |
| **输入** | `{ executable?: string }` |
| **输出** | `{ version: string; path: string }` |
| **错误** | `GIT_NOT_FOUND` |

### `app_paths`

| | |
|--|--|
| **目的** | 返回应用数据目录等标准路径 |
| **输入** | `{}` |
| **输出** | `{ appData: string; dbUrl: string }` |
| **错误** | `INTERNAL` |

---

## 项目 / 工作区

### `project_list`

| | |
|--|--|
| **目的** | 列出已登记项目 |
| **输入** | `{ workspaceId?: string }` |
| **输出** | `{ projects: ProjectRow[] }` |
| **错误** | `DB_ERROR` |

### `project_add`

| | |
|--|--|
| **目的** | 登记本地仓库路径 |
| **输入** | `{ path: string; workspaceId?: string; name?: string; description?: string }` |
| **输出** | `{ project: ProjectRow }` |
| **错误** | `INVALID_PATH` `NOT_A_REPO` `DB_ERROR` `VALIDATION` |

### `project_remove`

| | |
|--|--|
| **目的** | 从应用移除登记（不删磁盘仓库） |
| **输入** | `{ id: string }` |
| **输出** | `{ ok: true }` |
| **错误** | `NOT_FOUND` `DB_ERROR` |

### `project_update`

| | |
|--|--|
| **目的** | 更新显示名 / 工作区 / 简介 |
| **输入** | `{ id: string; name?: string; workspaceId?: string | null; description?: string | null }`（`description: null` 清空；省略则不改） |
| **输出** | `{ project: ProjectRow }` |
| **错误** | `NOT_FOUND` `DB_ERROR` `VALIDATION` |

### `project_touch_opened`

| | |
|--|--|
| **目的** | 记录打开，维护 recent |
| **输入** | `{ id: string }` |
| **输出** | `{ ok: true }` |
| **错误** | `NOT_FOUND` `DB_ERROR` |

### `project_pick_directory`

| | |
|--|--|
| **目的** | 系统对话框选择目录并返回路径（不自动入库） |
| **输入** | `{}` |
| **输出** | `{ path: string | null }` |
| **错误** | `CANCELLED`（可映射为 path null）`INTERNAL` |

### `project_profile_snapshot`

| | |
|--|--|
| **目的** | 读取仓库根 README* 与常见清单（`package.json` / `Cargo.toml` / `pyproject.toml` / `go.mod` / `composer.json`）文本快照，供 AI 生成项目简介 |
| **输入** | `{ path: string }` |
| **输出** | `{ folderName: string; files: { name: string; content: string; truncated: boolean }[] }` |
| **错误** | `INVALID_PATH` `NOT_A_REPO` `IO_ERROR` |

### `workspace_list` / `workspace_create` / `workspace_update` / `workspace_delete`

| 命令 | 目的 | 输入 | 输出 | 错误 |
|------|------|------|------|------|
| `workspace_list` | 列出工作区 | `{}` | `{ workspaces: WorkspaceRow[] }` | `DB_ERROR` |
| `workspace_create` | 创建 | `{ name: string }` | `{ workspace: WorkspaceRow }` | `VALIDATION` `DB_ERROR` |
| `workspace_update` | 改名/上级/图标/颜色 | `{ id; name?; parentId?; icon?; color? }` | `{ workspace }` | `NOT_FOUND` `VALIDATION` `DB_ERROR` |
| `workspace_delete` | 删除（项目 workspace_id 置空） | `{ id }` | `{ ok: true }` | `NOT_FOUND` `DB_ERROR` |

### `favorite_set` / `favorite_list`

| 命令 | 目的 | 输入 | 输出 |
|------|------|------|------|
| `favorite_set` | 设置/取消收藏 | `{ projectId: string; favorite: boolean }` | `{ ok: true }` |
| `favorite_list` | 收藏列表 | `{}` | `{ projectIds: string[] }` |

### `recent_list`

| | |
|--|--|
| **目的** | 最近打开 |
| **输入** | `{ limit?: number }` 默认 20 |
| **输出** | `{ items: { projectId: string; openedAt: string }[] }` |

`ProjectRow` / `WorkspaceRow` 字段与 [database.md](database.md) 一致（camelCase 序列化）。

---

## Git：只读

### `fs_list_dir`

| | |
|--|--|
| **目的** | 列出仓库内相对目录一层子项（目录树懒加载） |
| **输入** | `{ path: string; relative?: string }`（`relative` 空或省略表示仓库根） |
| **输出** | `{ entries: { name: string; path: string; isDir: boolean }[] }` |
| **错误** | `INVALID_PATH` `NOT_A_REPO` `VALIDATION` |
| **安全** | 路径须相对仓库根；canonicalize 后必须落在仓库根下；跳过 `.git` |

### `fs_file_size`

| | |
|--|--|
| **目的** | 读取仓库内相对文件大小（变更列表悬停展示） |
| **输入** | `{ path: string; filePath: string }` |
| **输出** | `{ size: number \| null }`（字节；无法取得时为 null） |
| **错误** | `INVALID_PATH` `NOT_A_REPO` `VALIDATION` |
| **说明** | 优先工作区文件；已删除则回退 `HEAD:path` / `:path` blob |

### `git_status`

| | |
|--|--|
| **目的** | 工作区与暂存区状态 |
| **输入** | `{ path: string }` |
| **输出** | `GitStatusResult`（见下） |
| **错误** | `INVALID_PATH` `NOT_A_REPO` `GIT_FAILED` |
| **说明** | `status --porcelain=v2 --branch --untracked-files=all`（展开未跟踪目录内文件） |

```ts
interface GitStatusResult {
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  detached: boolean;
  entries: GitStatusEntry[];
}

interface GitStatusEntry {
  path: string;
  indexStatus: string;   // porcelain 语义
  worktreeStatus: string;
  renamedFrom?: string;
  /** 工作区文件 mtime（Unix 毫秒）；已删除或不存在时缺省 */
  modifiedAt?: number;
}
```

### `git_identity`

| | |
|--|--|
| **目的** | 读取当前仓库生效的提交身份（`user.name` / `user.email`，含全局配置） |
| **输入** | `{ path: string }` |
| **输出** | `{ name: string \| null; email: string \| null }` |
| **错误** | `INVALID_PATH` `NOT_A_REPO` `GIT_FAILED` |

未配置时对应字段为 `null`，不视为错误。

### `git_branches`

| | |
|--|--|
| **目的** | 本地/远程分支列表 |
| **输入** | `{ path: string; includeRemote?: boolean }` |
| **输出** | `{ branches: GitBranch[] }` |
| **错误** | 同 status 类 |

```ts
interface GitBranch {
  name: string;
  isCurrent: boolean;
  /** 仓库默认分支（通常对应 origin/HEAD） */
  isDefault: boolean;
  isRemote: boolean;
  upstream?: string;
  /** tip 提交短 hash；无则空串 */
  tipShortId: string;
  /** tip 提交作者时间（ISO-8601）；无则空串 */
  tipAuthoredAt: string;
  /** tip 提交作者名；无则空串 */
  tipAuthorName: string;
  ahead?: number;
  behind?: number;
}
```

### `git_log`

| | |
|--|--|
| **目的** | 提交历史（分页） |
| **输入** | `{ path: string; skip?: number; limit?: number; ref?: string; all?: boolean; order?: "default" \| "topo" \| "date"; filePath?: string; authors?: string[]; reverse?: boolean }` |
| **输出** | `{ commits: GitCommitSummary[]; hasMore: boolean }`（`GitCommitSummary` 含 `id/shortId/authorName/authorEmail/authoredAt/subject/parentIds/refs/coAuthors`） |
| **错误** | 同 status 类；`VALIDATION`（limit 过大 / `all` 与 `ref` 同时指定 / 非法 order / 非法 authors） |

默认 `limit=50`，硬上限建议 200。`all=true` 时等价 `git log --all`（所有引用可达历史，与 UI「所有分支」对齐）；`ref` 指定单分支/标签；二者互斥。未传 `all` 且无 `ref` 时仍为当前 HEAD。`order`：`topo` → `--topo-order`，`date` → `--date-order`，省略/`default` 为 git 默认序。`authors` 为可选作者匹配模式（多条对应多个 `--author`，OR；最多 16 条；调用方转义正则特殊字符）。`reverse=true` 时加 `--reverse`（从旧到新）。`parentIds` 来自 `%P`，用于历史图谱的分叉与合并连线。`refs` 来自 `git log --decorate` 的 `%D`（远端分支展示为 `origin&name`）。`coAuthors` 来自 `Co-authored-by` trailer（`%(trailers:key=Co-authored-by)`）。

**消费方补充：**「简历技能」只在用户主动声明 Git 作者名或提交邮箱后，通过前端循环调用只读 Command 汇总画像：`git_log`（将声明值转义后作为 `authors` 分页，单次 ≤200、累计约 500，**入库前**时间分桶至约 48；并用 `reverse+limit=1` 取作者最早参与时间）+ `git_ls_tree`（定位 `package.json` / README；路径硬顶）+ `git_read_worktree_file`（解析依赖主技术栈与 README 摘录）+ `git_show` / `git_commit_file_diff`（**按用户点选的单仓**拉取 diff 摘录，避免全量并发）。技能不得读取当前/全局 Git 身份或设置中的 Git 账号；身份缺失时不执行作者扫描。通用多仓 Agent 使用不带 `authors` 的仓库整体画像，与简历画像隔离。成稿须含 **项目周期**（匹配作者首提交→末次提交）。**禁止**对简历技能路径开放任何写操作；**不新增**专用 `git_resume_*` Command。

「技能创建」复用通用 Agent 已有的只读仓库画像；单仓额外读取限长 HEAD 文件树，帮助用户按当前项目约定设计 Skill。该技能只在对话中生成 `SKILL.md`、`agents/openai.yaml` 与必要资源的完整文本，**不新增**文件写入、安装、脚本执行或专用 `skill_*` Command。通用 Agent、简历、技能创建分别组装 Prompt，不跨模式注入工作流或个人作者上下文。

### `git_blame`

| | |
|--|--|
| **目的** | 文件行追溯（`git blame --line-porcelain`），供差异预览「行追溯」装饰 |
| **输入** | `{ path: string; filePath: string; rev?: string }` |
| **输出** | `{ lines: GitBlameLine[] }`（`line` 为 1-based；含 `commitId/shortId/authorName/authoredAt`） |
| **错误** | `INVALID_PATH` `NOT_A_REPO` `VALIDATION` `GIT_FAILED` |

`rev` 省略时对工作区文件追溯；传入时对指定 revision 的文件版本追溯。`filePath` 须为仓库相对路径。

### `git_show`

| | |
|--|--|
| **目的** | 单提交元数据 + 相对各 parent 的改动文件（name-status） |
| **输入** | `{ path: string; rev: string }` |
| **输出** | `{ commit: GitCommitDetail }`（含 `parents` / `parentShortIds` / `diffs[]`；每个 diff 含 `truncated`） |
| **错误** | `INVALID_PATH` `NOT_A_REPO` `VALIDATION` `GIT_FAILED` |
| **说明** | 单 parent 改动文件硬顶约 5000，超出则该 diff `truncated: true` |

### `git_commit_message`

| | |
|--|--|
| **目的** | 读取单提交完整文案（标题与正文），用于提交信息历史的 Tooltip 与回填 |
| **输入** | `{ path: string; rev: string }` |
| **输出** | `{ message: string }` |
| **错误** | `INVALID_PATH` `NOT_A_REPO` `VALIDATION` `GIT_FAILED` |

使用 `git log -1 --no-patch --format=%B <rev>`；不读取 diff，避免提交信息回填受变更文件解析影响。

### `git_ls_tree`

| | |
|--|--|
| **目的** | 列出某提交树下全部文件路径（历史详情「显示所有文件」） |
| **输入** | `{ path: string; rev: string }` |
| **输出** | `{ paths: string[]; truncated: boolean }` |
| **错误** | `INVALID_PATH` `NOT_A_REPO` `VALIDATION` `GIT_FAILED` |
| **说明** | `git ls-tree -r --name-only -z <rev>`；路径硬顶约 20000，超出则 `truncated: true` |

### `git_commit_containing_branches`

| | |
|--|--|
| **目的** | 列出包含该提交的本地 / 远端分支（历史详情「显示分支」） |
| **输入** | `{ path: string; rev: string }` |
| **输出** | `{ branches: string[] }`（若 `HEAD` 指向该提交则含 `HEAD`） |
| **错误** | `INVALID_PATH` `NOT_A_REPO` `VALIDATION` `GIT_FAILED` |
| **说明** | `git branch -a --contains <rev> --format=%(refname:short)` |

### `git_commit_change_size`

| | |
|--|--|
| **目的** | 改动文件数与 blob 总大小（历史详情「显示大小」） |
| **输入** | `{ path: string; rev: string }` |
| **输出** | `{ fileCount: number; totalBytes: number }` |
| **错误** | `INVALID_PATH` `NOT_A_REPO` `VALIDATION` `GIT_FAILED` |
| **说明** | 改动文件去重；删除不计大小；其余路径用 `ls-tree -l` 汇总 |

### `git_diff`

| | |
|--|--|
| **目的** | 工作区 / 暂存区单文件 Diff（含 Monaco 两侧文本） |
| **输入** | `{ path: string; filePath: string; staged?: boolean; maxBytes?: number; encoding?: string }` |
| **输出** | `{ oldText; newText; patch; truncated: boolean; binary: boolean }` |
| **错误** | 同 status；超限时 `truncated=true` 而非失败 |

- `staged=false`（默认）：对比 `HEAD:file` 与工作区文件  
- `staged=true`：对比 `HEAD:file` 与索引 `:file`  
- `maxBytes` 默认约 1MB；二进制不返回文本内容（`binary=true`）
- `encoding`：文本解码编码 id（默认 `utf-8`；见前端 `TEXT_ENCODING_OPTIONS`），由 `encoding_rs` 解码

### `git_file_media`

| | |
|--|--|
| **目的** | 读取单侧文件媒体内容（图片等），供 Diff/File 非文本预览 |
| **输入** | `{ path: string; filePath: string; source: string; maxBytes?: number }` |
| **输出** | `{ present: boolean; kind: "image" \| "unsupported"; mime?; base64?; size: number; truncated: boolean }` |
| **错误** | `INVALID_PATH` `NOT_A_REPO` `VALIDATION` `GIT_FAILED` `INTERNAL` |

- `source`：`worktree`（工作区文件）/ `index`（暂存 blob `:`）/ 合法 Git rev（如 `HEAD`、commit）
- 仅识别常见图片扩展名时返回 `kind=image` 与 base64；其它二进制只回 `size`，不传内容
- `maxBytes` 默认约 5MB，上限约 8MB；超限 `truncated=true` 并截断字节后再编码

### `git_staged_diff`

| | |
|--|--|
| **目的** | 读取限长的暂存区 Diff，供 AI 生成提交文案 |
| **输入** | `{ path: string; maxBytes?: number }` |
| **输出** | `{ patch: string; truncated: boolean }` |
| **错误** | `INVALID_PATH` `NOT_A_REPO` `GIT_FAILED` |
| **说明** | 执行 `git diff --cached --no-ext-diff --unified=3`；**流式读取** stdout，最多约 64 KiB（超限截断并结束 git，避免大暂存 diff 撑爆内存导致闪退）；前端发送给 DeepSeek 前再做密钥掩码。 |

### `git_commit_file_diff`

| | |
|--|--|
| **目的** | 历史提交内单文件相对 parent 的前后对比（含 Monaco 两侧文本），供历史详情点击改动文件后展示 |
| **输入** | `{ path: string; filePath: string; commitRev: string; parentRev?: string; maxBytes?: number; encoding?: string }` |
| **输出** | `{ oldText; newText; patch; truncated: boolean; binary: boolean }` |
| **错误** | 同 status；超限时 `truncated=true` 而非失败 |

- `parentRev` 缺省或空字符串表示根提交（无父，相对空树）
- old 侧读 `parentRev:filePath`，new 侧读 `commitRev:filePath`；文件新增 / 删除时对应侧因 blob 不存在自然为空文本，无需按状态特判
- 文本 patch：有 parent 用 `git diff parentRev commitRev -- filePath`；根提交用 `git diff-tree -p --no-commit-id --root commitRev -- filePath`
- 其余行为（`maxBytes` / `encoding` / 二进制判定）与 `git_diff` 一致

### `git_remotes`

| | |
|--|--|
| **目的** | 远程列表 |
| **输入** | `{ path: string }` |
| **输出** | `{ remotes: { name: string; fetchUrl: string; pushUrl: string }[] }` |

### `git_tags`

| | |
|--|--|
| **目的** | 标签列表 |
| **输入** | `{ path: string }` |
| **输出** | `{ tags: { name: string; target: string; message?: string }[] }` |

### `git_stash_list`

| | |
|--|--|
| **目的** | Stash 列表 |
| **输入** | `{ path: string }` |
| **输出** | `{ entries: { index: number; message: string }[] }` |

### `git_graph_commits`

| | |
|--|--|
| **目的** | 供提交图使用的精简拓扑数据 |
| **输入** | `{ path: string; limit?: number }` |
| **输出** | `{ nodes: GraphNode[]; edges: GraphEdge[] }` |

具体 `GraphNode` 在实现时与前端 Graph 库对齐，变更记入 CHANGELOG。

---

## Git：写操作

### `git_stage` / `git_unstage`

| 命令 | 目的 | 输入 | 输出 |
|------|------|------|------|
| `git_stage` | 暂存路径 | `{ path; paths: string[] }` | `{ ok: true }` |
| `git_unstage` | 取消暂存 | `{ path; paths: string[] }` | `{ ok: true }` |

路径必须相对仓库根；拒绝 `..` 与绝对路径逃逸 → `VALIDATION`。

### `git_stage_all` / `git_unstage_all`

| 命令 | 输入 | 输出 |
|------|------|------|
| `git_stage_all` | `{ path }` | `{ ok: true }` |
| `git_unstage_all` | `{ path }` | `{ ok: true }` |

### `git_discard`

| | |
|--|--|
| **目的** | 丢弃工作区未提交修改（危险） |
| **输入** | `{ path: string; paths: string[] }` |
| **输出** | `{ ok: true }` |
| **错误** | `VALIDATION`；UI 必须二次确认 |

### `git_commit`

| | |
|--|--|
| **目的** | 创建提交（ugit 式：按路径列表重建 index 后 commit；合并/变基中则直接 commit） |
| **输入** | `{ path: string; message: string; paths: string[]; removePaths?: string[]; amend?: boolean }` |
| **输出** | `{ commitId: string }` |
| **错误** | `VALIDATION`（空 message；非合并态下空 paths）；`GIT_FAILED`（hooks 失败等） |

**普通提交**执行顺序：

1. `git reset -- .` — 清空暂存区
2. `git update-index --add --remove --replace -z --stdin` — 写入 `paths`
3. 若有 `removePaths`：`git update-index --force-remove ... -z --stdin`
4. `git commit -F -`（stdin 为 message；可选 `--amend`）

**合并 / 变基 / cherry-pick 进行中**（存在 `MERGE_HEAD` / `CHERRY_PICK_HEAD` / `rebase-*`）：

- **跳过** reset / update-index，保留 Git 已维护的 index
- 直接 `git commit -F -`，以正确生成 merge commit 并清除进行中状态

默认不传 `--no-verify`。

### `git_branch_create` / `git_branch_delete` / `git_checkout`

| 命令 | 输入 | 输出 |
|------|------|------|
| `git_branch_create` | `{ path; name; checkout?: boolean; startPoint?: string }` | `{ ok: true }` |
| `git_branch_delete` | `{ path; name; force?: boolean; deleteRemote?: boolean; remote?: string }` | `{ ok: true }` |
| `git_branch_rename` | `{ path; oldName: string; newName: string }` | `{ ok: true }` |
| `git_checkout` | `{ path; ref: string }` | `{ ok: true }` |

`git_branch_create` / `git_checkout` / `git_branch_delete` / `git_branch_rename` 走阻塞线程池并写入操作日志。

创建分支（`checkout: true`）命令序列：
1. `git branch --no-track -- <name> [<startPoint>]`
2. `git checkout --progress <name> --`
3. `git submodule update --init --recursive`

无 upstream 时工具栏显示「发布分支」，执行 `git push --set-upstream --progress origin <branch>`（oplog label：`publish`）。

### `git_fetch` / `git_pull` / `git_push`

| 命令 | 输入 | 输出 |
|------|------|------|
| `git_fetch` | `{ path; remote?: string }` | `{ ok: true; remote: string; elapsedMs: number }` |
| `git_pull` | `{ path; remote?: string; branch?: string; rebase?: boolean }` | `{ ok: true; conflict: false; remote; elapsedMs }` 或 `{ ok: false; conflict: true; remote; elapsedMs }` |
| `git_push` | `{ path; remote?: string; branch?: string; setUpstream?: boolean; force?: boolean }` | `{ ok: true; remote: string; elapsedMs: number }` |
| `git_undo_commit` | `{ path; target?: string }` | `{ ok: true; target: string; elapsedMs: number }` |

`git_fetch` / `git_pull` / `git_push` / `git_undo_commit` 在阻塞线程池异步执行；fetch/pull 默认 120s、push 180s 超时；超时返回 `GIT_TIMEOUT`。

`git_undo_commit`：`git reset --mixed` 到 `target`（省略则为 `HEAD~1`）。仅用于撤销本地未推送提交；变更回到工作区，不丢文件。首提交无法撤销时返回 `VALIDATION`。  
`git_pull` 对齐 ugit：`pull --recurse-submodules --progress`，并带 `protocol.version=2`；**不**清空 credential.helper。成功后前端刷新 status / branches / log。若产生未合并冲突，返回 `{ ok: false, conflict: true }`（不抛错），并刷新 status 进入冲突解决 UI。

`git_push` 对齐 ugit：`push --progress` + `protocol.version=2`；有分支时使用 `origin main:main` 式 refspec；**不**清空 credential.helper。成功后前端刷新 status / branches / log。

### `system_app_info` / `system_runtime_stats` / `system_disk_space` / `system_disk_volumes` / `system_list_fonts`

| 命令 | 输入 | 输出 |
|------|------|------|
| `system_app_info` | — | `{ name; version; arch; os }` |
| `system_runtime_stats` | — | `{ pid; rssBytes; cpuPercent; uptimeMs }` |
| `system_list_fonts` | — | `string[]`（本机字体族，已排序去重） |
| `system_disk_space` | `{ path?: string }` | `{ path; totalBytes; availableBytes }` |
| `system_disk_volumes` | — | `{ path; totalBytes; availableBytes }[]` |
| `system_open_terminal` | `{ path; preference?; customPath? }` | `{ ok: true }` |
| `system_reveal_in_file_manager` | `{ path }` | `{ ok: true }` |
| `system_open_in_editor` | `{ path; preference?; customPath? }` | `{ ok: true }` |

`system_list_fonts` 经 `font-kit` 枚举系统字体族，供设置中客户端 / 编辑器字体下拉使用。
`system_runtime_stats` 供设置「关于」挂载期间约 1s 轮询；`cpuPercent` 在 Windows 上可能为 `0`（UI 显示为不可用）。
`system_disk_space` 查路径所在卷（状态栏摘要）；`system_disk_volumes` 枚举可见卷：Windows 为盘符；Unix 过滤伪挂载，macOS 合并 APFS `/` 与 Data、忽略 `/Volumes` 下小镜像。仅多卷时 hover 用列表，单卷仍为紧凑卡。状态栏摘要仍只显示当前仓库所在卷。

`path` 须为已存在目录。终端 / 访达 / 编辑器均用参数数组调用系统命令，不拼 shell。  
`preference`：编辑器为 `auto` / `cursor` / `vscode` / `custom`；终端按平台为 `auto` 与具体终端 id（如 `wt`、`terminal`、`gnome-terminal`）或 `custom`。`customPath` 仅在 `custom` 时使用。

### `git_identity_global`

| 命令 | 输入 | 输出 |
|------|------|------|
| `git_identity_global` | — | `{ name; email }` |

`force` 默认 false；UI 对 force 二次确认。凭据失败 → `GIT_AUTH` / `GIT_FAILED`。

### `git_merge` / `git_rebase` / `git_cherry_pick`

| 命令 | 输入 | 输出 |
|------|------|------|
| `git_merge` | `{ path; ref: string; mode?: "default" \| "noFf" \| "squash" \| "resolve" \| "ort" \| "noCommit"; autostash?: boolean }` | `{ ok: true; conflict: false }` 或 `{ ok: false; conflict: true }` |
| `git_rebase` | `{ path; upstream: string }` | 同上（尚未实现） |
| `git_cherry_pick` | `{ path; revs: string[] }` | 同上（尚未实现） |

冲突时不要伪造成功；返回明确冲突状态供 UI。

`mode` 映射为 Git 默认行为、`--no-ff`、`--squash`、`-s resolve`、`-s ort` 或 `--no-commit`。`autostash=true` 映射为 `--autostash`，但压缩合并必须忽略该选项。冲突时保留 Git 工作区状态，不自动执行 `git merge --abort`。前端提供冲突预览与逐块/整文件解决。

### `git_repo_state` / `git_conflict_*` / `git_read_worktree_file` / `git_write_worktree_file`

| 命令 | 输入 | 输出 |
|------|------|------|
| `git_repo_state` | `{ path }` | `{ kind; merging; oursLabel; theirsLabel; conflictCount; conflictPaths; mergeMessage?; oursMeta?; theirsMeta? }` |
| `git_conflict_take` | `{ path; filePath; side: "ours" \| "theirs" }` | `{ ok: true }` |
| `git_conflict_mark_resolved` | `{ path; filePath }` | `{ ok: true }` |
| `git_read_worktree_file` | `{ path; filePath; encoding?; maxBytes? }` | `{ text; binary; truncated }` |
| `git_write_worktree_file` | `{ path; filePath; content; stage?; encoding? }` | `{ ok: true }` |

路径须相对仓库根且不得含 `..`。`git_conflict_take` 执行 `checkout --ours/--theirs` 后 `git add`。`git_write_worktree_file` 在 `stage=true` 时写回后 `git add`。

### `git_tag_create` / `git_tag_delete`

| 命令 | 输入 | 输出 |
|------|------|------|
| `git_tag_create` | `{ path; name; message?: string; ref?: string; push?: boolean; remote?: string }` | `{ ok: true; pushed: boolean; pushError?: string }` |
| `git_tag_delete` | `{ path; name }` | `{ ok: true }` |

`git_tag_create` 的 `message` 非空时创建附注标签，否则创建轻量标签；缺省 `ref` 时以 `HEAD` 为基准。`push=true` 时必须传入已配置的 `remote`；本地创建成功但推送失败时仍返回 `ok: true`、`pushed: false` 与安全错误文案，调用方必须刷新标签列表并告知用户本地标签已创建。

### `git_stash_push` / `git_stash_apply` / `git_stash_drop` / `git_stash_pop`

| 命令 | 输入 | 输出 |
|------|------|------|
| `git_stash_push` | `{ path; message?: string; includeUntracked?: boolean }` | `{ ok: true }` |
| `git_stash_apply` | `{ path; index?: number }` | `{ ok: true }` |
| `git_stash_pop` | `{ path; index?: number }` | `{ ok: true }` |
| `git_stash_drop` | `{ path; index: number }` | `{ ok: true }` |

### `git_worktree_list` / `git_worktree_add` / `git_worktree_remove`

| 命令 | 输入 | 输出 |
|------|------|------|
| `git_worktree_list` | `{ path }` | `{ worktrees: { path; head; branch? }[] }` |
| `git_worktree_add` | `{ path; targetPath; branch }` | `{ ok: true }` |
| `git_worktree_remove` | `{ path; targetPath; force?: boolean }` | `{ ok: true }` |

---

## 设置

### `settings_get` / `settings_set` / `settings_get_all`

| 命令 | 输入 | 输出 |
|------|------|------|
| `settings_get` | `{ key: string }` | `{ value: unknown \| null }`（JSON 解析后） |
| `settings_set` | `{ key: string; value: unknown }` | `{ ok: true }` |
| `settings_get_all` | `{}` | `{ settings: Record<string, unknown> }` |

错误：`DB_ERROR` `VALIDATION`。

---

## 通知（应用层封装）

系统通知主要走插件 API；若需统一权限探测：

### `notification_permission` / `notification_send`

| 命令 | 目的 | 输入 | 输出 |
|------|------|------|------|
| `notification_permission` | 查询/请求权限 | `{}` | `{ granted: boolean }` |
| `notification_send` | 发送通知 | `{ title: string; body?: string }` | `{ ok: true }` |

也可由前端直接调插件；若直接调用，须仍经 `NotificationService` 门面，本表作可选 Rust 封装。

---

## SSH 密钥

前端经 `src/services/ssh/ssh.keys.ts`；登记元数据进 Tauri Store（`ssh-keys.json`），**不**存私钥内容与口令。

### `ssh_key_generate`

| | |
|--|--|
| **目的** | 本机 `ssh-keygen` 生成 ed25519 到 `~/.ssh` |
| **输入** | `{ input: { name: string; passphrase: string } }` |
| **输出** | `{ name; publicKey; privateKeyPath; hasPassphrase }` |
| **错误** | `VALIDATION` `IO` `INTERNAL` |
| **约束** | 参数数组调用；口令仅作 `-N` 入参，不写日志 |

### `ssh_key_read_public`

| | |
|--|--|
| **目的** | 读取 `.pub` 或私钥旁同名 `.pub` |
| **输入** | `{ input: { path: string } }` |
| **输出** | `{ name; publicKey; privateKeyPath; hasPassphrase }` |
| **错误** | `VALIDATION` `INVALID_PATH` `NOT_FOUND` `IO` |

### `ssh_key_change_passphrase`

| | |
|--|--|
| **目的** | 本机 `ssh-keygen -p` 修改私钥口令 |
| **输入** | `{ input: { path: string; oldPassphrase: string; newPassphrase: string } }` |
| **输出** | `{ hasPassphrase }` |
| **错误** | `VALIDATION` `INVALID_PATH` `INTERNAL` |
| **约束** | 仅允许 `~/.ssh` 下私钥；口令仅作 `-P`/`-N` 入参，不写日志、不落盘 |

### `ssh_key_delete`

| | |
|--|--|
| **目的** | 删除 `~/.ssh` 下私钥及其旁路 `.pub` |
| **输入** | `{ input: { path: string } }` |
| **输出** | `{ ok: true }` |
| **错误** | `VALIDATION` `INVALID_PATH` `IO` |
| **约束** | 仅允许 `~/.ssh` 内普通文件；文件已不存在则跳过；前端仅对 `origin=generated`（JLGit 新增）调用，导入项只取消登记 |

---

## 应用数据

### `app_data_paths` / `app_data_reveal` / `app_data_clear` / `app_data_export` / `app_data_import`

设置「数据」分类：路径、清理、完整备份。前端经 `src/services/data/data.service.ts`。

| 命令 | 输入 | 输出 |
|------|------|------|
| `app_data_paths` | `{}` | `{ appDataDir, databasePath }` |
| `app_data_reveal` | `{ input: { target: "dir" \| "database" } }` | `{ ok: true }` |
| `app_data_clear` | `{ input: { module } }` | `{ ok: true }` |
| `app_data_export` | `{ input: { destPath, localStorage } }` | `{ ok: true }` |
| `app_data_import` | `{ input: { sourcePath } }` | `{ ok, localStorage, requiresRestart }` |

`module`：`agent_chats` · `multi_agent_chats` · `ai_secrets` · `git_accounts` · `multi_agent_identity` · `ui_prefs` · `open_tabs` · `all_app_data`（不含 projects/workspaces）· `factory_reset`（出厂重置：含清空已登记仓库/工作区、API Key、Git 账号、SSH 登记列表、插件偏好；不含磁盘仓库与 `~/.ssh`）。清理 Store 时**删除**对应 json，并由前端先清空 LazyStore 再丢弃单例，避免内存缓存写回。导入 DB 写入 `jlgit.db.pending`，下次启动替换。

## AI

### `chat_list_conversations` / `chat_upsert_conversation` / `chat_delete_conversation` / `chat_reorder_conversations`

多轮对话（单仓 / 多仓鲸灵）持久化。前端经 `src/services/ai/ai.chatPersist.ts` 调用。

| 命令 | 输入 | 输出 |
|------|------|------|
| `chat_list_conversations` | `{ scope; projectId? }` | `{ conversations: ChatConversationRow[] }`（含 messages） |
| `chat_upsert_conversation` | `{ input: { scope; projectId?; conversation } }` | `{ conversation }` |
| `chat_delete_conversation` | `{ id }` | `{ ok: true }` |
| `chat_reorder_conversations` | `{ input: { scope; projectId?; orderedIds } }` | `{ ok: true }` |

约束：`scope=agent` 时 `projectId` 必填；`scope=agent_global` 时 `projectId` 必须为空。删除 Git 项目时由 FK CASCADE 清理单仓鲸灵会话。

### `ai_history_list` / `ai_history_add` / `ai_history_clear`（预留）

| 命令 | 输入 | 输出 |
|------|------|------|
| `ai_history_list` | `{ projectId?; limit? }` | `{ items: AiHistoryRow[] }` |
| `ai_history_add` | `{ projectId?; kind; inputSummary; output; model? }` | `{ item }` |
| `ai_history_clear` | `{ projectId? }` | `{ ok: true }` |

模型推理可在前端 SDK 或后续 `ai_complete` Command 中代理；密钥不落 SQLite。见 [ai](../product/ai.md)。

---

## 实现状态约定

| 标记（在 feature-list） | 含义 |
|-------------------------|------|
| Planned | 契约已定，代码未实现 |
| In Progress | 部分实现 |
| Done | 前后端对齐并可用 |

当前仓库脚手架仅含示例 `greet`；上表为目标契约，实现时按 roadmap 分批替换 `greet`。

---

## 命名规则

- `snake_case`
- 域前缀：`project_` `git_` `settings_` `workspace_` `favorite_` `recent_` `ai_` `chat_` `app_data_` `notification_`
- 动词在后：`git_branch_create` 而非 `create_git_branch`（与现有表风格一致，便于按前缀搜索）
