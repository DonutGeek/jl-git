# 分支比较子窗口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从 Agent 比较动作打开独立、只读的 Tauri 分支比较窗口，支持文件 Diff 与双向独有提交查看。

**Architecture:** 新增两个 Rust 只读 Command，在已有路径、Git ref 和仓库相对路径校验之上读取比较文件与指定文件的两侧 blob。前端以独立 `branch-compare` 路由加载项目和 refs；窗口服务负责稳定标签的创建/聚焦，工作区组件只维护比较、选择和预览状态，不接入任何工作区写操作。

**Tech Stack:** Tauri 2、React 19、TypeScript strict、Zustand 既有 Store、Monaco React、Tailwind CSS 4、Rust、Git CLI。

## Global Constraints

- 窗口只读：不展示、调用或预留创建、删除、切换、合并、提交、推送等 Git 写能力。
- UI 只能经 `src/services/git` 与 `src/services/project` 调用 Tauri Command；不得在组件内直接 `invoke` 或拼接 shell。
- Rust 中所有仓库路径、Git ref、仓库相对路径沿用 `normalize_existing_dir`、`require_git_toplevel`、`validate_git_ref`、`validate_repo_relative_paths`；Git 仅使用参数数组。
- 不新增依赖；复用 `SelectMenu`、`DiffPreviewToolbar`、`DiffSidePreview`、`monacoPreviewShared` 与现有 Monaco 主题。
- 全部新增用户可见文案同时写入 `src/i18n/locales/zh-CN.json` 与 `src/i18n/locales/en.json`，不得硬编码业务文案。
- 文件 Diff 默认限制 1 MiB；二进制和截断都显示明确状态；切换比较/文件时不得让旧请求覆盖新状态。
- 保持 TypeScript strict，不新增 `any`、空 catch、硬编码颜色或不安全外部输入。

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src-tauri/src/git/branch_compare.rs` | 比较两 ref 的改动文件、指定文件两侧 blob 与 patch；解析 Git 的 NUL 分隔输出。 |
| `src-tauri/src/git/mod.rs` | 导出分支比较 Git 模块。 |
| `src-tauri/src/commands/git_ops.rs` | 注册两个只读 Tauri Command，并先解析仓库根目录。 |
| `src-tauri/src/lib.rs` | 将两个 Command 加入 invoke handler。 |
| `src/types/git.ts` | 定义 BranchCompare 的 TypeScript 输入/输出类型。 |
| `src/services/git/git.branch-compare.ts` | 前端对两个只读 Command 的唯一封装。 |
| `src/services/git/index.ts` | 导出 Branch Compare Service。 |
| `src/services/window/branchCompareWindow.ts` | 生成稳定窗口 label、编码 URL 参数、创建或聚焦子窗口。 |
| `src/pages/BranchComparePage.tsx` | 无主工作区壳的子窗口路由，读取 URL、加载项目与分支。 |
| `src/components/git/BranchCompareWorkspace.tsx` | 比较模式、ref、视图、请求序号和整体三段布局。 |
| `src/components/git/BranchCompareFileList.tsx` | 文件统计、筛选、状态和增删行列表。 |
| `src/components/git/BranchCompareDiffPane.tsx` | 复用 Monaco 与 Diff 工具栏的只读文件预览。 |
| `src/components/git/BranchCompareCommitList.tsx` | 双方向独有提交列表和选中状态。 |
| `src/components/git/BranchCompareCommitDetail.tsx` | 使用现有 `git_show` 展示已选提交详情。 |
| `src/router/index.tsx` | 新增不包裹 `AppLayout` 的 `/branch-compare` 路由。 |
| `src/components/ai/AgentChatPanel.tsx` | 分支存在性校验后调用窗口服务，移除内嵌比较 Dialog 状态。 |
| `src/components/git/BranchList.tsx` | 将当前检出分支与右键目标分支交给同一窗口服务。 |
| `src/components/git/BranchTree.tsx` | 在既有右键菜单中渲染只读“比较当前分支与此分支”动作。 |
| `src/components/ai/AgentBranchComparisonDialog.tsx` | 删除已被子窗口替代的旧 Dialog。 |
| `src-tauri/capabilities/default.json` | 允许主窗口创建比较子窗口。 |
| `src-tauri/capabilities/branch-compare.json` | 仅把最小核心窗口能力赋给 `branch-compare-*` 窗口；不添加 FS/Store/Dialog/Clipboard/写操作插件权限。 |
| `src/i18n/locales/{zh-CN,en}.json` | 分支比较窗口的双语文案。 |

### Task 1: Rust 只读比较数据契约

**Files:**
- Create: `src-tauri/src/git/branch_compare.rs`
- Modify: `src-tauri/src/git/mod.rs`
- Modify: `src-tauri/src/commands/git_ops.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `src-tauri/src/git/branch_compare.rs`

