# 分支合并功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在分支树中让用户将任意非当前分支按所选策略合并到当前检出的本地分支，并显示可追溯的操作日志与冲突状态。

**Architecture:** 前端分支菜单只打开确认弹窗，Store 统一编排写操作及刷新；Git Service 是前端唯一的 invoke 出口。Rust Command 校验仓库和 ref，并调用独立的 merge 模块以参数数组执行 Git；模块根据未合并条目将冲突与一般失败区分开。

**Tech Stack:** Tauri 2、Rust、React 19、TypeScript strict、Zustand、shadcn/ui、i18next、lucide-react。

## Global Constraints

- 不使用 `any`、不直接在组件调用 `invoke`、不拼接 shell。
- 所有用户可见文案同时维护 `zh-CN` 与 `en` 翻译资源。
- UI 图标仅使用 `lucide-react`，颜色使用现有 Tailwind token 类。
- 所有 Git 写操作必须使用已验证的 ref、规范化仓库路径、参数数组与 `oplog::run_logged`。
- 冲突必须返回 `{ ok: false, conflict: true }`，不得自动中止合并或伪装成功。
- 只修改本计划列出的文件；保留工作区已有的分支比较未提交改动。

---

## 文件结构

- 新建 `src-tauri/src/git/merge.rs`：合并模式、参数构造、Git 执行和冲突探测。
- 修改 `src-tauri/src/git/mod.rs`：导出 merge 模块。
- 修改 `src-tauri/src/commands/git_ops.rs`：实现异步 `git_merge` Command 并纳入操作日志。
- 修改 `src-tauri/src/lib.rs`：注册 `git_merge`。
- 新建 `src/services/git/git.merge.ts`：合并的强类型 Service 封装。
- 修改 `src/services/git/index.ts`：聚合导出 `merge`。
- 修改 `src/types/git.ts`：定义合并模式、选项和结果 DTO。
- 修改 `src/store/useRepoStore.ts`：加入 `merge` action，完成后刷新状态、分支和历史。
- 新建 `src/components/git/MergeBranchDialog.tsx`：策略选择、自动储藏约束和确认 UI。
- 修改 `src/components/git/BranchTree.tsx`：扩展右键菜单动作并增加合并入口。
- 修改 `src/components/git/BranchList.tsx`：维护合并目标、调用 Store、显示结果 toast。
- 修改 `src/components/layout/OpLogPanel.tsx` 与 `src/i18n/locales/{zh-CN,en}.json`：显示“合并”操作标签与所有菜单/弹窗文案。
- 修改 `docs/api/git.md`、`docs/architecture/command.md`：将已实现的 merge 契约与选项同步为文档真相源。

## Task 1: Rust 合并模块与 Command

**Files:**
- Create: `src-tauri/src/git/merge.rs`
- Modify: `src-tauri/src/git/mod.rs`
- Modify: `src-tauri/src/commands/git_ops.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `src-tauri/src/git/merge.rs`

**Consumes:** `runner::run_git_allow_nonzero`, `status::get_status`, `path::validate_git_ref`, `oplog::run_logged`。

**Produces:**

```rust
pub enum MergeMode { Default, NoFf, Squash, Resolve, Ort, NoCommit }
pub struct GitMergeResult { pub ok: bool, pub conflict: bool }
pub fn merge(repo_path: &Path, source: &str, mode: MergeMode, autostash: bool)
  -> Result<GitMergeResult, AppError>
```

- [ ] **Step 1: 在 `src-tauri/src/git/merge.rs` 写失败测试，锁定参数映射与冲突判定。**

```rust
#[test]
fn build_merge_args_maps_all_supported_modes() {
    assert_eq!(build_merge_args("feature", MergeMode::Default, false), vec!["merge", "feature"]);
    assert_eq!(build_merge_args("feature", MergeMode::NoFf, false), vec!["merge", "--no-ff", "feature"]);
    assert_eq!(build_merge_args("feature", MergeMode::Squash, false), vec!["merge", "--squash", "feature"]);
    assert_eq!(build_merge_args("feature", MergeMode::Resolve, false), vec!["merge", "-s", "resolve", "feature"]);
    assert_eq!(build_merge_args("feature", MergeMode::Ort, false), vec!["merge", "-s", "ort", "feature"]);
    assert_eq!(build_merge_args("feature", MergeMode::NoCommit, false), vec!["merge", "--no-commit", "feature"]);
}

