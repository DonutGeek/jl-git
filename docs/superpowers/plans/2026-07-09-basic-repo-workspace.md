# Basic Repo Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现本地打开仓库 + 三栏工作区（左分支切换 · 中变更/暂存/提交 · 右提交历史），并用 SQLite 记住最近项目。

**Architecture:** React Page/Hook → Service → `invoke` → Rust Command → Git CLI / SQLite。UI 不直连 `invoke`；Git 参数数组化；契约对齐 `docs/architecture/command.md`。

**Tech Stack:** Tauri 2、React 19、TypeScript、Zustand、React Router、i18next、shadcn/ui、tauri-plugin-sql / dialog、系统 Git CLI。

**Spec:** `docs/superpowers/specs/2026-07-09-basic-repo-workspace-design.md`

**Note:** 当前工作区尚无 `.git`。Task 0 先 `git init`；若用户拒绝初始化，所有 Commit 步骤改为「跳过，仅保留工作区改动」。

---

## File Structure

### Rust（新建）

| 路径 | 职责 |
|------|------|
| `src-tauri/src/error.rs` | `AppError` 可序列化错误 |
| `src-tauri/src/git/mod.rs` | git 模块导出 |
| `src-tauri/src/git/path.rs` | 路径规范化 + 工作树校验 |
| `src-tauri/src/git/runner.rs` | 参数数组执行 git |
| `src-tauri/src/git/status.rs` | porcelain v2 解析 |
| `src-tauri/src/git/branch.rs` | 分支列表解析 |
| `src-tauri/src/git/log.rs` | log 解析 |
| `src-tauri/src/db/mod.rs` | 迁移 + projects/recent CRUD |
| `src-tauri/src/commands/mod.rs` | command 模块汇总 |
| `src-tauri/src/commands/project.rs` | project_* / recent_list / pick_directory |
| `src-tauri/src/commands/git_ops.rs` | status/branches/log/stage/commit/checkout |
| `src-tauri/src/lib.rs` | 注册 handler（瘦） |

### 前端（新建/改）

| 路径 | 职责 |
|------|------|
| `src/types/error.ts` `project.ts` `git.ts` | DTO |
| `src/services/invoke.ts` | 统一 invoke + 错误映射 |
| `src/services/project/*` | ProjectService |
| `src/services/git/*` | GitService 分文件 |
| `src/store/useProjectStore.ts` `useRepoStore.ts` | Zustand |
| `src/i18n/*` | zh-CN |
| `src/router/index.tsx` | `/` `/repo/:projectId` |
| `src/layouts/AppLayout.tsx` | 壳 |
| `src/pages/DashboardPage.tsx` `RepoPage.tsx` | 页面 |
| `src/components/project/*` `git/*` | 领域组件 |
| `src/main.tsx` `App.tsx` | 接入 Router / i18n |
| `docs/product/feature-list.md` | 状态更新 |

### shadcn 按需

`input` `textarea` `scroll-area` `separator`（已有 `button`）

---

### Task 0: 初始化 Git 仓库（若尚无）

**Files:** 无业务代码

- [ ] **Step 1: 检查并初始化**

```bash
cd /Users/jingling/Documents/demo/JLGit
test -d .git || git init -b main
git status
```

Expected: 存在 `.git`，分支 `main`。

- [ ] **Step 2: 首次提交基线（可选，用户同意时）**

仅当用户明确要求 commit 时执行；否则跳过。后续各 Task 的 commit 步骤同理：用户未要求则跳过。

---

### Task 1: Rust `AppError` + Git path/runner

**Files:**
- Create: `src-tauri/src/error.rs`
- Create: `src-tauri/src/git/mod.rs`
- Create: `src-tauri/src/git/path.rs`
- Create: `src-tauri/src/git/runner.rs`
- Modify: `src-tauri/Cargo.toml`（如需 `thiserror` / `uuid` / `chrono` 等依赖时在本 Task 或 Task 3 添加）
- Test: `src-tauri/src/git/path.rs` 内 `#[cfg(test)]`

- [ ] **Step 1: 添加依赖**

在 `Cargo.toml` `[dependencies]` 追加：