**Interfaces:**
- Consumes: `runner::run_git_allow_nonzero`, `diff::GitDiffResult`, `validate_git_ref`, `validate_repo_relative_paths`。
- Produces: `branch_compare::get_changed_files(repo_path, base, target) -> Result<GitBranchCompareResult, AppError>` 与 `branch_compare::get_file_diff(repo_path, base, target, file_path, max_bytes, encoding) -> Result<GitDiffResult, AppError>`；Tauri Command `git_branch_compare`、`git_branch_file_diff`。

- [ ] **Step 1: 写入失败的 Rust 解析测试**

在 `branch_compare.rs` 最后添加如下覆盖：普通新增/修改/删除、重命名结果取新路径、二进制 numstat 的 `-`、非法 ref 走现有校验。

```rust
#[test]
fn parses_name_status_and_numstat_by_result_path() {
    let statuses = "M\0src/a.ts\0R100\0src/old.ts\0src/new.ts\0D\0src/gone.ts\0";
    let numstat = "3\t1\tsrc/a.ts\0-\t-\t\0src/old.ts\0src/new.ts\00\t4\tsrc/gone.ts\0";

    assert_eq!(
        merge_changed_files(statuses, numstat),
        vec![
            GitChangedFile { path: "src/a.ts".into(), status: "M".into(), additions: Some(3), deletions: Some(1) },
            GitChangedFile { path: "src/new.ts".into(), status: "R".into(), additions: None, deletions: None },
            GitChangedFile { path: "src/gone.ts".into(), status: "D".into(), additions: Some(0), deletions: Some(4) },
        ]
    );
}

#[test]
fn rejects_invalid_branch_compare_ref() {
    assert!(validate_compare_refs("main", "bad ref").is_err());
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test branch_compare --manifest-path src-tauri/Cargo.toml`

Expected: FAIL，提示 `branch_compare` 模块或 `merge_changed_files` 未定义。

- [ ] **Step 3: 实现最小只读 Git 模块**

在 `src-tauri/src/git/branch_compare.rs` 定义 snake_case 的 DTO 与函数；状态统计分别执行两个参数数组命令，绝不调用 shell：

```rust
#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitChangedFile {
    pub path: String,
    pub status: String,
    pub additions: Option<u32>,
    pub deletions: Option<u32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchCompareResult {
    pub files: Vec<GitChangedFile>,
}

pub fn get_changed_files(repo_path: &Path, base: &str, target: &str) -> Result<GitBranchCompareResult, AppError> {
    validate_compare_refs(base, target)?;
    let statuses = runner::run_git(repo_path, &["diff", "--name-status", "-z", "--find-renames", base, target])?;
    let stats = runner::run_git(repo_path, &["diff", "--numstat", "-z", "--find-renames", base, target])?;
    Ok(GitBranchCompareResult { files: merge_changed_files(&statuses.stdout, &stats.stdout) })
}
```

`get_file_diff` 必须：先 trim 并校验 `file_path`，再校验两个 ref；使用 `git show --textconv <ref>:<path>` 获取左右 blob（不存在一侧为 `None`），复用 `diff.rs` 中的二进制检测、编码解码和 1 MiB 截断逻辑；patch 用：

