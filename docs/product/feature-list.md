# 功能清单

> **相关文档：** [roadmap](roadmap.md) · [releases](releases.md) · [command](../architecture/command.md)

状态定义：

| 状态 | 含义 |
|------|------|
| **Planned** | 已设计进架构/契约，尚未实现 |
| **In Progress** | 开发中或部分可用 |
| **Done** | 已实现且达到可用性标准 |

当前整体处于 **v0.1 脚手架**：应用壳与文档 In Progress / Done，业务功能多为 Planned。

---

## Dashboard

| 功能 | 状态 | 说明 |
|------|------|------|
| 项目列表 | Done | 来自 SQLite |
| 添加本地仓库 | Done | 目录选择 + 校验 |
| 最近打开 | Done | |
| 收藏 / 置顶 | Planned | |
| 顶栏仓库标签切换 | Done | 会话标签；× 关闭；+ 打开；localStorage 持久化 |
| 工作区切换 | In Progress | 工具栏三视图骨架：工作区浏览器 / 变更预览占位 / 历史详情占位 |
| 空状态引导 | Done | |

## Projects

| 功能 | 状态 | 说明 |
|------|------|------|
| 导入已有 Git 仓库 | Planned | |
| 重命名显示名 | Planned | 不改文件夹名 |
| 从应用移除 | Planned | 不删磁盘 |
| 打开失败修复 | Planned | 路径失效 |

## Repository

| 功能 | 状态 | 说明 |
|------|------|------|
| 打开仓库工作区 | Done | 路由 `/repo/:id` |
| 顶栏二级工具条 | Done | 仓库切换 / 工作区·变更·历史 / 分支 / 同步占位 |
| 主区三视图骨架 | In Progress | 工作区可浏览目录；变更/历史右侧为占位，Diff/详情未接 |
| 外部打开仓库 | Done | Finder / 终端已可用；外部编辑器依赖本机应用 |
| 侧栏活动栏（目录树 / 分支 / Agent） | Done | 最左图标栏切换；Agent 对话列表使用虚拟滚动 |
| 目录树 | Done | 懒加载；叠加 status 字母 |
| 显示当前分支 / ahead-behind | In Progress | 已显示当前分支；ahead/behind 未在 UI 呈现 |
| 刷新 status | Done | stage/unstage/commit/checkout 后自动刷新 |
| Detached HEAD 提示 | Done | 顶栏文案提示 |

## Branch

| 功能 | 状态 | 说明 |
|------|------|------|
| 列出本地/远程分支 | Done | 左栏本地/远端分支树，远端按 remote 名分组 |
| 创建分支 | Done | 弹窗选基线分支；默认 checkout |
| 切换分支 | Done | |
| 删除分支 | Planned | 确认 |
| 上游跟踪信息 | Planned | |

## Commit

| 功能 | 状态 | 说明 |
|------|------|------|
| 查看更改列表 | Done | 未暂存/已暂存拆分展示 |
| Stage / Unstage 文件 | Done | |
| Stage all | Done | 含全部取消暂存 |
| 编写并提交 message | Done | |
| Amend（可选） | Planned | 谨慎默认 |
| 丢弃更改 | Planned | 二次确认 |

## Diff

| 功能 | 状态 | 说明 |
|------|------|------|
| 工作区/暂存 Diff | Done | 变更 / 待提交选中后右侧预览 |
| 提交间 Diff | Planned | |
| 大文件截断 | Done | `truncated` + 提示 |
| 二进制提示 | Done | |
| Monaco / diff view | Done | `@monaco-editor/react` DiffEditor 左右对比 |

## History

| 功能 | 状态 | 说明 |
|------|------|------|
| 分页提交日志 | Done | 「加载更多」skip/limit |
| 提交详情 | Planned | |
| 提交图（Graph） | Planned | `@gitgraph/react` 等 |

## Tag

| 功能 | 状态 | 说明 |
|------|------|------|
| 列表 / 创建 / 删除 | Planned | |

## Stash

| 功能 | 状态 | 说明 |
|------|------|------|
| 列表 / push / apply / pop / drop | Planned | |

## Merge / Rebase / Cherry Pick

| 功能 | 状态 | 说明 |
|------|------|------|
| Merge | Planned | 冲突状态展示 |
| Rebase | Planned | |
| Cherry-pick | Planned | |
| 冲突解决引导 | Planned | 可外开编辑器 |

## Worktree

| 功能 | 状态 | 说明 |
|------|------|------|
| 列表 / 添加 / 移除 | Planned | |

## Remote Sync

| 功能 | 状态 | 说明 |
|------|------|------|
| Fetch | Done | 工具栏「检查更新」：fetch --prune（默认 origin） |
| Pull | Done | 工具栏「更新」：pull --recurse-submodules（origin + 当前分支） |
| Push | Done | 提交区「推送到远程」勾选；工具栏推送按钮仍可后续接入 |
| Force push（受保护） | Planned | |

## Settings

| 功能 | 状态 | 说明 |
|------|------|------|
| 主题 Light/Dark/System | Done | 设置抽屉 + 状态栏昼夜切换 |
| 设置抽屉 | Done | 分组：外观 / Git / SSH / 外部工具 / 通用 |
| 语言 | Done | 设置抽屉 + 状态栏中英文切换 |
| Git 全局身份 | Done | 设置内读写 user.name / user.email |
| SSH 密钥管理 | Planned | 设置内 UI 占位（新增 / 选择本地） |
| 客户端/编辑器字体 | Done | 设置内选择，CSS 变量应用 |
| 外部编辑器 / Shell | In Progress | 偏好已持久化；打开逻辑后续接路径 |
| 开机自启 | In Progress | 偏好已持久化；待接 autostart 插件 |
| 自定义 Git 路径 | Planned | |

## AI

| 功能 | 状态 | 说明 |
|------|------|------|
| DeepSeek API Key | Done | 设置抽屉可创建、启用/禁用、编辑名称、删除；仅允许一个启用、删除二次确认，列表仅显示脱敏 Key，Tauri Store，不进 SQLite |
| AI Git 指令 | Done | 可配置提交指令与拉取请求指令；提交指令已接入提交文案生成 |
| AI Commit Message | Done | 根据限长、脱敏后的暂存区 Diff 生成 Conventional Commit 文案，用户确认后提交 |
| 鲸灵对话入口 | In Progress | 左侧面板、虚拟消息列表、多对话标签和 DeepSeek 流式回复已就绪；会话按项目 ID 隔离并仅在当前应用会话中保留，仓库上下文后续接入 |
| AI Diff Explain | Planned | |
| AI Review | Planned | |
| AI Branch Naming | Planned | |
| AI Release Notes | Planned | |
| AI 历史 | Planned | SQLite |

## Application Shell

| 功能 | 状态 | 说明 |
|------|------|------|
| Tauri 窗口壳 | In Progress | 默认窗口配置 |
| 插件预置 | Done | SQL/Store/Dialog/FS/Notification/Updater/Clipboard/Log/Opener |
| 底部状态栏 | Done | 版本 / 主题 / 磁盘 / Git 身份 / 操作日志入口 |
| Git 操作日志 | Done | 提交/检查更新/推送；可展开命令明细；图标反映最近结果 |
| 文档体系 | Done | 本仓库 docs |
| shadcn Button 起步 | In Progress | |
| 示例 greet Command | In Progress | 将被业务 Command 替换 |

---

## 维护规则

- 功能合并到 `main` 且可用 → 标 **Done**
- 开始开发 → **In Progress**
- 仅改状态时，可在同一 PR 更新本表
- 版本切片以 [roadmap](roadmap.md) 为准，本表跟踪细项
