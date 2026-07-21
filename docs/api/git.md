# GitService API

> **相关文档：** [command](../architecture/command.md) · [git](../architecture/git.md) · [architecture/overview](../architecture/overview.md)

Git 域前端门面。文件按能力拆分：`git.status.ts`、`git.branch.ts`、`git.commit.ts`、`git.diff.ts`、`git.remote.ts`、`git.stash.ts`、`git.tag.ts`、`git.worktree.ts`，由 `services/git/index.ts` 聚合导出。

---

## 通用

每个方法的第一个语义参数均为仓库工作树路径 `repoPath: string`（来自 `Project.path`）。

错误：映射 `AppError`；UI 侧统一 `toUserMessage`。

---

## 状态与历史

### `listDir(repoPath: string, relative?: string): Promise<FsListResult>`

- **Command：** `fs_list_dir`
- **说明：** 列出相对目录一层子项；目录树懒加载用

### `getFileSize(repoPath: string, filePath: string): Promise<FsFileSizeResult>`

- **Command：** `fs_file_size`
- **说明：** 读取相对文件大小（变更列表悬停展示）；工作区优先，已删回退 HEAD / index

### `getStatus(repoPath: string): Promise<GitStatusResult>`

- **Command：** `git_status`

### `getIdentity(repoPath: string): Promise<GitIdentity>`

- **Command：** `git_identity`
- **说明：** 返回生效的 `user.name` / `user.email`；未配置时字段为 `null`

### `getLog(repoPath, options?: { skip?; limit?; ref?; all?; order?; filePath? }): Promise<{ commits; hasMore }>`

### `getBlame(repoPath, filePath, rev?): Promise<GitBlameResult>`
行追溯；`rev` 省略则 blame 工作区文件。

- **Command：** `git_log`
- **说明：** 每条 `GitCommitSummary` 含 `authorEmail`、`parentIds`（用于历史图谱）与 `coAuthors`（来自 `Co-authored-by` trailer）。历史页经 `buildHistoryLogOptions`：打开仓库默认 `logRef` 为当前分支；UI 选「所有分支」时 `logRef == null` 传 `all: true`；选中分支/标签时传 `ref`。`order`：`topo` / `date` 对应 `--topo-order` / `--date-order`。可选 `authors: string[]`（多条 `--author` OR；鲸履用于按账号拉取，调用方需转义正则特殊字符）。可选 `reverse`（`git log --reverse`；鲸履取作者最早提交）。

### `buildHistoryLogOptions({ skip?; limit?; logRef; order? }): GitLogOptions`

- **说明：** Store / 历史列表用的查询构造器；`logRef == null` → `{ all: true }`（所有分支），否则 → `{ ref: logRef }`；冷启动默认会先写入当前分支再查询。附带 `order`（`default` 时不传给后端）。

### `getCommit(repoPath, rev: string): Promise<GitCommitDetail>`

- **Command：** `git_show`
- **说明：** 返回提交元数据，以及相对每个 parent 的 `name-status` 文件列表（合并提交会有多组）

### `getCommitMessage(repoPath, rev: string): Promise<GitCommitMessageResult>`

- **Command：** `git_commit_message`
- **说明：** 仅返回完整提交文案（标题与正文），用于提交信息历史的 Tooltip 与点击回填；不加载 diff。

### `listTree(repoPath, rev: string): Promise<GitLsTreeResult>`

- **Command：** `git_ls_tree`
- **说明：** 返回该提交树下全部文件路径（`paths: string[]`），供历史详情「显示所有文件」树形浏览

### `getContainingBranches(repoPath, rev: string): Promise<GitContainingBranchesResult>`

- **Command：** `git_commit_containing_branches`
- **说明：** 返回包含该提交的分支名列表（`branches: string[]`）；若 HEAD 指向该提交则含 `HEAD`

### `getCommitChangeSize(repoPath, rev: string): Promise<GitCommitChangeSizeResult>`