#[test]
fn squash_never_enables_autostash() {
    assert_eq!(build_merge_args("feature", MergeMode::Squash, true), vec!["merge", "--squash", "feature"]);
}

#[test]
fn detects_unmerged_status_entries_as_conflict() {
    assert!(has_conflict(&GitStatusResult { entries: vec![unmerged_entry()], ..clean_status() }));
}
```

- [ ] **Step 2: 运行测试，确认模块尚不存在而失败。**

Run: `cargo test --manifest-path src-tauri/Cargo.toml git::merge::tests`

Expected: FAIL，提示 `git::merge` 或测试模块尚未定义。

- [ ] **Step 3: 实现最小的 `merge.rs`。**

```rust
pub fn build_merge_args(source: &str, mode: MergeMode, autostash: bool) -> Vec<&str> {
    let mut args = vec!["merge"];
    match mode {
        MergeMode::Default => {}
        MergeMode::NoFf => args.push("--no-ff"),
        MergeMode::Squash => args.push("--squash"),
        MergeMode::Resolve => args.extend(["-s", "resolve"]),
        MergeMode::Ort => args.extend(["-s", "ort"]),
        MergeMode::NoCommit => args.push("--no-commit"),
    }
    if autostash && !matches!(mode, MergeMode::Squash) { args.push("--autostash"); }
    args.push(source);
    args
}