```toml
thiserror = "2"
uuid = { version = "1", features = ["v4", "serde"] }
chrono = { version = "0.4", default-features = false, features = ["clock", "std"] }
```

- [ ] **Step 2: 实现 `error.rs`**

```rust
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, Serialize)]
pub struct AppError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
}

impl AppError {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
            details: None,
        }
    }

    pub fn with_details(mut self, details: impl Into<String>) -> Self {
        self.details = Some(details.into());
        self
    }
}

impl From<AppError> for String {
    // Tauri 默认可将 Error 映射为可序列化值；若用 Result<T, AppError>
    // 需实现 Serialize（已有）并在 command 返回 Result<T, AppError>
    fn from(value: AppError) -> Self {
        serde_json::to_string(&value).unwrap_or_else(|_| value.message)
    }
}
```

说明：最终以 `Result<T, AppError>` + `Serialize` 为准；若 Tauri 2 需要 `impl Serialize for AppError` 已满足。删除无用的 `From` 若与 IPC 冲突，改为直接返回 `AppError`。

- [ ] **Step 3: 实现 `git/path.rs`**

```rust
use crate::error::AppError;
use crate::git::runner;
use std::path::{Path, PathBuf};

pub fn normalize_existing_dir(path: &str) -> Result<PathBuf, AppError> {
    let p = PathBuf::from(path);
    if !p.exists() {
        return Err(AppError::new("INVALID_PATH", "路径不存在"));
    }
    if !p.is_dir() {
        return Err(AppError::new("INVALID_PATH", "路径不是目录"));
    }
    std::fs::canonicalize(&p).map_err(|e| {
        AppError::new("INVALID_PATH", "无法规范化路径").with_details(e.to_string())
    })
}

pub fn require_git_toplevel(path: &Path) -> Result<PathBuf, AppError> {
    let out = runner::run_git(path, &["rev-parse", "--show-toplevel"])?;
    let toplevel = out.stdout.trim();
    if toplevel.is_empty() {
        return Err(AppError::new("NOT_A_REPO", "不是 Git 仓库"));
    }
    Ok(PathBuf::from(toplevel))
}

pub fn validate_repo_relative_paths(paths: &[String]) -> Result<(), AppError> {
    for p in paths {
        if p.is_empty() || p.contains('\0') {
            return Err(AppError::new("VALIDATION", "非法路径"));
        }
        let path = Path::new(p);
        if path.is_absolute() || p.split(['/', '\\']).any(|s| s == "..") {
            return Err(AppError::new("VALIDATION", "路径必须相对仓库根且不得包含 .."));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_parent_segment() {
        assert!(validate_repo_relative_paths(&["a/../b".into()]).is_err());
    }

    #[test]
    fn accepts_normal_relative() {
        assert!(validate_repo_relative_paths(&["src/App.tsx".into()]).is_ok());
    }
}
```

- [ ] **Step 4: 实现 `git/runner.rs`**

```rust
use crate::error::AppError;
use std::path::Path;
use std::process::Command;

pub struct GitOutput {
    pub stdout: String,
    pub stderr: String,
    pub code: i32,
}

pub fn run_git(cwd: &Path, args: &[&str]) -> Result<GitOutput, AppError> {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()
        .map_err(|e| {
            AppError::new("GIT_NOT_FOUND", "无法执行 git").with_details(e.to_string())
        })?;

    let code = output.status.code().unwrap_or(-1);
    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();

    if !output.status.success() {
        return Err(
            AppError::new("GIT_FAILED", stderr.lines().next().unwrap_or("git 命令失败"))
                .with_details(stderr),
        );
    }

    Ok(GitOutput { stdout, stderr, code })
}

/// 允许非 0 退出（如 status 在部分场景）；调用方自行判断
pub fn run_git_allow_nonzero(cwd: &Path, args: &[&str]) -> Result<GitOutput, AppError> {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()
        .map_err(|e| {
            AppError::new("GIT_NOT_FOUND", "无法执行 git").with_details(e.to_string())
        })?;

    Ok(GitOutput {
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        code: output.status.code().unwrap_or(-1),
    })
}
```

