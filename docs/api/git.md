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

### `getLog(repoPath, options?: { skip?; limit?; ref? }): Promise<{ commits; hasMore }>`

- **Command：** `git_log`
- **说明：** 每条 `GitCommitSummary` 含 `authorEmail`、`parentIds`（用于历史图谱）与 `coAuthors`（来自 `Co-authored-by` trailer）

### `getCommit(repoPath, rev: string): Promise<GitCommitDetail>`

- **Command：** `git_show`
- **说明：** 返回提交元数据，以及相对每个 parent 的 `name-status` 文件列表（合并提交会有多组）

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

`createBranch` 默认 `checkout: true`（创建后切换到新分支）。

---

## 远程

| 方法 | Command |
|------|---------|
| `listRemotes(repoPath)` | `git_remotes` |
| `fetch(repoPath, remote?: string)` | `git_fetch` | 返回 `{ ok, remote, elapsedMs }` |
| `pull(repoPath, options?: { remote?; branch?; rebase? })` | `git_pull` | 返回 `{ ok, remote, elapsedMs }` |
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
  // ...
};
```

---

## 非职责

- 不写 SQLite 项目表
- 不弹系统对话框（选目录属 ProjectService）
- 不直接改 DOM / Store（由 Hook 编排）