- **Command：** `git_commit_change_size`
- **说明：** 返回改动文件数 `fileCount` 与非删除文件在该提交中的 blob 总字节 `totalBytes`

### `getDiff(repoPath, options: DiffOptions): Promise<DiffResult>`

- **Command：** `git_diff`
- **DiffOptions：** `filePath` `staged?` `maxBytes?` `encoding?`
- **DiffResult：** `oldText` `newText` `patch` `binary` `truncated`

`staged=true` 读暂存区相对 HEAD；否则读工作区相对 HEAD。`encoding` 控制两侧文本解码（默认 UTF-8）。Monaco DiffEditor 使用 `oldText` / `newText`。

### `getFileMedia(repoPath, options: GitFileMediaOptions): Promise<GitFileMedia>`

- **Command：** `git_file_media`
- **GitFileMediaOptions：** `filePath` `source`（`worktree` | `index` | Git rev）`maxBytes?`
- **GitFileMedia：** `present` `kind` `mime?` `base64?` `size` `truncated`
- **说明：** 供图片等媒体在 Diff/File 视图预览；非图片扩展名不返回 base64。

### `getStagedDiff(repoPath: string, maxBytes?: number): Promise<GitStagedDiffResult>`

- **Command：** `git_staged_diff`
- **说明：** 返回限长的暂存区 patch（最大 64 KiB）与 `truncated`。仅供 `AiService` 生成提交文案使用，不执行 Git 写操作。

### `getCommitFileDiff(repoPath, options: GitCommitFileDiffOptions): Promise<GitDiffResult>`

- **Command：** `git_commit_file_diff`
- **GitCommitFileDiffOptions：** `filePath` `commitRev` `parentRev?` `maxBytes?` `encoding?`
- **GitDiffResult：** `oldText` `newText` `patch` `binary` `truncated`

历史详情中点击改动文件后使用：对比该文件在 `parentRev` 与 `commitRev` 两个版本的内容。`parentRev` 缺省或空字符串表示根提交（相对空树）。行为与 `getDiff` 一致（`maxBytes` / `encoding` / 二进制判定）。

### `getGraph(repoPath, limit?: number): Promise<GraphPayload>`

- **Command：** `git_graph_commits`

类型定义以 `src/types/git.ts` 为准，并与 command 文档同步。

---

## 暂存与提交

| 方法 | Command |
|------|---------|
| `stage(repoPath, paths: string[])` | `git_stage` |
| `unstage(repoPath, paths: string[])` | `git_unstage` |
| `stageAll(repoPath)` | `git_stage_all` |
| `unstageAll(repoPath)` | `git_unstage_all` |
| `discard(repoPath, paths: string[])` | `git_discard` |
| `commit(repoPath, message, options: { paths; removePaths?; amend? })` | `git_commit` |
| `undoCommit(repoPath, target?)` | `git_undo_commit` |

`commit` 按 ugit 流程：`reset` → `update-index`（`paths` / `removePaths`）→ `commit -F -`。调用方应传入当前「待提交」路径列表。

`undoCommit`：`git reset --mixed` 到父提交（或传入的 `target`）；变更回到工作区。UI 仅在有未推送提交（`ahead > 0`）时启用。

`discard` 调用前 UI 必须确认。成功后调用方应 `getStatus` 刷新 Store。

---

## 分支

| 方法 | Command |
|------|---------|
| `listBranches(repoPath, includeRemote?: boolean)` | `git_branches` |
| `createBranch(repoPath, name, options?: { checkout?; startPoint? })` | `git_branch_create` |
| `deleteBranch(repoPath, name, options?: { force?; deleteRemote?; remote? })` | `git_branch_delete` |
| `renameBranch(repoPath, oldName, newName)` | `git_branch_rename` |
| `checkout(repoPath, ref: string)` | `git_checkout` |
| `merge(repoPath, ref, options?: { mode?: GitMergeMode; autostash?: boolean })` | `git_merge` |