- [ ] **Step 5: `git/mod.rs` 导出**

```rust
pub mod branch;
pub mod log;
pub mod path;
pub mod runner;
pub mod status;
```

（`branch`/`log`/`status` 在 Task 2 填充；本 Task 可先建空 `mod` 文件或延后到 Task 2 再写 `mod.rs`。）

- [ ] **Step 6: 跑 path 单测**

```bash
cd src-tauri && cargo test git::path -- --nocapture
```

Expected: PASS

---

### Task 2: Git 解析 + 读写 Commands

**Files:**
- Create: `src-tauri/src/git/status.rs` `branch.rs` `log.rs`
- Create: `src-tauri/src/commands/mod.rs` `git_ops.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: `status.rs` — porcelain v2 最小解析**

解析 `git status --porcelain=v2 --branch`：

- 头信息：`# branch.head` → `branch`；`# branch.upstream`；`# branch.ab +N -M` → ahead/behind；detached 时 head 为 `(detached)`
- 条目：`1`/`2`/`u`/`?` 行 → `GitStatusEntry { path, index_status, worktree_status, renamed_from? }`

序列化字段用 **camelCase**（`#[serde(rename_all = "camelCase")]`）。

- [ ] **Step 2: `branch.rs`**

`git for-each-ref --format='%(refname:short)%00%(HEAD)%00%(upstream:short)' refs/heads`

输出 `GitBranch { name, is_current, is_remote: false, upstream? }`。

- [ ] **Step 3: `log.rs`**

```text
git log --format=%H%x00%h%x00%an%x00%aI%x00%s --skip={skip} --max-count={limit+1}
```

若返回 `limit+1` 条则 `has_more=true` 并截断到 `limit`。默认 limit=50，硬上限 200。

`GitCommitSummary { id, short_id, author_name, authored_at, subject }`（camelCase）。

- [ ] **Step 4: `commands/git_ops.rs`**

实现并导出：

| Command | 行为 |
|---------|------|
| `git_status` | normalize → toplevel → status |
| `git_branches` | `include_remote` 本版可忽略远程 |
| `git_log` | skip/limit/ref |
| `git_stage` / `git_unstage` | `validate_repo_relative_paths` 后 `git add --` / `git restore --staged --` |
| `git_stage_all` | `git add -A` |
| `git_unstage_all` | `git restore --staged .` |
| `git_commit` | message trim 非空；`git commit -m` |
| `git_checkout` | `git switch -- {ref}`，失败则 `GIT_FAILED` |

每个 command 签名示例：

```rust
#[tauri::command]
pub fn git_status(path: String) -> Result<GitStatusResult, AppError> { ... }
```

- [ ] **Step 5: 注册到 `lib.rs`**

```rust
mod commands;
mod db;
mod error;
mod git;

use commands::git_ops::*;
// project 在 Task 3 注册

.invoke_handler(tauri::generate_handler![
  // 暂时保留 greet 或删除
  git_status,
  git_branches,
  git_log,
  git_stage,
  git_unstage,
  git_stage_all,
  git_unstage_all,
  git_commit,
  git_checkout,
])
```

- [ ] **Step 6: 编译**

```bash
cd src-tauri && cargo check
```

Expected: 无错误

- [ ] **Step 7: 手工冒烟（可选）**

在临时 git 仓库对 `git_status` / `git_log` 用 `cargo test` 集成测，或等前端联调。

---

### Task 3: SQLite projects + project Commands

**Files:**
- Create: `src-tauri/src/db/mod.rs`
- Create: `src-tauri/src/commands/project.rs`
- Modify: `src-tauri/src/lib.rs` `commands/mod.rs`

