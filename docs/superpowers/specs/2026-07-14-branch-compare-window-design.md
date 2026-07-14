# 分支比较子窗口设计

## 目标

为 Agent 增加只读 `openBranchComparison` UI Tool。用户点击聊天中的比较动作后，应用创建或聚焦独立 Tauri 子窗口，展示两个 Git ref 的文件差异与提交差异。

该窗口只读取仓库信息，不提供创建、删除、切换、合并、提交、推送等 Git 写操作。

## 用户界面

窗口采用三段布局：

1. 顶部控制栏：比较模式、源 ref、源/目标交换、目标 ref，以及“文件 / 提交”视图切换。
2. 左侧导航：文件视图时显示变更统计、过滤输入和变更文件列表；提交视图时显示两个方向各自独有的提交列表。
3. 右侧内容：文件视图显示源/目标分支名称及 Monaco 双栏 Diff；提交视图显示选中提交的现有提交详情内容。

比较模式：

- `branch`：源和目标均可选择本地或远程 ref。
- `localUpstream`：用户选择任意本地分支，应用解析其 tracking upstream 作为目标；没有 upstream 时显示空状态，不推测远程 ref。

在任意模式下修改 ref 只刷新该窗口数据，不改变主窗口的检出分支或工作区。

## Agent Tool 与窗口创建

模型只可输出 `compareBranches` 动作标记。前端解析后：

1. 验证 base 与 target 在当前仓库已加载分支中存在。
2. 以项目 ID、模式和 ref 创建稳定窗口标签；同一比较已存在时聚焦窗口而非重复创建。
3. 子窗口 URL 只传项目 ID、模式和 ref；子窗口自行通过 ProjectService 获取项目路径。

Tool 仅打开只读 UI，不直接运行写操作，也不允许模型传入任意命令。

## Git 数据契约

新增只读 Command：

| Command | 输入 | 输出 |
| --- | --- | --- |
| `git_branch_compare` | `{ path, base, target }` | `{ files: GitChangedFile[] }` |
| `git_branch_file_diff` | `{ path, base, target, filePath, maxBytes?, encoding? }` | `GitDiffResult` |

`git_branch_compare` 使用参数数组调用 Git，合并 `--name-status` 与 `--numstat` 结果为现有 `GitChangedFile` DTO。`git_branch_file_diff` 读取 `<base>:<path>` 与 `<target>:<path>` blob，并返回受限长度的 patch、左右文本、二进制与截断标识。

两个 Command 均复用现有仓库路径规范化、Git ref 校验和仓库相对路径校验。前端只通过 `src/services/git` 调用它们。

提交视图不新增 Command：复用现有 `git_log`，分别读取 `base..target` 与 `target..base`。

## 前端结构

新增：

- `src/pages/BranchComparePage.tsx`：子窗口路由与项目加载。
- `src/components/git/BranchCompareWorkspace.tsx`：模式、ref、视图和选中项的局部状态。
- `src/components/git/BranchCompareFileList.tsx`：文件统计、筛选与选择。
- `src/components/git/BranchCompareDiffPane.tsx`：复用 Monaco Diff 工具栏与双栏编辑器。
- `src/services/git/git.branch-compare.ts`：两个只读 Command 的 Service 封装。
- `src/services/window/branchCompareWindow.ts`：窗口创建/聚焦与参数编码。

复用：

- `DiffPreviewToolbar`、`DiffSidePreview`、`monacoPreviewShared`。
- `git_log`、`git_branches`、ProjectService。

聊天层保留动作解析和分支存在校验，但把当前内嵌比较 Dialog 替换为窗口服务调用。

## Tauri 权限与路由

新增 `branch-compare-*` capability，只授予：

- `core:default` 与窗口关闭/最小化所需的 core window 权限；
- 自定义只读 Git Command 调用；
- 项目列表读取所需权限。

不授予文件系统写、对话框、Store 写、剪贴板写或 Git 写 Command 的额外能力。

路由新增 `branch-compare`，从 URL 参数读取项目 ID、模式和初始 refs；参数缺失、项目不存在或 ref 不存在时显示明确错误状态。

## 错误与性能

- ref 无效、仓库不可用、Diff 读取失败：显示领域错误，不保留过期 Diff。
- 二进制文件：显示二进制提示和可用 patch 摘要，不渲染文本编辑器。
- 大文件：沿用 `maxBytes` 截断，显示截断提示。
- 切换 ref 或文件时使用请求序号避免旧请求覆盖新选择。
- 文件列表与提交列表限制初始数量；必要时后续增加虚拟滚动。

## 验收标准

1. 聊天中的有效 `compareBranches` 动作可创建或聚焦独立只读窗口。
2. 分支比较模式可选择任意本地和远程 ref，并可交换两端。
3. 本地相对远程模式可选择任意本地分支，并使用其 upstream；无 upstream 时显示空状态。
4. 文件视图展示真实状态、增删行与可筛选文件列表；选择文件后展示实际双栏 Diff。
5. 提交视图展示两个方向各自独有的提交。
6. 窗口中没有 Git 写操作入口，Rust Command 与前端均校验路径、ref 与文件路径。
7. 前端类型检查、生产构建和相关 Rust 测试通过。
