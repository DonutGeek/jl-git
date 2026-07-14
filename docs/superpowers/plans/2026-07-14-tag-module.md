# 标签模块 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为仓库工作区提供可浏览、创建、推送与删除本地 Git 标签的标签侧栏模块。

**Architecture:** Rust 新增受路径与 ref 校验保护的标签领域模块，Command 层将其封装为 Tauri 调用；前端只经 `src/services/git/git.tag.ts` 访问。`useRepoStore` 缓存标签和当前历史 ref，`TagList` 负责侧栏局部交互，选择标签通过 store 将主区历史限制到对应 ref。

**Tech Stack:** Tauri 2、Rust、Git CLI 参数数组、React 19、TypeScript strict、Zustand、Tailwind CSS 4、shadcn/ui、lucide-react、i18next。

## Global Constraints

- UI 不得直接调用 `invoke`，所有 Git 调用经 `src/services/git`。
- Git 与文件系统操作只能在 Rust 侧，用户输入绝不拼接 shell。
- UI 图标仅使用 `lucide-react`，颜色、间距与状态使用现有 Design Tokens / Tailwind 语义类。
- 所有用户可见文案同时加入 `zh-CN` 与 `en` i18n 资源。
- 不新增依赖、不引入第二套状态库、不修改未请求功能。
- 不改变用户现有工作区改动；每个任务只暂存该任务涉及文件。

## File Structure

- Create `src-tauri/src/git/tag.rs`：标签 DTO、Git CLI 调用、解析和 Rust 单测。
- Create `src/services/git/git.tag.ts`：标签 Command 的类型安全 Service 包装。
- Create `src/components/git/TagList.tsx`：标签侧栏列表、筛选、刷新、选择与删除确认。
- Create `src/components/git/CreateTagDialog.tsx`：创建标签表单和提交状态。
- Modify `src-tauri/src/git/mod.rs`、`src-tauri/src/commands/git_ops.rs`、`src-tauri/src/lib.rs`：注册与暴露 Command。
- Modify `src/types/git.ts`、`src/services/git/index.ts`、`src/store/useRepoStore.ts`：标签数据和带 ref 的历史加载。
- Modify `src/components/layout/ActivityBar.tsx`、`src/pages/RepoPage.tsx`：活动栏入口、侧栏渲染和标签选择的历史切换。
- Modify `src/i18n/locales/zh-CN.json`、`src/i18n/locales/en.json`、`docs/architecture/command.md`、`docs/api/git.md`、`docs/product/feature-list.md`：双语文案与契约/功能状态。

---

### Task 1: Rust 标签领域与 Command 契约