- [ ] **Step 1: 迁移 SQL（version 1）**

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NULL,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  last_opened_at TEXT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recent_projects (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  opened_at TEXT NOT NULL,
  open_count INTEGER NOT NULL DEFAULT 1
);
```

- [ ] **Step 2: `db/mod.rs`**

使用 `tauri_plugin_sql`：在 `setup` 钩子或首个 project command 内 `Database::load("sqlite:jlgit.db")` 并跑迁移。

实现：

- `list_projects() -> Vec<ProjectRow>`
- `add_project(path, name?)` — 先 `require_git_toplevel`，name 默认取目录名，UUID v4，upsert by path（已存在则更新 name/updated_at 并返回）
- `touch_opened(id)` — 更新 `last_opened_at` + upsert `recent_projects`；裁剪最近超过 20 条
- `list_recent(limit)` 

`ProjectRow` 字段 camelCase：`id, workspaceId, name, path, lastOpenedAt, pinned, createdAt, updatedAt`。

- [ ] **Step 3: `project_pick_directory`**

用 `tauri_plugin_dialog::DialogExt`：

```rust
#[tauri::command]
pub async fn project_pick_directory(app: tauri::AppHandle) -> Result<PickResult, AppError> {
  // folder picker；取消 → { path: null }
}
```

- [ ] **Step 4: 注册 project commands**

`project_list` `project_add` `project_touch_opened` `project_pick_directory` `recent_list`

- [ ] **Step 5: `cargo check`**

Expected: PASS

---

### Task 4: 前端类型 + invoke + Services

**Files:**
- Create: `src/types/error.ts` `project.ts` `git.ts`
- Create: `src/services/invoke.ts`
- Create: `src/services/project/index.ts` `project.service.ts`
- Create: `src/services/git/git.status.ts` `git.branch.ts` `git.commit.ts` `git.log.ts` `index.ts`

- [ ] **Step 1: 类型对齐 command 文档（camelCase）**

```ts
// error.ts
export interface AppError {
  code:
    | "INVALID_PATH"
    | "NOT_A_REPO"
    | "GIT_FAILED"
    | "GIT_NOT_FOUND"
    | "DB_ERROR"
    | "NOT_FOUND"
    | "VALIDATION"
    | "CANCELLED"
    | "INTERNAL";
  message: string;
  details?: string;
}

export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    "message" in value
  );
}

export function toUserMessage(err: unknown): string {
  if (isAppError(err)) return err.message;
  if (err instanceof Error) return err.message;
  return "未知错误";
}
```

`git.ts` / `project.ts` 按 design/command 定义 `GitStatusResult`、`GitBranch`、`GitCommitSummary`、`Project` 等。

- [ ] **Step 2: `invoke.ts`**

```ts
import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { isAppError, type AppError } from "@/types/error";

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await tauriInvoke<T>(cmd, args);
  } catch (e) {
    // Tauri 可能抛出已序列化对象或 JSON 字符串
    if (isAppError(e)) throw e;
    if (typeof e === "string") {
      try {
        const parsed: unknown = JSON.parse(e);
        if (isAppError(parsed)) throw parsed;
      } catch {
        /* fallthrough */
      }
    }
    const err: AppError = {
      code: "INTERNAL",
      message: e instanceof Error ? e.message : String(e),
    };
    throw err;
  }
}
```

- [ ] **Step 3: ProjectService / GitService 方法**

严格只调对应 command，例如：

```ts
export async function getStatus(repoPath: string) {
  return invoke<GitStatusResult>("git_status", { path: repoPath });
}
```

- [ ] **Step 4: `pnpm exec tsc --noEmit`**

Expected: 无类型错误（可先不接 UI）

---

### Task 5: Zustand stores + i18n + Router 壳

**Files:**
- Create: `src/store/useProjectStore.ts` `useRepoStore.ts`
- Create: `src/i18n/index.ts` `locales/zh-CN.json`
- Create: `src/router/index.tsx`
- Create: `src/layouts/AppLayout.tsx`
- Modify: `src/main.tsx` `src/App.tsx`

- [ ] **Step 1: i18n 资源键（示例）**

`dashboard.title` `openRepo.path` `openRepo.alias` `openRepo.pick` `openRepo.submit` `repo.branches` `repo.changes` `repo.staged` `repo.unstaged` `repo.commit` `repo.history` `repo.loadMore` `repo.clean` `common.back` 等。

- [ ] **Step 2: stores**

`useProjectStore`: `projects` `recent` `current` `loadRecent` `addAndOpen`  
`useRepoStore`: `status` `branches` `commits` `hasMore` `commitMessage` `loading` `error` `loadAll` `refreshStatus` `stage` `commit` `checkout` `loadMoreLog`

- [ ] **Step 3: Router**

```tsx
<Routes>
  <Route element={<AppLayout />}>
    <Route index element={<DashboardPage />} />
    <Route path="repo/:projectId" element={<RepoPage />} />
  </Route>
