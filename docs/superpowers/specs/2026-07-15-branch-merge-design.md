# 分支合并功能设计

## 目标

在分支树的右键菜单中提供“合并源分支到当前分支”操作。用户可选择常用合并策略和自动储藏；操作完成后可在既有操作日志中查看实际 Git 输出。

本功能负责发起合并和展示结果。发生冲突时保留 Git 的冲突现场；冲突解决 UI（预览、整文件/逐块采用、标记已解决）见后续「合并冲突检测与解决」实现，用户解决后手动提交，不自动 `merge --abort` / 自动 commit。

## 用户界面

对任意非当前的本地或远程分支，右键菜单增加“合并 `<source>` 到 `<current>`”。`<current>` 取已检出的本地分支；当前分支、未加载当前分支或应用正在执行 Git 写操作时，该菜单项禁用。

点击后打开合并确认弹窗：

1. 标题和主按钮均显示源分支与目标（当前）分支，避免合并方向歧义。
2. 合并方式以下拉框选择，默认使用 Git 默认行为。
3. 提供“自动储藏并恢复”复选框。
4. 提交期间禁用关闭、策略切换和重复提交，按钮展示进行中状态。

支持的合并方式与 Git 参数映射如下：

| 方式 | Git 参数 |
| --- | --- |
| 默认 | 无额外参数 |
| 非快进 | `--no-ff` |
| 压缩 | `--squash` |
| Resolve | `-s resolve` |
| 自动选择 | `-s ort` |
| 不自动提交 | `--no-commit` |

“自动储藏并恢复”映射为 `--autostash`。压缩合并不组合该参数，因为 Git 不允许 `--squash` 与 `--commit` / `--no-commit` 组合，且自动储藏的提交时机不适用于该模式；界面会禁用该复选项并说明原因。

## 分层与数据流

调用链遵循项目既有 Git 分层：

```text
BranchList / MergeBranchDialog
  → useRepoStore.merge
  → gitService.merge
  → git_merge Command
  → git::merge::merge
  → git CLI
```

新增前端 Service `src/services/git/git.merge.ts`，新增 Store `merge(source, options)` 动作；Store 在调用前展开操作日志，之后刷新 status、branches 和历史。

新增 Rust 模块 `src-tauri/src/git/merge.rs`，并在 `git_ops.rs` 注册异步 `git_merge` Command。Command 复用仓库根目录规范化与 `validate_git_ref`，通过 `oplog::run_logged(..., "merge", ...)` 执行。所有 Git 调用以参数数组传递，绝不拼接 shell。

命令契约：

```ts
interface GitMergeOptions {
  mode?: "default" | "noFf" | "squash" | "resolve" | "ort" | "noCommit";
  autostash?: boolean;
}

interface GitMergeResult {
  ok: boolean;
  conflict: boolean;
}
```

## 结果与错误处理

Rust 根据 Git 退出状态区分成功、冲突和普通失败：

- 成功：返回 `{ ok: true, conflict: false }`。
- 冲突：检测未合并条目后返回 `{ ok: false, conflict: true }`，不执行 `git merge --abort`。
- 其他失败：保留领域错误；操作日志记录安全的命令参数与 Git 输出。

前端对成功显示完成提示；对冲突显示明确提示，指引用户到变更区解决。两种结果都刷新 status、branches 和历史，以反映冲突条目、已生成的合并提交或未提交的压缩合并结果。普通失败不把错误伪装成成功，但仍保留操作日志供诊断。

操作日志新增 `merge` 标签和中英文文案，复用已有实时事件、展开、复制和状态栏展示能力。

## 验收标准

1. 非当前本地或远程分支的右键菜单可打开合并确认弹窗，方向始终为“源分支到当前本地分支”。
2. 用户可执行默认、非快进、压缩、Resolve、自动选择和不自动提交六种方式；参数映射准确且以数组传递。
3. 自动储藏可用时传递 `--autostash`；压缩合并时不可选择且有解释。
4. 合并成功后刷新状态、分支和历史，并在操作日志中显示合并过程。
5. 冲突不会被报告为成功，也不会自动中止；变更区可看到 Git 冲突状态，用户获得解决提示。
6. ref 与仓库路径都在 Rust 侧校验；不存在前端直连 `invoke` 或 shell 拼接。
7. 相关前端类型检查、Rust 测试及生产构建通过。
