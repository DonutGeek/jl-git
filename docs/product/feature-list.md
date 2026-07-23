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
| 外部打开仓库 | Done | 访达 / 资源管理器 / 文件管理器；编辑器与终端读取设置偏好（按平台选项） |
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
| 提交图（Graph） | Partial | 自研 SVG 铁路图（lane + 竖轨/斜线 + 三态节点）；`git_graph_commits` 未落地 |

## Tag

| 功能 | 状态 | 说明 |
|------|------|------|
| 列表 / 创建 / 删除 | Done | 支持轻量/附注标签、按标签查看历史、可选推送与本地删除 |

## Stash

| 功能 | 状态 | 说明 |
|------|------|------|
| 列表 / push / apply / pop / drop | Planned | |

## Merge / Rebase / Cherry Pick

| 功能 | 状态 | 说明 |
|------|------|------|
| Merge | Done | 含冲突检测 |
| Rebase | Planned | |
| Cherry-pick | Planned | |
| 冲突解决引导 | Done | 变更区聚焦、整文件/逐块解决、手动提交 |

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
| 主题 Light/Dark/System | Done | 设置抽屉 + 状态栏昼夜切换；默认跟随系统 |
| 应用主题与自定义配色 | Done | 6 套完整浅/深主题包；卡片、弹层、侧栏、选中态、图表、仓库分组、Monaco、Diff 与 Git 状态统一换肤并自动保存 |
| 设置抽屉 | Done | 分组：外观 / Git / SSH / 鲸灵 / 外部工具 / 数据 / 通用（多仓入口并入鲸灵） |
| 数据（路径/清理/备份） | Done | 显示路径与访达打开；按模块清理；完整 zip 备份导入导出 |
| 语言 | Done | 设置抽屉 + 状态栏中英文切换 |
| Git 全局身份 | Done | 设置内读写 user.name / user.email |
| SSH 密钥管理 | Done | 设置内生成（可选口令）/ 选择本地；列表展示路径与公钥；启用/禁用（至多一项启用）；可改私钥口令；仅「新增」删除时移除私钥与 .pub，导入仅取消登记；口令与私钥内容不进 Store |
| 客户端/编辑器字体 | Done | 设置内选择，CSS 变量应用 |
| 外部编辑器 / Shell | In Progress | 偏好已持久化；打开逻辑后续接路径 |
| 开机自启 | Done | 默认关闭；用户手动开启后经 autostart 写入系统启动项，启动时按偏好同步 |
| 自定义 Git 路径 | Planned | |

## AI

| 功能 | 状态 | 说明 |
|------|------|------|
| DeepSeek API Key | Done | 设置抽屉可创建、启用/禁用、编辑名称、删除；仅允许一个启用、删除二次确认，列表仅显示脱敏 Key，Tauri Store，不进 SQLite |
| DeepSeek 余额 | Done | 设置 → 鲸灵：`GET /user/balance`；刷新 + 浏览器打开充值页 |
| AI Git 指令 | Done | 可配置提交指令与拉取请求指令；提交指令已接入提交文案生成 |
| AI Commit Message | Done | 根据限长、脱敏后的暂存区 Diff 生成 Conventional Commit 文案，用户确认后提交 |
| 鲸灵对话入口 | Done | 左侧面板、虚拟消息列表、多对话标签、DeepSeek 流式回复；会话按项目隔离并写入 SQLite（含 reasoning）；删项目 CASCADE |
| 鲸灵（单仓/多仓） | Done | 同一套 Agent；默认专注 Git/仓库；简历与技能创建使用互相隔离的独立 Prompt；简历需用户主动声明作者身份后才只读匹配提交；技能创建生成可落盘 Skill 包内容但不直接写盘；会话按宿主分桶 |
| 鲸灵内容安全 | Done | 本地高置信度恶意请求门禁 + 全模式公共安全 Prompt；仓库内容按不可信数据处理；保留防御性安全与授权测试 |
| AI Diff Explain | Planned | |
| AI Review | Planned | |
| AI Branch Naming | Planned | |
| AI Release Notes | Planned | |
| AI 历史 | Planned | SQLite |

## Application Shell

| 功能 | 状态 | 说明 |
|------|------|------|
| Tauri 窗口壳 | Done | 三端：mac Overlay；Win/Linux 系统原生标题栏（`tauri.{macos,windows,linux}.conf.json`） |
| 插件预置 | Done | SQL/Store/Dialog/FS/Notification/Updater/Clipboard/Log/Opener |
| 底部状态栏 | Done | 版本 / 主题 / 磁盘 / Git 身份 / 操作日志入口 |
| 应用线上升级 | Done | GitHub Releases + updater；状态栏「更新」检查/下载/重启；需 CI 配置签名私钥 |
| Git 操作日志 | Done | 后台记录命令明细；面板由用户手动打开；状态栏图标反映最近结果 |
| 文档体系 | Done | 本仓库 docs |
| shadcn Button 起步 | In Progress | |
| 示例 greet Command | In Progress | 将被业务 Command 替换 |

---

## 维护规则

- 功能合并到 `main` 且可用 → 标 **Done**
- 开始开发 → **In Progress**
- 仅改状态时，可在同一 PR 更新本表
- 版本切片以 [roadmap](roadmap.md) 为准，本表跟踪细项