```rust
runner::run_git_allow_nonzero(repo_path, &["diff", "--no-ext-diff", base, target, "--", file_path])
```

为了不复制私有辅助函数，将 `diff.rs` 的 `bytes_to_text`、`looks_binary`、blob 读取和限长 patch 提取提升为 `pub(crate)`，行为和既有 `git_diff` 完全一致。把模块加入 `git/mod.rs`：

```rust
pub mod branch_compare;
```

在 `git_ops.rs` 添加前端需要的薄封装：

```rust
#[tauri::command]
pub fn git_branch_compare(path: String, base: String, target: String) -> Result<GitBranchCompareResult, AppError> {
    let repo_path = resolve_repo_path(&path)?;
    branch_compare::get_changed_files(&repo_path, &base, &target)
}
```

`git_branch_file_diff` 同样接收 `path/base/target/file_path/max_bytes/encoding`，只委托 `branch_compare::get_file_diff`。在 `lib.rs` 的 `generate_handler!` 紧邻现有 `git_diff` 注册两个 command。

- [ ] **Step 4: 运行 Rust 单元测试**

Run: `cargo test --manifest-path src-tauri/Cargo.toml branch_compare`

Expected: PASS，至少包含 `parses_name_status_and_numstat_by_result_path` 与 `rejects_invalid_branch_compare_ref`。

- [ ] **Step 5: 提交 Rust 数据层**

```bash
git add src-tauri/src/git/branch_compare.rs src-tauri/src/git/diff.rs src-tauri/src/git/mod.rs src-tauri/src/commands/git_ops.rs src-tauri/src/lib.rs
git commit -m "feat(git): 增加只读分支比较命令"
```

### Task 2: 前端类型、Git Service 与窗口能力

**Files:**
- Modify: `src/types/git.ts`
- Create: `src/services/git/git.branch-compare.ts`
- Modify: `src/services/git/index.ts`
- Create: `src/services/window/branchCompareWindow.ts`
- Modify: `src-tauri/capabilities/default.json`
- Create: `src-tauri/capabilities/branch-compare.json`
- Test: `src/services/window/branchCompareWindow.ts`

**Interfaces:**
- Consumes: Task 1 的 `git_branch_compare` 和 `git_branch_file_diff`；`Project.id`。
- Produces: `getBranchCompare(repoPath, { base, target })`、`getBranchFileDiff(repoPath, options)`、`openBranchCompareWindow(options)`、`BranchCompareMode`。

- [ ] **Step 1: 写入纯函数失败测试**

在 `branchCompareWindow.ts` 同文件测试块或项目已有等价测试目录中测试 URL 与 label 的稳定性：

```ts
it("encodes project and refs into a stable branch compare URL", () => {
  expect(createBranchCompareWindowTarget({ projectId: "p 1", mode: "branch", base: "origin/main", target: "feat/a" })).toEqual({
    label: "branch-compare-1b8f8d8d",
    url: "/branch-compare?projectId=p+1&mode=branch&base=origin%2Fmain&target=feat%2Fa",
  });
});
```

若仓库尚未安装 JS 测试运行器，不引入新依赖；将纯函数导出，在下一步用 `npm run build` 验证类型，并在 Task 6 用运行时冒烟验证 URL 与复用窗口。

- [ ] **Step 2: 运行前端检查确认接口尚不存在**

Run: `PATH=/Users/jingling/.nvm/versions/node/v22.23.1/bin:$PATH npm run build`

Expected: PASS（这是新增前的基线）；记录没有 JS test runner，后续以 Rust 测试、TypeScript 构建和 Tauri 冒烟验证。

- [ ] **Step 3: 定义前端 Service 与稳定窗口目标**

在 `src/types/git.ts` 增加：

```ts
export type BranchCompareMode = "branch" | "localUpstream";
export interface GitBranchCompareOptions { base: string; target: string; }
export interface GitBranchFileDiffOptions extends GitBranchCompareOptions {
  filePath: string;
  maxBytes?: number;
  encoding?: string;
}
export interface GitBranchCompareResult { files: GitChangedFile[]; }
```