**Files:**
- Create: `src-tauri/src/git/tag.rs`
- Modify: `src-tauri/src/git/mod.rs`
- Modify: `src-tauri/src/commands/git_ops.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `docs/architecture/command.md`

**Interfaces:**
- Produces `GitTag { name: String, target: String, message: Option<String> }`。
- Produces `list_tags(&Path) -> Result<Vec<GitTag>, AppError>`、`create_tag(&Path, &str, Option<&str>, Option<&str>) -> Result<(), AppError>`、`delete_tag(&Path, &str) -> Result<(), AppError>`、`push_tag(&Path, &str, &str) -> Result<(), AppError>`。
- Produces Commands `git_tags`、`git_tag_create(path, name, message?, ref?, push?, remote?)`、`git_tag_delete`。

- [ ] **Step 1: 写入失败的 Rust 测试**

在 `src-tauri/src/git/tag.rs` 先定义下列测试，不实现解析器：

```rust
#[test]
fn parses_annotated_and_lightweight_tags() {
    let tags = parse_tags("v1.0.0\0abc123\0Release one\nv1.1.0\0def456\0\n");
    assert_eq!(tags.len(), 2);
    assert_eq!(tags[0].name, "v1.0.0");
    assert_eq!(tags[0].message.as_deref(), Some("Release one"));
    assert_eq!(tags[1].message, None);
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd src-tauri && cargo test git::tag::tests::parses_annotated_and_lightweight_tags`

Expected: FAIL，因为 `git::tag` 模块和 `parse_tags` 尚不存在。

- [ ] **Step 3: 最小实现标签领域模块**

实现以下安全调用：

```rust
runner::run_git(repo_path, &[
  "for-each-ref",
  "--format=%(refname:short)%00%(objectname)%00%(contents:subject)",
  "refs/tags",
])
```

用 NUL 字段解析行，忽略空名称；创建前 `validate_git_ref(name)` 和可选 `ref`，并执行：

```rust
// 无 message: ["tag", "--", name, ref]
// 有 message: ["tag", "-a", "-m", message, "--", name, ref]
```

`ref` 缺省时不要传入，让 Git 使用 `HEAD`。删除使用 `git tag -d -- <name>`。推送前分别校验 remote 和 name，使用带 180 秒超时的 `git push --progress <remote> refs/tags/<name>`；将 refspec 组装在 Rust 内部，而不是 shell。

- [ ] **Step 4: 注册 Command 并保留操作日志**

在 `git_ops.rs` 增加返回 `{ tags }` 的 DTO 和三个 Command。创建与删除使用 `tauri::async_runtime::spawn_blocking` + `oplog::run_logged`；创建先调用 `tag::create_tag`，仅在 `push == true` 时调用 `tag::push_tag`。`remote` 由前端明确传入，Command 不推断远端。

在 `lib.rs` 的 `generate_handler!` 中注册三个 Command，在 `git/mod.rs` 导出 `pub mod tag;`。在 `docs/architecture/command.md` 将实际输入、输出、远端推送的“本地成功/推送失败”语义写入 `git_tags` 和 `git_tag_*` 小节。

- [ ] **Step 5: 运行 Rust 测试确认通过**

Run: `cd src-tauri && cargo test git::tag::tests && cargo test commands::git_ops::tests`

Expected: PASS，新增解析测试通过，既有 Command helper 测试仍通过。

- [ ] **Step 6: 提交 Rust 契约**

```bash
git add src-tauri/src/git/tag.rs src-tauri/src/git/mod.rs src-tauri/src/commands/git_ops.rs src-tauri/src/lib.rs docs/architecture/command.md
git commit -m "feat(git): 支持标签命令"
```

### Task 2: 前端类型、Service 与仓库状态

**Files:**
- Create: `src/services/git/git.tag.ts`
- Modify: `src/types/git.ts`
- Modify: `src/services/git/index.ts`
- Modify: `src/store/useRepoStore.ts`
- Modify: `docs/api/git.md`

**Interfaces:**
- Consumes Task 1 的 Command。
- Produces `GitTag`、`GitTagsResult`、`GitCreateTagOptions` 与 `listTags`、`createTag`、`deleteTag`。
- Produces store state `tags: GitTag[]`、`logRef: string | null` 与 actions `refreshTags()`、`selectLogRef(ref: string | null)`、`createTag(options)`、`deleteTag(name)`。

- [ ] **Step 1: 写入类型驱动的失败检查**

先在 `git.tag.ts` 写入 Service 调用和其精确返回类型，但暂不导出 `GitTag`、`GitTagsResult` 或将 `git.tag` 加入聚合导出。执行类型检查必须因缺失类型/导出失败。

- [ ] **Step 2: 运行类型检查确认失败**

Run: `pnpm exec tsc --noEmit`

Expected: FAIL，错误指向缺失的标签类型或 Service 导出。

- [ ] **Step 3: 实现类型、Service 与 store 更新**

在 `src/types/git.ts` 定义：

```ts
export interface GitTag { name: string; target: string; message?: string; }
export interface GitTagsResult { tags: GitTag[]; }
export interface GitCreateTagOptions { name: string; message?: string; ref?: string; push?: boolean; remote?: string; }
```

`git.tag.ts` 用 `invokeCommand` 映射三个 Command，不捕获错误。`useRepoStore` 在 `loadAll` 用 `Promise.all` 同时加载 tags；会话快照保存 tags 和 `logRef`。`refreshLog(reset)` 将 `get().logRef` 传给 `gitService.getLog`；`loadMoreLog()` 保持同一个 ref。`selectLogRef` 清空提交/文件选中、设置 ref 后调用 `refreshLog(true)`。创建或删除标签后刷新 tags；创建成功后同步刷新当前日志。无任何 selector 以 `?? []` 返回新数组。

在 `index.ts` 既导出模块成员也放入 `gitService` 对象；在 `docs/api/git.md` 加入参数与返回值说明。

- [ ] **Step 4: 运行类型检查确认通过**

Run: `pnpm exec tsc --noEmit`

Expected: PASS。

- [ ] **Step 5: 提交前端数据层**

```bash
git add src/types/git.ts src/services/git/git.tag.ts src/services/git/index.ts src/store/useRepoStore.ts docs/api/git.md
git commit -m "feat(tags): 接入标签数据服务"
```

### Task 3: 标签侧栏与创建弹窗

**Files:**
- Create: `src/components/git/TagList.tsx`
- Create: `src/components/git/CreateTagDialog.tsx`
- Modify: `src/i18n/locales/zh-CN.json`
- Modify: `src/i18n/locales/en.json`

**Interfaces:**
- Consumes Task 2 的 `tags`、`commits`、`status`、`remotes` 和标签 actions。
- Produces `TagListProps { onSelectTag: () => void }`，以便页面切换主历史视图。

- [ ] **Step 1: 写入初始组件骨架并确认类型失败**

先创建 `TagList`，令它调用未声明的 `createTag`、`deleteTag`、`selectLogRef` 与 `listRemotes`。创建弹窗 Props 固定为：

```ts
interface CreateTagDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}
```

- [ ] **Step 2: 运行类型检查确认失败**

Run: `pnpm exec tsc --noEmit`

Expected: FAIL，错误只来自尚未完成的标签 UI 接线。

- [ ] **Step 3: 最小实现侧栏交互**

复用 `BranchList` 的头部、`Input`、`ScrollArea`、Tooltip 和 `Dialog` 语义样式。`TagList`：

- 使用 `Tag`、`Plus`、`RefreshCw`、`Trash2` 图标；每个图标按钮有 i18n `aria-label` 和 Tooltip。
- 本地 `filter` 用 `useMemo` 按小写标签名筛选，不新建全局状态。
- 点击行调用 `selectLogRef(tag.name)`，等待成功后再调用 `onSelectTag()`；选中行使用 `bg-primary/15`。
- 显示标签名、可选附注信息；空/无匹配/加载失败都有文案。
- 删除确认框仅执行 `deleteTag(name)`；忙碌时禁用取消外操作，成功后 toast。

`CreateTagDialog` 读取已加载 `commits` 与 `status?.branch`；基准默认空（Command 使用 HEAD），下拉选项为 `HEAD` 和提交的 `shortId · subject`。表单名称 `trim()` 为空时禁用提交；message 空字符串转 `undefined`。弹窗初始化时 `listRemotes(repoPath)`，以 `origin` 优先、否则第一个远端确定目标；没有远端则禁用推送 checkbox 并显示 `tagPushUnavailable`。提交后调用 `createTag({ name, message, ref, push, remote })`，成功关闭弹窗、toast、调用 `onCreated`；失败保留输入并以表单内 `role="alert"` 展示 `toUserMessage(error)`。

两份 i18n 新增完全对应的 `tags`、`tagsEmpty`、`tagsNoMatch`、`newTag`、`createTagTitle`、`tagName`、`tagMessage`、`tagBasedOn`、`tagCurrentHead`、`pushTag`、`tagPushUnavailable`、`createTagSuccess`、`deleteTagTitle`、`deleteTagQuestion`、`deleteTagSuccess` 文案。

- [ ] **Step 4: 运行类型检查确认通过**

Run: `pnpm exec tsc --noEmit`

Expected: PASS。

- [ ] **Step 5: 提交标签 UI**

```bash
git add src/components/git/TagList.tsx src/components/git/CreateTagDialog.tsx src/i18n/locales/zh-CN.json src/i18n/locales/en.json
git commit -m "feat(tags): 新增标签侧栏与创建弹窗"
```

### Task 4: 活动栏接线、文档与冒烟

**Files:**
- Modify: `src/components/layout/ActivityBar.tsx`
- Modify: `src/pages/RepoPage.tsx`
- Modify: `docs/product/feature-list.md`

**Interfaces:**
- Consumes Task 3 的 `<TagList onSelectTag={...} />`。
- Produces可从活动栏访问的 `SidebarView = "files" | "branches" | "tags" | "agent"`。

- [ ] **Step 1: 写入活动栏接线并确认类型失败**

先在 `ActivityBar` 的 `ITEMS` 加 `{ id: "tags", icon: Tag, labelKey: "repo.tags" }`，并在 `RepoPage` 引入但暂不渲染 `TagList`。此时 Props 未满足，类型检查应失败。

- [ ] **Step 2: 运行类型检查确认失败**

Run: `pnpm exec tsc --noEmit`

Expected: FAIL，错误提示 `TagList` 未被正确渲染或 Props 缺失。

- [ ] **Step 3: 完成页面接线和功能文档**

在 `RepoPage` 的 sidebar 中，`sidebarView === "tags"` 时渲染：

```tsx
<TagList onSelectTag={() => handleMainViewChange("history")} />
```

仅通过既有 `handleMainViewChange` 切换主区，不新增路由、持久化布局 key 或平行历史状态。活动栏保留现有所有 Tooltip 和键盘语义。`feature-list.md` 标为 Done，并说明范围是浏览、创建（附注/轻量）、可选推送、删除本地标签。

- [ ] **Step 4: 运行完整静态验证**

Run: `pnpm exec tsc --noEmit && pnpm build && cd src-tauri && cargo test`

Expected: 所有命令 exit 0。

- [ ] **Step 5: 桌面端运行时冒烟**

Run: `pnpm tauri dev`

在已打开仓库中完成：点击标签活动栏、确认 Tooltip；筛选/清空标签；选择一个标签且历史列表范围变化；以 HEAD 创建轻量标签；以一个提交和信息创建附注标签；在测试远端勾选推送；删除一个本地测试标签；切换仓库标签后返回确认壳层不闪白、标签选择不串仓。记录任何 S0/S1/S2，S0/S1 必须在交付前修复。

- [ ] **Step 6: 提交接线与文档**

```bash
git add src/components/layout/ActivityBar.tsx src/pages/RepoPage.tsx docs/product/feature-list.md
git commit -m "feat(tags): 接入仓库标签模块"
```

## Plan Self-Review

- Spec coverage: Task 1 覆盖安全 Git Command、Task 2 覆盖 Service 与 scoped history、Task 3 覆盖浏览/创建/删除/错误/i18n、Task 4 覆盖入口、文档与运行时验收。
- 完整性检查：所有写操作均给出具体接口、命令或验证方式，没有未定义的实施步骤。
- Type consistency: `GitTag`、`GitCreateTagOptions`、`selectLogRef`、`CreateTagDialogProps` 和 `TagListProps` 由前序任务定义并在后续任务按同名使用。