</Routes>
```

`App.tsx` 仅渲染 `<RouterProvider>` 或 `BrowserRouter` + routes。

- [ ] **Step 4: 类型检查**

```bash
pnpm exec tsc --noEmit
```

---

### Task 6: Dashboard — 打开仓库 + 最近列表

**Files:**
- Create: `src/pages/DashboardPage.tsx`
- Create: `src/components/project/OpenRepoForm.tsx`
- Create: `src/components/project/RecentProjectList.tsx`
- shadcn: `pnpm dlx shadcn@latest add input`（如尚未有）

- [ ] **Step 1: OpenRepoForm**

- 路径 Input +「选择」→ `projectService.pickDirectory()`
- 别名 Input 可选
- 确定 → `projectService.add` → `touchOpened` → `navigate(/repo/:id)`
- 错误内联展示 `toUserMessage`

- [ ] **Step 2: RecentProjectList**

加载 `list` + `listRecent` 合并展示；点击 → `touchOpened` + navigate。

- [ ] **Step 3: 手动验收**

`pnpm tauri dev` → 打开本机某 git 仓库 → 进入仓库页路由（页可先占位）。

---

### Task 7: Repo 三栏 UI

**Files:**
- Create: `src/pages/RepoPage.tsx`
- Create: `src/components/git/BranchList.tsx`
- Create: `src/components/git/ChangesPanel.tsx`
- Create: `src/components/git/CommitBox.tsx`
- Create: `src/components/git/HistoryList.tsx`
- shadcn: `textarea` `scroll-area` `separator` 按需

- [ ] **Step 1: RepoPage 布局**

顶栏：项目名、当前分支、返回。  
CSS Grid/Flex：左 ~20% / 中 ~45% / 右 ~35%。  
`useParams` → 从 store/service 解析 `path` → `loadAll`。

- [ ] **Step 2: BranchList**

点击非当前分支 → `checkout` → 全量刷新；失败 toast。

- [ ] **Step 3: ChangesPanel + CommitBox**

按 `indexStatus`/`worktreeStatus` 拆分 staged/unstaged（porcelain 语义：index 非 `.` 为 staged 侧，worktree 非 `.`/`?` 等为 unstaged；`?` 未跟踪进 unstaged）。  
按钮：单文件 +/-、全部暂存/取消。  
Commit：message 空禁用；成功 toast、清空、刷新 status+log。

- [ ] **Step 4: HistoryList**

展示 shortId + subject + author + 相对时间（dayjs）；`hasMore` 时「加载更多」。

- [ ] **Step 5: 端到端手工验收（对照 spec §8）**

- [ ] **Step 6: 更新 `docs/product/feature-list.md` 相关项为 In Progress/Done**

- [ ] **Step 7: `pnpm exec tsc --noEmit` + `cd src-tauri && cargo check`**

---

## Spec Coverage Checklist

| Spec 项 | Task |
|---------|------|
| 打开本地仓库（输入/选择 + 别名） | 6 |
| SQLite 最近项目 | 3, 6 |
| 左栏分支切换 | 2, 7 |
| 中栏 stage/commit | 2, 7 |
| 右栏历史分页 | 2, 7 |
| 不做 Diff/远程/分组 | 全计划未包含 |
| AppError / 安全路径 | 1, 2 |
| feature-list 更新 | 7 |
| 分层 Service | 4 |

## Placeholder / Consistency Self-Review

- 无 TBD；Command 名与 `command.md` 一致（camelCase JSON）
- `git_checkout` 使用 `git switch`；失败回落可在实现时加 `git checkout` 兼容（写入实现注释即可）
- Commit 步骤：仓库无 git 时先 Task 0；用户未要求 commit 则跳过

---