pub fn merge(...) -> Result<GitMergeResult, AppError> {
    let args = build_merge_args(source, mode, autostash);
    let output = runner::run_git_allow_nonzero(repo_path, &args)?;
    if output.code == 0 { return Ok(GitMergeResult { ok: true, conflict: false }); }
    if has_conflict(&status::get_status(repo_path)?) {
        return Ok(GitMergeResult { ok: false, conflict: true });
    }
    Err(AppError::new("GIT_FAILED", "合并失败").with_details(output.stderr))
}
```

定义 `MergeMode` 为带 `serde::Deserialize` 和 `rename_all = "camelCase"` 的枚举，供 Command 接收；避免接受任意策略字符串。新增 `pub mod merge;`。在 `git_ops.rs` 中实现 `git_merge(app, path, ref, mode, autostash)`：trim ref、执行 `validate_git_ref`、`resolve_repo_path`、`spawn_blocking`、`oplog::run_logged(&app, &repo_key, "merge", ...)`。最后在 `generate_handler!` 中注册 Command。

- [ ] **Step 4: 运行 Rust 单元测试和格式化检查。**

Run: `cargo test --manifest-path src-tauri/Cargo.toml git::merge::tests && cargo fmt --manifest-path src-tauri/Cargo.toml --check`

Expected: PASS；所有映射、自动储藏约束与冲突判断均通过。

- [ ] **Step 5: 提交 Rust 合并能力。**

```bash
git add src-tauri/src/git/merge.rs src-tauri/src/git/mod.rs src-tauri/src/commands/git_ops.rs src-tauri/src/lib.rs
git commit -m "feat(git): 新增分支合并命令"
```

## Task 2: TypeScript Service、DTO 与 Store 编排

**Files:**
- Create: `src/services/git/git.merge.ts`
- Modify: `src/services/git/index.ts`
- Modify: `src/types/git.ts`
- Modify: `src/store/useRepoStore.ts`

**Consumes:** Task 1 `git_merge` 输入 `{ path, ref, mode?, autostash? }` 与 `GitMergeResult`。

**Produces:**

```ts
export type GitMergeMode = "default" | "noFf" | "squash" | "resolve" | "ort" | "noCommit";
export interface GitMergeOptions { mode?: GitMergeMode; autostash?: boolean; }
export interface GitMergeResult { ok: boolean; conflict: boolean; }
merge(source: string, options?: GitMergeOptions): Promise<GitMergeResult>;
```

- [ ] **Step 1: 写前端类型使用点，使缺失 Service 与 Store action 暴露为 `tsc` 错误。**

在 `useRepoStore.ts` 的 `RepoStoreActions` 先声明：

```ts
merge: (source: string, options?: GitMergeOptions) => Promise<GitMergeResult>;
```

并在实现位置先调用不存在的 `gitService.merge(repoPath, source, options)`，暂不接入 UI。

- [ ] **Step 2: 运行 TypeScript 检查，确认接口尚未实现而失败。**

Run: `pnpm exec tsc --noEmit`

Expected: FAIL，提示 `gitService.merge` 不存在或 Store 未完整实现。

- [ ] **Step 3: 实现 DTO、Service 与 Store 的刷新行为。**

`git.merge.ts` 使用唯一的 `invokeCommand<GitMergeResult>("git_merge", ...)` 出口：

```ts
export async function merge(repoPath: string, ref: string, options?: GitMergeOptions): Promise<GitMergeResult> {
  return invokeCommand<GitMergeResult>("git_merge", {
    path: repoPath, ref, mode: options?.mode ?? "default", autostash: options?.autostash ?? false,
  });
}
```

在 Store action 中 trim 空源分支并抛 `throwValidationError(i18n.t("repo.errors.emptyBranchName"))`；调用前执行 `revealOpLogBeforeInvoke()`。调用结束后无论 `result.ok` 或 `result.conflict`，并行读取 `getStatus`、`listBranches(..., true)`、`getLog({ limit: LOG_PAGE_SIZE })`，更新 `selectedChange`、`status`、`branches`、`commits`、`hasMore` 与 `loading`；普通异常沿用 `setError` 后 rethrow。

- [ ] **Step 4: 运行 TypeScript 检查。**

Run: `pnpm exec tsc --noEmit`

Expected: PASS，所有新增 DTO、Service 和 Store action 的参数、返回值都被严格推断。

- [ ] **Step 5: 提交前端 Git 数据链路。**

```bash
git add src/types/git.ts src/services/git/git.merge.ts src/services/git/index.ts src/store/useRepoStore.ts
git commit -m "feat(git): 接入合并服务与状态刷新"
```

## Task 3: 合并确认弹窗和右键菜单入口

**Files:**
- Create: `src/components/git/MergeBranchDialog.tsx`
- Modify: `src/components/git/BranchTree.tsx`
- Modify: `src/components/git/BranchList.tsx`
- Modify: `src/i18n/locales/zh-CN.json`
- Modify: `src/i18n/locales/en.json`

**Consumes:** Task 2 的 `GitMergeMode`、`GitMergeOptions`、Store `merge` action；既有 `Dialog`、`Select`、`Checkbox`、`Button`、`toast` 与 `toUserMessage`。

**Produces:** 用户可从任一非当前分支打开合并确认弹窗，执行后收到成功或冲突提示。

- [ ] **Step 1: 先在 `BranchTree` 增加未实现的菜单回调和 `MergeBranchDialog` import，让 TypeScript 报出缺失组件/动作。**

```ts
export interface BranchContextActions {
  onMergeIntoCurrent: (branch: GitBranch) => void;
  canMergeIntoCurrent: (branch: GitBranch) => boolean;
}
```

在比较菜单项之前插入 `GitMerge` 图标菜单项；仅当 `!isCurrent && !isDisabled && canMergeIntoCurrent` 时启用。

- [ ] **Step 2: 运行 TypeScript 检查，确认新组件和回调尚未实现而失败。**

Run: `pnpm exec tsc --noEmit`

Expected: FAIL，提示 `MergeBranchDialog` 或新增 `BranchContextActions` 属性缺失。

- [ ] **Step 3: 实现弹窗、菜单接线与中英文文案。**

`MergeBranchDialog` Props 固定如下：

```ts
interface MergeBranchDialogProps {
  open: boolean;
  source: string | null;
  target: string | null;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (options: GitMergeOptions) => void;
}
```

弹窗内部本地状态为 `mode` 与 `autostash`。模式为 `squash` 时，通过 effect 将 `autostash` 重置为 `false`，禁用复选框并渲染 `repo.mergeAutostashUnavailable`。确认按钮触发 `onConfirm({ mode, autostash: mode === "squash" ? false : autostash })`。busy 时 `onOpenChange` 忽略关闭请求、所有控件 disabled，按钮显示 `repo.mergeRunning`。

`BranchList` 增加 `mergeTarget` 和 `mergeBusy`。`openMerge` 从 `status.branch` 或 `branches.find(item => item.isCurrent)?.name` 获取目标；缺失、源等于目标或忙碌时直接返回。`confirmMerge` 调 Store action：成功 toast `repo.mergeSuccess`；结果 `conflict` 时 toast.error(`repo.mergeConflict`)；普通异常使用 `toUserMessage`。完成后清除 dialog state。只要当前分支存在且候选分支不是当前分支，`canMergeIntoCurrent` 返回 true，远程 ref 也可作为源。

新增的 key 包含：`mergeIntoCurrent`、`mergeTitle`、`mergeMode`、`mergeModeDefault`、`mergeModeNoFf`、`mergeModeSquash`、`mergeModeResolve`、`mergeModeOrt`、`mergeModeNoCommit`、`mergeAutostash`、`mergeAutostashUnavailable`、`mergeAction`、`mergeRunning`、`mergeSuccess`、`mergeConflict`。所有动态分支名通过 `{{source}}` 和 `{{target}}` 插值。

- [ ] **Step 4: 运行前端检查和生产构建。**

Run: `pnpm run build`

Expected: PASS，包含 TypeScript 检查与 Vite 生产构建。

- [ ] **Step 5: 提交合并交互。**

```bash
git add src/components/git/MergeBranchDialog.tsx src/components/git/BranchTree.tsx src/components/git/BranchList.tsx src/i18n/locales/zh-CN.json src/i18n/locales/en.json
git commit -m "feat(branch): 增加分支合并操作"
```

## Task 4: 操作日志、契约文档与端到端冒烟

**Files:**
- Modify: `src/components/layout/OpLogPanel.tsx`
- Modify: `src/i18n/locales/zh-CN.json`
- Modify: `src/i18n/locales/en.json`
- Modify: `docs/api/git.md`
- Modify: `docs/architecture/command.md`

**Consumes:** Task 1 `merge` 操作日志 label 与 Task 2 的 DTO。

**Produces:** 合并操作有可识别日志标签，公开 API / Command 文档与实现一致。

- [ ] **Step 1: 在 `OpLogPanel` 新增未翻译的 `opLog.labelMerge` 分支，确认 i18n key 缺失能在页面中被定位。**

```ts
if (label === "merge") return "opLog.labelMerge";
```

- [ ] **Step 2: 手动运行应用并触发一次默认合并，确认日志创建但标签为未解析 key。**

Run: `pnpm tauri dev`

Expected: 操作日志新增“opLog.labelMerge”键名，证明事件 label 已通过前端。

- [ ] **Step 3: 添加翻译与文档并执行真实仓库冒烟。**

在两套翻译资源追加 `opLog.labelMerge`。更新 `docs/api/git.md` 的分支方法表，添加 `merge(repoPath, ref, options?: GitMergeOptions)`、全部 mode、autostash 的 squash 约束及冲突结果；更新 `docs/architecture/command.md` 的 `git_merge` 输入输出，与实际 `mode`、`autostash` 和 `{ ok, conflict }` 对齐。

创建临时 Git 仓库进行三次无网络冒烟：

```bash
tmp=$(mktemp -d)
git -C "$tmp" init -b main
git -C "$tmp" config user.name JLGit
git -C "$tmp" config user.email jlgit@example.test
printf 'base\n' > "$tmp/file.txt"
git -C "$tmp" add file.txt && git -C "$tmp" commit -m base
git -C "$tmp" switch -c feature
printf 'feature\n' >> "$tmp/file.txt"
git -C "$tmp" commit -am feature
git -C "$tmp" switch main
git -C "$tmp" merge --no-ff feature
git -C "$tmp" log -1 --format=%P
```

Expected: 最后命令输出两个 parent id，验证 `--no-ff` 确实产生合并提交。再以相同文件在两个分支写不同内容，执行默认 `git merge feature`，预期 exit 1 且 `git status --porcelain=v2` 存在 `u ` 行；执行 `git merge --abort` 仅用于清理该临时测试仓库。

- [ ] **Step 4: 执行最终检查。**

Run: `cargo test --manifest-path src-tauri/Cargo.toml && cargo fmt --manifest-path src-tauri/Cargo.toml --check && pnpm run build`

Expected: 全部 PASS。

- [ ] **Step 5: 提交日志标签与文档。**

```bash
git add src/components/layout/OpLogPanel.tsx src/i18n/locales/zh-CN.json src/i18n/locales/en.json docs/api/git.md docs/architecture/command.md
git commit -m "docs(git): 补充合并命令契约"
```

## 自检结果

- 覆盖性：Task 1 覆盖安全 Git 执行与冲突结果；Task 2 覆盖 Service/Store 刷新；Task 3 覆盖六种策略、自动储藏、分支菜单和弹窗；Task 4 覆盖操作日志、文档和运行时冒烟。
- 占位检查：计划不含待补内容；每项测试、实现和提交都给出确切路径、接口或命令。
- 类型一致性：前端 `GitMergeMode` 与 Rust serde camelCase `MergeMode` 分支值一致；Command、Service、Store 和 Dialog 均使用 `GitMergeOptions` / `GitMergeResult`。
