# 简历帮（Jinglü）— 设计文档（MVP）

## 背景

在 JLGit 设置中增加「简历帮」：打开独立 Agent 子窗，基于**应用内全部已登记仓库**的只读 Git 画像，通过对话追问个人信息，产出以**项目经历**为核心的技术简历 Markdown（项目做什么 / 技术栈 / 用技术解决了什么问题）。不写目标岗位或求职意向。Boss 直聘仅作模块结构粗参考，不做 UI/字段像素级对齐。

## 决策摘要

| 项 | 选择 |
|----|------|
| 入口 | 设置左侧「简历帮」→ 打开/聚焦子窗 |
| 项目范围 | 全部已登记仓库（`project_list`） |
| 身份 | 设置「简历帮」可持久化配置（姓名、手机、邮箱、Git 名/邮箱）；对话仅补缺失项 |
| UI | 仅对话 + Markdown 简历正文（可复制） |
| AI | 复用鲸灵 API Key；**独立** prompt / 流式服务，不复用 commit / 仓库 Agent 提示词 |
| 窗体 | 单例 Webview 子窗，对齐分支管理壳 |

## 非目标（MVP）

- Boss 直聘样式预览板、可编辑结构化表单、PDF/Word 导出
- 自动改写远程简历、投递、爬取 Boss
- 会话 SQLite 持久化（首期内存即可；关窗可丢）
- 可配置「排除某些仓库」UI（后续优化）
- 写入 Git / 执行仓库命令（只读）

---

## §1 入口与子窗壳

### 设置

- `SettingsCategory` 增加 `jinglv`
- 导航项放在「通用」附近（建议「通用」之上或之下），图标 lucide（如 `FileUser`）
- **点击导航即** `openJinglvWindow()`；已存在则 show + focus
- 右侧区块：一行说明 + 「打开简历帮」按钮（与点击 nav 同效）

### 子窗

| 项 | 值 |
|----|-----|
| Service | `src/services/window/jinglvWindow.ts` |
| Label | 单例 `jinglv` |
| URL | `/jinglv`（无需 projectId） |
| 尺寸 | 约 880×640，min 720×480 |
| 壳 | `titleBarStyle: overlay`，与分支管理一致 |
| Page | `JinglvPage` → `JinglvWorkspace` |
| Capability | `jinglv.json`，`windows: ["jinglv"]`，最小只读 + 必要插件 |

### 窗内布局

```
┌─────────────────────────────┐
│ 简历帮                       │
├─────────────────────────────┤
│ Agent 消息列表（虚拟滚动）    │
│ …对话 / 简历 Markdown…       │
├─────────────────────────────┤
│ 输入区（复用 Composer 形态）  │
└─────────────────────────────┘
```

首屏：画像加载完成后，由助手发出开场白，追问联系方式与 Git 身份；后续聚焦项目经历。

---

## §2 Git 画像汇总（只读）

### 数据来源

- 项目列表：`projectService.list()`
- 每仓只读汇总（新建 Rust Command 或复用现有 `git_log` 等，**禁止 shell 拼接**）：

每项目建议字段（可截断）：

| 字段 | 说明 |
|------|------|
| name / path | 展示名与路径（路径仅 Rust 侧用，注入模型时尽量用相对/脱敏） |
| firstCommitAt / lastCommitAt | 全库最早/最晚提交时间（`--reverse` / 默认 log） |
| commitCountHint | 可选：总提交数或抽样上限内计数 |
| authorMatches | 待用户提供 Git 名/邮箱后，按 author 过滤的提交摘要（subject + 日期，限条数） |
| techStackHints | 启发式：根目录常见清单文件与顶层目录名（如 `package.json`/`Cargo.toml`/`pom.xml`、`src/`）→ 关键词列表，**不声称 100% 准确** |

### 执行策略（MVP）

- 打开子窗后后台并行汇总（限并发，如 3），失败仓标记错误不阻断其它仓
- 汇总结果进前端 store / workspace state，作为 system/context 注入
- 用户尚未给出 Git 身份时：先给「项目级时间线 + 技术栈线索」；拿到 Git 名/邮箱后再补「该作者提交摘要」
- 硬上限：每仓 log 抽样条数、注入 token 预算（截断 + 说明「已截断」）

### Command / Service

- 前端：`src/services/resume/`（或 `services/ai/ai.resume.ts` + `services/git` 薄封装）
- 新 Command 示例名：`git_resume_project_profile`（单仓）或批量由前端循环调用单仓
- 契约写入 `docs/architecture/command.md` + API 短文档

---

## §3 Agent 对话与 Prompt

### 复用与隔离

| 复用 | 隔离（新建） |
|------|----------------|
| 消息列表 / 气泡 / 复制按钮 / Composer 交互形态 | `streamJinglvReply` |
| `getAgentKey` / DeepSeek 流式传输模式 | `src/prompts/jinglv/`（与 `git/`、`agent/` 分域） |
| Markdown 渲染（`AgentRichMessage` 或等价） | `useJinglvStore`（不按 projectId，单会话即可） |

**禁止**：复用 `buildAgentSystemPrompt`、commit message prompt、仓库 Agent 的 compareBranches action 逻辑。

### 对话职责

1. 追问并确认：姓名、手机、邮箱、Git 名、Git 邮箱（不问目标岗位）  
2. 结合画像写清每个项目：做什么、技术栈、作者如何用技术解决问题  
3. 按用户要求撰写/改写以项目经历为主的 Markdown  
4. **规范检查**（回复中自检小节）：空话套话、过度夸大、与 Git 证据矛盾、缺联系方式、时间线不合理等；发现问题先指出再改  

### 文风（防 AI 腔）

- 少用「赋能 / 闭环 / 全方位 / 深度参与」等空词  
- 经历条目尽量：场景 + 动作 + 结果（能量化则量化，无数据不编造）  
- 技术栈只写有文件/提交线索支撑的；不确定标「根据仓库结构推测」  
- 输出结构优先：基本信息、项目经历（多仓）、技术栈汇总；不写目标岗位；不强制 Boss JSON  

### 开场

画像 ready 后助手第一条消息：说明已扫描 N 个仓库，说明将聚焦项目经历，并询问姓名与 Git 身份。

---

## 错误与权限

- 无 API Key：提示去设置「鲸灵」配置，不阻塞打开窗  
- 单仓 Git 失败：列表中显示失败，对话上下文注明跳过  
- 永不执行写操作；日志不打印 Key / 手机号全文（可打码）

## 验收（MVP）

1. 设置出现「简历帮」，点击打开子窗；再点聚焦同一窗  
2. 窗内可对话；无 Key 时有明确错误提示  
3. 上下文包含多仓库画像摘要（可见于助手引用或首轮说明）  
4. 对话可产出一份 Markdown 简历，含基本信息 + 至少一段以项目为核心的经历（做什么 / 技术 / 解决问题）  
5. 与鲸灵侧栏会话互不影响；不改动 commit 生成 prompt  

## 后续优化（不在首期）

- 排除仓库、持久化会话、导出、右侧预览、作者自动聚类多邮箱合并  