`listBranches` 返回 `GitBranch[]`，每项含 `name/isCurrent/isDefault/isRemote/upstream?`，以及 tip 元数据 `tipShortId/tipAuthoredAt/tipAuthorName`（无数据时为空串）。

`createBranch` 默认 `checkout: true`（创建后切换到新分支）。

`merge` 将 `ref` 合并到当前检出的本地分支。`mode` 可选 `default`、`noFf`、`squash`、`resolve`、`ort`、`noCommit`，分别对应 Git 默认行为、`--no-ff`、`--squash`、`-s resolve`、`-s ort`、`--no-commit`。`autostash: true` 传递 `--autostash`；压缩合并时该选项固定为 false。返回 `{ ok: true, conflict: false }` 表示成功，`{ ok: false, conflict: true }` 表示冲突保留在工作区，调用方应刷新状态并引导用户处理冲突。

---

## 远程

| 方法 | Command |
|------|---------|
| `listRemotes(repoPath)` | `git_remotes` |
| `fetch(repoPath, remote?: string)` | `git_fetch` | 返回 `{ ok, remote, elapsedMs }` |
| `pull(repoPath, options?: { remote?; branch?; rebase? })` | `git_pull` | 返回 `{ ok, conflict, remote, elapsedMs }`；冲突时 `conflict: true` |
| `getRepoState(repoPath)` | `git_repo_state` | 合并进行中状态与冲突路径 |
| `conflictTake(repoPath, filePath, side)` | `git_conflict_take` | 整文件 ours/theirs + add |
| `conflictMarkResolved(repoPath, filePath)` | `git_conflict_mark_resolved` | `git add` |
| `readWorktreeFile(repoPath, filePath, options?)` | `git_read_worktree_file` | 含冲突标记的工作区文本 |
| `writeWorktreeFile(repoPath, filePath, content, options?)` | `git_write_worktree_file` | 写回；`stage` 时一并 add |
| `push(repoPath, options?: { remote?; branch?; setUpstream?; force? })` | `git_push` | 返回 `{ ok, remote, elapsedMs }` |

`pull` 默认由调用方传 `origin` + 当前分支；成功后应刷新 status / branches / log。  
`push` 默认 `origin` + 当前分支，命令形如 `push --progress origin main:main`；成功后应刷新 status / branches / log。  
`force: true` 仅在 UI 确认后传入。

---

## Tag / Stash / Worktree / Merge 族

| 方法 | Command |
|------|---------|
| `listTags` / `createTag` / `deleteTag` | `git_tags` / `git_tag_create` / `git_tag_delete` |
| `listStash` / `stashPush` / `stashApply` / `stashPop` / `stashDrop` | 对应 `git_stash_*` |
| `listWorktrees` / `addWorktree` / `removeWorktree` | `git_worktree_*` |
| `merge` / `rebase` / `cherryPick` | `git_merge` / `git_rebase` / `git_cherry_pick` |

冲突结果不得被当成成功；类型中应区分 `ok` 与 `conflict`。

`listTags` 返回 `{ tags: GitTag[] }`；`GitTag` 包含 `name`、`target` 和可选 `message`。`createTag` 接受 `{ name, message?, ref?, push?, remote? }`；缺省 `ref` 使用 `HEAD`，`message` 为空时创建轻量标签。推送失败不会回滚本地标签，而是返回 `{ ok: true, pushed: false, pushError }`，调用方需刷新列表并提示用户。

---

## 系统探测

### `getGitVersion(executable?: string): Promise<{ version: string; path: string }>`

- **Command：** `git_version`

---

## 聚合导出示例

```ts
// src/services/git/index.ts
export const gitService = {
  getStatus,
  stage,
  unstage,
  commit,
  listBranches,
  fetch,
  pull,
  push,
  getDiff,
  getFileMedia,
  // ...
};
```

---

## 非职责

- 不写 SQLite 项目表
- 不弹系统对话框（选目录属 ProjectService）
- 不直接改 DOM / Store（由 Hook 编排）