在 `git.branch-compare.ts` 仅使用 `invokeCommand`：

```ts
export async function getBranchCompare(repoPath: string, options: GitBranchCompareOptions): Promise<GitBranchCompareResult> {
  return invokeCommand<GitBranchCompareResult>("git_branch_compare", { path: repoPath, base: options.base, target: options.target });
}

export async function getBranchFileDiff(repoPath: string, options: GitBranchFileDiffOptions): Promise<GitDiffResult> {
  return invokeCommand<GitDiffResult>("git_branch_file_diff", { path: repoPath, base: options.base, target: options.target, filePath: options.filePath, maxBytes: options.maxBytes, encoding: options.encoding });
}
```

在 `branchCompareWindow.ts`，使用 `@tauri-apps/api/webviewWindow` 的 `WebviewWindow.getByLabel` 与 `new WebviewWindow`：先按 label 查询，已有窗口执行 `show()`、`setFocus()`；不存在时创建 `width: 1440, height: 900, minWidth: 960, minHeight: 640, title`。`createBranchCompareWindowTarget` 用固定的非加密 FNV-1a hash 生成只含小写十六进制的 label，URL 一律由 `URLSearchParams` 编码，不把仓库绝对路径放入 URL。

权限配置：

```json
// default.json：追加，供主窗口创建子窗口
"core:window:allow-create"
```

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "branch-compare",
  "description": "Read-only branch comparison windows",
  "windows": ["branch-compare-*"],
  "permissions": ["core:default"]
}
```

子窗口不获得 `fs:*`、`store:*`、`dialog:*`、`clipboard-manager:*`、`sql:*` 或任何写插件权限；该路由也不得导入写 Service。

- [ ] **Step 4: 运行类型检查与能力配置检查**

Run: `PATH=/Users/jingling/.nvm/versions/node/v22.23.1/bin:$PATH npm run build && cargo check --manifest-path src-tauri/Cargo.toml`

Expected: 两个命令均成功；Tauri 在 `cargo check` 中接受新增 capability JSON。

- [ ] **Step 5: 提交前端边界层**

```bash
git add src/types/git.ts src/services/git/git.branch-compare.ts src/services/git/index.ts src/services/window/branchCompareWindow.ts src-tauri/capabilities/default.json src-tauri/capabilities/branch-compare.json
git commit -m "feat(window): 支持打开只读分支比较窗口"
```

### Task 3: 独立路由与比较控制栏

**Files:**
- Create: `src/pages/BranchComparePage.tsx`
- Create: `src/components/git/BranchCompareWorkspace.tsx`
- Modify: `src/router/index.tsx`
- Modify: `src/i18n/locales/zh-CN.json`
- Modify: `src/i18n/locales/en.json`

**Interfaces:**
- Consumes: `projectService.list`, `listBranches(path, true)`, `BranchCompareMode`、Task 2 的类型。
- Produces: `/branch-compare?projectId=<id>&mode=branch|localUpstream&base=<ref>&target=<ref>` 独立页面；`BranchCompareWorkspace` 的 `onComparisonChange` 驱动后续数据刷新。

- [ ] **Step 1: 写入 URL 解析失败断言**

将页面参数解析抽到 `parseBranchCompareSearch(search: string)` 并覆盖：缺少 projectId、非法 mode 回退 `branch`、正常 ref 原样保留。

```ts
expect(parseBranchCompareSearch("?projectId=p1&mode=localUpstream&base=feat%2Fa")).toEqual({ projectId: "p1", mode: "localUpstream", base: "feat/a", target: "" });
expect(parseBranchCompareSearch("?mode=unknown")).toBeNull();
```

- [ ] **Step 2: 运行构建确认页面尚未接入**

Run: `PATH=/Users/jingling/.nvm/versions/node/v22.23.1/bin:$PATH npm run build`

Expected: PASS（路由尚未引用该页面），随后在实现后以路由加载冒烟验证。

- [ ] **Step 3: 实现无主壳页面与顶部控制栏**

`BranchComparePage` 只调用 `projectService.list()` 找到 URL 的 `projectId`，再并行调用 `listBranches(project.path, true)`；页面分别显示 loading、项目不存在和读取分支失败状态。不要调用 `openExisting`、`useRepoStore.loadAll` 或任何写操作。

在 `router/index.tsx` 让该路由位于 `AppLayout` 外：

```tsx
const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path="branch-compare" element={<BranchComparePage />} />
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="repo/:projectId" element={<RepoPage />} />
      </Route>
    </>,
  ),
);
```

`BranchCompareWorkspace` 顶栏严格使用既有 `SelectMenu`：模式为 `branch`/`localUpstream`，branch 模式两端选择包含本地与远程 ref；localUpstream 仅列 `isRemote === false` 的分支。当该模式选择 local 分支时，目标从该项 `upstream` 获得；无 upstream 则将目标设为空并显示 `branchCompare.noUpstream`，不猜测 `origin/<branch>`。交换按钮只在 branch 模式可用并交换 base/target；文件/提交 tab 使用可访问的 `role="tablist"`。

新增双语键（值需对应语言）：`branchCompare.title`、`modeBranch`、`modeLocalUpstream`、`source`、`target`、`swap`、`files`、`commits`、`loading`、`projectNotFound`、`loadFailed`、`noUpstream`、`readOnlyNotice`。

- [ ] **Step 4: 运行构建并手动路由冒烟**

Run: `PATH=/Users/jingling/.nvm/versions/node/v22.23.1/bin:$PATH npm run build`

Expected: PASS。

Run: `PATH=/Users/jingling/.nvm/versions/node/v22.23.1/bin:$PATH pnpm tauri dev`

Expected: 在已导入的项目中打开 `/branch-compare`；确认没有主工作区的变更、提交或分支写操作入口，branch/localUpstream 两种模式都能切换。

- [ ] **Step 5: 提交页面壳与控制栏**

```bash
git add src/pages/BranchComparePage.tsx src/components/git/BranchCompareWorkspace.tsx src/router/index.tsx src/i18n/locales/zh-CN.json src/i18n/locales/en.json
git commit -m "feat(diff): 增加分支比较窗口控制栏"
```

### Task 4: 文件列表与只读 Monaco Diff

**Files:**
- Create: `src/components/git/BranchCompareFileList.tsx`
- Create: `src/components/git/BranchCompareDiffPane.tsx`
- Modify: `src/components/git/BranchCompareWorkspace.tsx`
- Modify: `src/i18n/locales/zh-CN.json`
- Modify: `src/i18n/locales/en.json`

**Interfaces:**
- Consumes: `getBranchCompare`, `getBranchFileDiff`, `GitChangedFile`, `GitDiffResult`，以及既有 Monaco/Diff preview helpers。
- Produces: 文件模式完整三段布局，刷新后首个可见文件自动选中，二进制/截断/错误不保留旧 Diff。

- [ ] **Step 1: 写入纯数据失败断言**

在 `BranchCompareFileList.tsx` 导出 `filterBranchCompareFiles`、`summarizeBranchCompareFiles` 并覆盖：过滤大小写不敏感、统计新增/修改/删除、空关键词保留所有项。

```ts
const files = [{ path: "src/App.tsx", status: "M" }, { path: "docs/new.md", status: "A" }, { path: "old.ts", status: "D" }];
expect(filterBranchCompareFiles(files, "APP")).toEqual([files[0]]);
expect(summarizeBranchCompareFiles(files)).toEqual({ total: 3, added: 1, modified: 1, deleted: 1 });
```

- [ ] **Step 2: 运行构建确认导出尚不存在**

Run: `PATH=/Users/jingling/.nvm/versions/node/v22.23.1/bin:$PATH npm run build`

Expected: PASS（实现前没有消费者）；实现后由组件与构建检查验证。

- [ ] **Step 3: 实现文件请求、列表与 Diff 预览**

在工作区比较请求中使用递增序号，而非只有 boolean：

```ts
const requestId = ++comparisonRequestRef.current;
setFiles(null);
setSelectedPath(null);
void getBranchCompare(repoPath, { base, target }).then((result) => {
  if (requestId !== comparisonRequestRef.current) return;
  setFiles(result.files);
  setSelectedPath(result.files[0]?.path ?? null);
});
```

错误、无 target 或 mode 切换时递增请求号并清空文件与当前 Diff。`BranchCompareFileList` 使用 `MaterialFileIcon`、状态样式 util 与 `GitChangedFile` 的 additions/deletions 展示左侧统计、筛选输入、单选按钮列表；不允许文件编辑。

`BranchCompareDiffPane` 从现有 `CommitFileDiffPane` 提取**只读**的 Monaco 行为：`DiffEditor`、`Editor`、`DiffPreviewToolbar`、编码选择、单双栏、折叠未变更、hunk 导航和 `DiffSidePreview`。它只能调用 `getBranchFileDiff(repoPath, { base, target, filePath, encoding })`，并将 `options.readOnly: true` 写入 Monaco 配置。二进制时不挂载编辑器，仅显示 `repo.diffBinary` 和 patch 摘要；`truncated` 时显示 `repo.diffTruncated`。请求必须以独立 file request 序号保护，失败时 `setDiff(null)`。

新增双语键：`branchCompare.changedFiles`、`filterFiles`、`noFiles`、`loadFilesFailed`、`loadDiffFailed`、`fileCount`、`addedCount`、`modifiedCount`、`deletedCount`、`selectFile`。

- [ ] **Step 4: 运行构建与文件视图冒烟**

Run: `PATH=/Users/jingling/.nvm/versions/node/v22.23.1/bin:$PATH npm run build`

Expected: PASS。

Run: `PATH=/Users/jingling/.nvm/versions/node/v22.23.1/bin:$PATH pnpm tauri dev`

Expected: 选择两个存在差异的 ref 后，左栏数量、状态、增删行与 `git diff --name-status` 相符；切换文件显示实际只读双栏 Diff；二进制或大文件显示对应提示；快速切换没有旧文件覆盖新文件。

- [ ] **Step 5: 提交文件视图**

```bash
git add src/components/git/BranchCompareWorkspace.tsx src/components/git/BranchCompareFileList.tsx src/components/git/BranchCompareDiffPane.tsx src/i18n/locales/zh-CN.json src/i18n/locales/en.json
git commit -m "feat(diff): 支持分支文件差异预览"
```

### Task 5: 提交视图与 Agent 打开入口

**Files:**
- Create: `src/components/git/BranchCompareCommitList.tsx`
- Create: `src/components/git/BranchCompareCommitDetail.tsx`
- Modify: `src/components/git/BranchCompareWorkspace.tsx`
- Modify: `src/components/ai/AgentChatPanel.tsx`
- Modify: `src/components/git/BranchList.tsx`
- Modify: `src/components/git/BranchTree.tsx`
- Delete: `src/components/ai/AgentBranchComparisonDialog.tsx`
- Modify: `src/i18n/locales/zh-CN.json`
- Modify: `src/i18n/locales/en.json`

**Interfaces:**
- Consumes: `getLog(repoPath, { ref: \`${target}..${base}\`, limit: 100 })`、`getCommit(repoPath, id)`、`openBranchCompareWindow({ projectId, mode, base, target })`、既有 `CompareBranchesAction`。
- Produces: 双列独有提交浏览，点击后加载详情；聊天动作与分支树右键动作创建/聚焦子窗口而非 Dialog。

- [ ] **Step 1: 写入提交范围和 Agent 入口失败断言**

导出纯函数并覆盖两个方向不被写反：

```ts
expect(createCommitComparisonRefs("main", "feature")).toEqual({
  baseOnly: "feature..main",
  targetOnly: "main..feature",
});
```

为 `createBranchCompareWindowTarget` 覆盖同一 project/mode/ref 重复输入返回同 label，确保同一动作只聚焦一个窗口。

- [ ] **Step 2: 运行 Rust 与前端检查**

Run: `cargo test --manifest-path src-tauri/Cargo.toml && PATH=/Users/jingling/.nvm/versions/node/v22.23.1/bin:$PATH npm run build`

Expected: PASS，表明新提交视图未破坏此前数据契约。

- [ ] **Step 3: 实现提交视图和替换 Agent Dialog**

提交模式进入时并行读取：

```ts
const refs = createCommitComparisonRefs(base, target);
const [baseOnly, targetOnly] = await Promise.all([
  getLog(repoPath, { ref: refs.baseOnly, limit: 100 }),
  getLog(repoPath, { ref: refs.targetOnly, limit: 100 }),
]);
```

`BranchCompareCommitList` 必须以两列列出 shortId、subject、author、时间，空列显示空状态。选中条目后 `BranchCompareCommitDetail` 调用现有 `getCommit`，用标题、作者、正文、父提交和改动文件摘要展示，不提供 checkout、revert、cherry-pick、复制写入等操作。

`AgentChatPanel` 中保留 `branches` 集合校验；成功后：

```ts
void openBranchCompareWindow({ projectId, mode: "branch", base: action.base, target: action.target })
  .catch((error) => toast.error(toUserMessage(error) || t("agent.compareBranchesFailed")));
```

移除 `branchComparison` state、`AgentBranchComparisonDialog` import/render 和旧文件。`AgentRichMessage` 动作解析与按钮不改变，模型依旧只能表达 `compareBranches`。

扩展 `BranchContextActions`：

```ts
onCompareWithCurrent: (branch: GitBranch) => void;
```

`BranchList` 从 `status?.branch` 或 `branches.find((branch) => branch.isCurrent)?.name` 取得当前 ref。右键目标与当前 ref 相同、当前 ref 缺失时禁用菜单项；其他本地/远程分支均调用：

```ts
void openBranchCompareWindow({
  projectId,
  mode: "branch",
  base: currentBranch,
  target: branch.name,
}).catch((error) => toast.error(toUserMessage(error) || t("agent.compareBranchesFailed")));
```

`BranchTree` 在既有右键菜单“复制名称”前添加带 `GitCompareArrows` 图标的 `ContextMenuItem`，文案为 `repo.compareCurrentWithBranch`。这是只读入口，不改变 checkout、pull、push、rename 或 delete 的现有条件和行为。

新增双语键：`branchCompare.baseOnly`、`targetOnly`、`noUniqueCommits`、`loadCommitsFailed`、`commitDetailLoading`、`loadCommitFailed`、`selectCommit`；复用已有 `agent.compareBranchesUnavailable` / `agent.compareBranchesFailed`。

- [ ] **Step 4: 运行完整验证与交互冒烟**

Run: `cargo test --manifest-path src-tauri/Cargo.toml && PATH=/Users/jingling/.nvm/versions/node/v22.23.1/bin:$PATH npm run build`

Expected: 全部 PASS。

Run: `PATH=/Users/jingling/.nvm/versions/node/v22.23.1/bin:$PATH pnpm tauri dev`

Expected:
1. 点击聊天中的有效“比较 base 与 target”按钮，或右键非当前本地/远程分支后点击“比较当前分支与此分支”，创建一个 `branch-compare-*` 子窗口。
2. 再次点击同一 Agent 或右键动作时原窗口聚焦，不出现第二个窗口。
3. 文件/提交 tab 都显示真实数据；base/target、模式或文件改变会刷新内容。
4. localUpstream 选择无 upstream 的本地分支显示不可用状态。
5. 子窗口没有 Git 写按钮、工作区主面板、设置抽屉或写插件功能。

- [ ] **Step 5: 提交 Agent 与提交视图**

```bash
git add src/components/git/BranchCompareWorkspace.tsx src/components/git/BranchCompareCommitList.tsx src/components/git/BranchCompareCommitDetail.tsx src/components/ai/AgentChatPanel.tsx src/components/ai/AgentBranchComparisonDialog.tsx src/i18n/locales/zh-CN.json src/i18n/locales/en.json
git commit -m "feat(agent): 从对话打开只读分支比较窗口"
```

### Task 6: 交付前安全与质量回归

**Files:**
- Modify: `docs/product/feature-list.md`（仅在该文档已有对应 AI/分支比较条目时更新实际状态）
- Modify: `docs/api/git.md`（仅在该文档已有 Command 清单时补充两个只读 command 契约）

**Interfaces:**
- Consumes: 前五个任务完成的代码和既有产品/API 文档结构。
- Produces: 与代码一致的功能状态和 Git API 契约；可复现的验证结果。

- [ ] **Step 1: 检查文档锚点与差异范围**

Run: `rg -n "分支比较|branch compare|git_diff|git_log|Agent" docs/product/feature-list.md docs/api/git.md && git diff --check && git status --short`

Expected: 找到既有位置才编辑；`git diff --check` 无空白错误；没有无关文件进入待提交列表。

- [ ] **Step 2: 更新已存在的文档条目**

在已找到的 API 清单中写明：`git_branch_compare(path, base, target)` 返回 `files`，`git_branch_file_diff(path, base, target, filePath, maxBytes?, encoding?)` 返回 `GitDiffResult`；两者为只读且校验仓库根、ref、相对路径。功能清单如有 AI action / branch compare 条目，标记为“已实现”，并描述只读子窗口与两种模式；无对应条目则不创建虚假的重复文档章节。

- [ ] **Step 3: 执行最终自动检查**

Run: `cargo test --manifest-path src-tauri/Cargo.toml && PATH=/Users/jingling/.nvm/versions/node/v22.23.1/bin:$PATH npm run build && git diff --check`

Expected: 三个命令均以 exit code 0 结束。

- [ ] **Step 4: 执行最终运行时安全冒烟**

Run: `PATH=/Users/jingling/.nvm/versions/node/v22.23.1/bin:$PATH pnpm tauri dev`

Expected: 按 Task 5 的五项交互验证；另外检查 DevTools/代码路径：子窗口仅导入 `projectService`、`listBranches`、`getBranchCompare`、`getBranchFileDiff`、`getLog`、`getCommit`，不导入 `checkout`、`createBranch`、`deleteBranch`、`gitCommit`、`push`、`fetch` 或 Store 写 API。

- [ ] **Step 5: 提交文档与最终状态**

```bash
git add docs/product/feature-list.md docs/api/git.md
git commit -m "docs(git): 补充分支比较只读接口说明"
git status --short
```

Expected: 若文件没有相应既有条目则跳过本次空提交；最终仅保留用户原有的未相关改动（若存在），并在交付说明中明确。

## Self-Review

### Spec coverage

- 独立只读窗口与 Agent 动作入口：Task 2、3、5。
- branch 与 localUpstream 两种模式、任意本地分支自动上游及无上游空态：Task 3。
- 顶栏、文件/提交切换、侧栏、双栏 Monaco Diff：Task 3、4、5。
- 改动文件状态/统计、二进制、截断、竞态防护：Task 1、4。
- 双方向独有提交与详情：Task 5。
- 路径/ref/相对路径校验、参数数组 Git、无写 UI/插件权限：Task 1、2、6。
- 构建、Rust 测试、Tauri 运行时冒烟：每个任务与 Task 6。

### Placeholder scan

已检查本计划：每个任务都列出精确路径、接口、命令和验收输出；不存在未定义的后续步骤。

### Type consistency

`BranchCompareMode`、`GitBranchCompareOptions`、`GitBranchFileDiffOptions` 在 Task 2 定义，并在 Task 3–5 原样使用。Rust `GitBranchCompareResult` 序列化为前端同名类型的 `{ files }`；`GitDiffResult` 复用既有契约。
