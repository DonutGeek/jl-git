# AGENTS.md — JLGit 项目宪法

> 本文是 AI Agent 与人类贡献者的**硬性约束**。细节以下沉文档为唯一真相源；此处只保留不可违反的边界与索引。
>
> 语言：中文。架构立场：目标架构（非仅描述当前脚手架）。

---

## 1. 项目哲学

JLGit 是基于 **Tauri 2 + React + TypeScript** 的现代 Git 桌面客户端。

我们追求：

- **专注**：只做好本地 Git 工作流，不做 IDE、不做全能 DevOps 控制台
- **克制**：能用简单方案就不用复杂方案；不为「以后可能」提前造轮子
- **可预测**：约定优于配置；边界显式；类型完整
- **可扩展**：分层清晰，使 AI、插件、多托管平台可在不拆主干的前提下接入

产品对标体验：**GitHub Desktop / SourceGit / Linear / VS Code** 的克制与速度，而非视觉炫技。

完整愿景与阶段见 [docs/product/roadmap.md](docs/product/roadmap.md)。

### 鲸灵宿主（对内术语）

| 说法 | 含义 |
|------|------|
| **单仓鲸灵** | 主窗；仅当前项目上下文（`host: "project"`） |
| **多仓鲸灵** | 子窗；可访问已登记多仓，首期只读画像 + 插件（`host: "global"`） |

二者是**同一套 Agent**，产品名都叫鲸灵；简历是插件之一。详见 [统一鲸灵设计](docs/superpowers/specs/2026-07-21-unified-jingling-agent-design.md) 与 [product/ai](docs/product/ai.md)。

---

## 2. 技术栈

| 层 | 选型 | 说明 |
|----|------|------|
| Desktop | Tauri 2 | 系统能力、Git CLI、FS、SQLite |
| UI | React 19 + TypeScript（strict） | 函数组件 + Hooks |
| 构建 | Vite | 前端打包 |
| 样式 | Tailwind CSS 4 + CSS Variables | 禁止硬编码颜色 |
| 组件 | [shadcn/ui](https://ui.shadcn.com/) + lucide-react | **仅**经官方 CLI `pnpm dlx shadcn@latest add <name>`（更新用 `--overwrite`）写入 `src/components/ui/`；**禁止**人工修改该目录任何文件。业务只组合引用。**UI 图标**仅 lucide；工作区文件类型图标例外：`material-icon-theme`。**面板主滚动**必须用 `@/components/ui/scroll-area`（见 §15）。细则见 [ui-guidelines](docs/development/ui-guidelines.md) |
| 状态 | Zustand | 唯一全局状态方案 |
| 路由 | React Router | 见 routing 文档 |
| 表单 | React Hook Form + Zod | 校验与提交 |
| 持久化 | SQLite（业务）+ Tauri Store（轻量偏好） | 见 database 文档 |
| i18n | i18next + react-i18next | 文案不写死在组件里（产品文案） |

选型理由与边界见 [docs/architecture/overview.md](docs/architecture/overview.md)。

---

## 3. 架构一句话

```
React → Router → Page → Feature/Component → Service → Tauri Command → Rust → Git CLI / FS / SQLite
```

- **UI 永不直接执行 Git**，永不直接拼 shell
- **Service 是前端唯一出口**；Command 是 Rust 唯一入口
- **SQLite 存应用数据**；Git 对象仍由 Git 管理

分层职责：[docs/architecture/overview.md](docs/architecture/overview.md)

---

## 4. 开发原则

1. **Keep It Simple** — 优先简单可读方案
2. **Readability First** — 命名清晰，函数单一职责
3. **Modular Design** — 模块边界清晰，文件不宜膨胀（组件建议 ≤ 300 行）
4. **Strong Typing** — 禁止 `any`；`unknown` 仅在边界解析后立即收窄
5. **No Duplicate** — 重复超过两次必须抽象到 hooks / utils / services
6. **Composition over Inheritance** — React 用组合
7. **Explicit over Implicit** — 副作用、权限、路径校验必须显式
8. **Convention over Configuration** — 目录与命名遵循本文与 structure 文档
9. **YAGNI** — 不为未排期功能预埋复杂抽象

---

## 5. 目录与命名（摘要）

目标前端结构（细节与归属规则见 [project-structure](docs/development/project-structure.md)）：

```
src/
├── assets/
├── components/     # common | git | layout | project | ui
├── hooks/
├── layouts/
├── pages/
├── router/
├── services/       # git | project | settings | notification | theme | ai
├── store/
├── design/         # Design Tokens / 主题 CSS / Monaco 桥接
├── types/
├── utils/
└── main.tsx
```

| 类别 | 约定 | 示例 |
|------|------|------|
| 组件 | PascalCase | `ProjectCard` |
| Hook | `use` + PascalCase | `useGitStatus` |
| Store | `use` + Domain + `Store` | `useProjectStore` |
| Service 文件 | domain 分段 | `git.status.ts` |
| Utils | camelCase 动词短语 | `formatDate` |
| 类型 | PascalCase | `GitStatusResult` |
| 常量 | UPPER_SNAKE 或 `as const` 对象 | `MAX_RECENT_PROJECTS` |
| Rust 模块 | snake_case | `commands/git_status.rs` |

---

## 6. TypeScript 硬规则

- `strict: true`
- 禁止 `any`；禁止无必要的 `as` 断言
- 公共数据结构必须有 `interface` / `type`，放在 `src/types` 或就近 feature 类型文件
- 函数返回值在非显然处显式标注
- 错误类型在边界处规范化（见 Error Handling）

细则：[docs/development/coding-style.md](docs/development/coding-style.md)

---

## 7. React 硬规则

- 仅函数组件 + Hooks
- 禁止 Class Component
- 避免无意义的 `useMemo` / `useCallback`（有实测瓶颈再加）
- 避免深层 Props Drilling；跨树状态进 Zustand
- 列表大数据必须考虑虚拟滚动（见 performance）
- Props 必须定义 Interface

---

## 8. Rust 硬规则

- Command 按域拆分模块，禁止巨型 `lib.rs`
- 所有路径入参必须校验（存在性、是否在允许根下、规范化）
- **禁止**把用户字符串当 shell 脚本执行；Git 使用参数数组调用
- 错误用可序列化结构返回前端（code + message），不泄漏内部路径细节到无害场景外
- 文件系统与 Git 操作只在 Rust 侧

详见：[docs/architecture/tauri.md](docs/architecture/tauri.md)、[docs/development/security.md](docs/development/security.md)

---

## 9. Git Service 架构

```
UI / Hook → src/services/git/* → invoke(command) → Rust git_* → git CLI
```

- 前端 Git 逻辑只存在于 `src/services/git`
- 每个能力一个文件：`git.status.ts`、`git.branch.ts`、`git.commit.ts`…
- Command 清单与契约：[docs/architecture/command.md](docs/architecture/command.md)
- 执行模型与解析策略：[docs/architecture/git.md](docs/architecture/git.md)
- 前端 Service API：[docs/api/git.md](docs/api/git.md)

---

## 10. 状态管理

优先级：

```
Local State → Zustand → SQLite
```

- 全局状态只放 `src/store`，只用 Zustand
- UI 瞬时状态用 `useState` / `useReducer`
- 需要跨启动持久化的业务数据进 SQLite
- 轻量偏好（窗口、主题键）可用 Tauri Store

详见：[docs/development/state-management.md](docs/development/state-management.md)

---

## 11. Import 顺序

```
1. React
2. 第三方库
3. Components
4. Hooks
5. Store
6. Services / Utils
7. Types
8. Styles
```

组与组之间空一行。

---

## 12. Error Handling

- 所有 Promise / `invoke` 必须处理失败
- Service 层捕获并转换为领域错误；UI 用 toast / 内联提示展示
- 禁止空 `catch`
- 日志：开发期 `console` + Tauri log plugin；生产避免刷屏敏感信息

---

## 13. Logging

- 前端：关键用户操作与失败路径打日志；禁止记录 token / 私钥 / `.env`
- Rust：`tauri-plugin-log`；Git 命令记录**命令名与安全参数**，不记录凭据
- 日志级别可配置（settings）

---

## 14. 依赖策略

- 不引入与现有能力重复的库
- 新增依赖需说明：解决的问题、体积/许可、是否有更轻替代
- 禁止混用多个**UI**图标库、多个状态库、多个 UI 体系（文件类型图标仅允许 `material-icon-theme`）
- 锁文件（`pnpm-lock.yaml` / `Cargo.lock`）必须提交

---

## 15. UI / Theme

- 风格关键词：Minimal、Professional、Developer-first、Fast、Clean
- 颜色 / 圆角 / 阴影只用 Design Tokens（CSS Variables）
- 必须支持 Light / Dark
- 图标：UI 仅 `lucide-react`；工作区文件类型图标用 `material-icon-theme`（禁止再用 lucide 冒充文件类型）
- **`src/components/ui/`（硬性）**：只允许 shadcn **官方 CLI** 引入或覆盖生成；**永远不要**手工编辑、局部打补丁或在该目录新增非官方文件。业务组件放 `components/common` / 各域目录，**组合** `@/components/ui/*`，不复制、不改写 ui 源码
- **滚动区域（硬性）**：面板 / 列表 / 侧栏等**主滚动容器**必须使用 shadcn `@/components/ui/scroll-area`；**禁止**以裸 `overflow-auto` / `overflow-x-auto` / `overflow-y-auto` 作为交付用的主滚动方案（调试对照除外）。滚动条默认悬停/滚动时显示（不设 `type="always"`）。大列表另须虚拟滚动，见 §16 与 [performance](docs/development/performance.md)。细则见 [ui-guidelines](docs/development/ui-guidelines.md)

详见：[docs/development/theme.md](docs/development/theme.md)、[docs/development/ui-guidelines.md](docs/development/ui-guidelines.md)

---

## 16. Performance

目标（指导值，非营销口号）：

| 指标 | 目标 |
|------|------|
| 冷启动至可交互 | ≤ 2s（典型机器） |
| 打开已索引仓库至 Status 可见 | ≤ 500ms（中小仓库） |
| 大列表（提交/文件） | 虚拟滚动 |
| Diff 大文件 | 懒加载 / 截断策略 |

规则：先测量再优化；避免多余渲染。详见 [performance](docs/development/performance.md)。

---

## 17. Security

- 永不执行任意用户 shell
- 校验并规范化文件系统路径
- Git 参数数组化，防注入
- 最小权限：Tauri capabilities 按需开放
- 用户输入展示时注意 XSS（Markdown 渲染需消毒策略）

详见：[docs/development/security.md](docs/development/security.md)

---

## 18. Accessibility

- 交互控件必须可键盘到达
- 图标按钮提供 `aria-label`，**且**悬停提供 Tooltip（见 [ui-guidelines](docs/development/ui-guidelines.md)「用户体验硬规则」）
- 焦点环可见；对比度满足常规阅读
- 对话框遵循焦点陷阱与 Esc 关闭
- 空状态、加载态、点击/悬停反馈为体验必选项，不是锦上添花

---

## 19. Internationalization

- 用户可见文案走 i18n 资源，不硬编码中文/英文在业务组件中（品牌名 `JLGit` 除外）
- 默认提供 `zh-CN`；`en` 作为第二语言预留
- 文案资源按语言分目录、按域分文件：`src/i18n/locales/<lng>/<domain>.json`（禁止把全部文案堆进单一大 JSON）
- 日期/相对时间用统一工具（如 dayjs + locale）

---

## 20. Git 工作流（本仓库）

- 主分支：`main`
- 功能分支：`feat/<topic>`、`fix/<topic>`、`docs/<topic>`
- PR 需通过类型检查与约定检查（见 CONTRIBUTING）
- 不强制 push；不改他人 git config

贡献流程：[CONTRIBUTING.md](CONTRIBUTING.md)

---

## 21. Commit 约定

[Conventional Commits](https://www.conventionalcommits.org/)：

```
feat|fix|refactor|style|docs|test|perf|build|ci|chore(scope): summary
```

示例：

```
feat(project): 添加本地仓库导入
fix(diff): 修复二进制文件误判为文本
docs(architecture): 补充 Git 命令执行模型
```

---

## 22. AI Coding Rules

AI 修改代码时必须：

1. 遵守本文与所链文档，不发明第二套架构
2. 保持现有风格；不无关重构
3. 不修改未请求的功能与文件
4. 优先复用已有组件 / hooks / services
5. 保持 TypeScript 类型完整
6. 不引入不必要依赖
7. 改动范围尽可能小
8. 新文件放入正确目录
9. 注释使用中文，且仅解释非显然逻辑
10. 涉及 Git/FS/安全时先读 security 与 git 架构文档
11. **写完必须自检**（见 [quality](docs/development/quality.md)）：至少 `tsc` + 相关冒烟；不得把 S0/S1 留给用户发现
12. 向用户声称完成前，按 quality 文档的 Bug 级别自查；已知未修问题须标明级别
13. **禁止**编辑 `src/components/ui/`；缺组件时只走官方 `pnpm dlx shadcn@latest add <name>`（见 §15 / Never Rules）

---

## 23. Definition of Done

一项改动在合并前应满足：

- [ ] 类型检查通过（`tsc` / 项目脚本）
- [ ] 无新增 `any` / 空 catch / 硬编码色值
- [ ] UI 走 Service，不直连 `invoke`（除非文档允许的薄封装层）
- [ ] 错误可被用户感知或已记录
- [ ] 必要文档已更新（命令/API/功能状态）
- [ ] Commit message 符合约定
- [ ] 未引入与范围无关的格式化大爆炸
- [ ] **质量自检通过**：无已知 **S0/S1**；运行时冒烟已做（见 [quality](docs/development/quality.md)）
- [ ] 若残留 **S2+**，PR/回复中写明级别、现象与是否阻塞验收

---

## 24. Never Rules

**永远不要：**

1. 在前端用用户输入拼接 shell
2. 在 Rust 用 `shell: true` 或等价方式执行未校验命令
3. 把 Git 凭据写入日志、文档或示例
4. 提交密钥、`.env`、私钥、updater 私钥
5. 引入第二套全局状态库
6. 在组件内直接 `invoke` 散落调用（应经 Service）
7. 硬编码颜色 / 绕过 Design Tokens
8. 使用 `any` 掩盖类型问题
9. 为未排期功能大规模预埋抽象
10. 在文档中留 TODO / 占位假内容冒充完成
11. 带着 **S0/S1**（崩溃、无限重渲染、核心路径不可用）声称完成或请用户验收
12. 只跑类型检查、不跑与改动相关的运行时冒烟就交付
13. 用裸 `overflow-*-auto` 替代 shadcn `ScrollArea` 作为面板主滚动交付方案
14. **手工修改** `src/components/ui/` 下任何文件（含「顺手修样式」）；该目录只允许官方 `pnpm dlx shadcn@latest add …` 引入/覆盖

---

## 25. 文档索引

| 文档 | 职责 |
|------|------|
| [README.md](README.md) | 人类入口 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 贡献指南 |
| [CHANGELOG.md](CHANGELOG.md) | 已发布变更 |
| [architecture/overview](docs/architecture/overview.md) | 总架构 |
| [architecture/frontend](docs/architecture/frontend.md) | 前端分层 |
| [architecture/tauri](docs/architecture/tauri.md) | Tauri / Rust |
| [architecture/git](docs/architecture/git.md) | Git 执行模型 |
| [architecture/database](docs/architecture/database.md) | SQLite |
| [architecture/command](docs/architecture/command.md) | Command 清单 |
| [development/coding-style](docs/development/coding-style.md) | 编码风格 |
| [development/state-management](docs/development/state-management.md) | 状态 |
| [development/routing](docs/development/routing.md) | 路由 |
| [development/theme](docs/development/theme.md) | 主题与 Tokens（实现目录：`src/design/`） |
| [development/ui-guidelines](docs/development/ui-guidelines.md) | UI 规范 |
| [development/project-structure](docs/development/project-structure.md) | 目录结构 |
| [development/performance](docs/development/performance.md) | 性能 |
| [development/security](docs/development/security.md) | 安全 |
| [development/testing](docs/development/testing.md) | 测试 |
| [development/quality](docs/development/quality.md) | Bug 分级与写完自检 |
| [product/feature-list](docs/product/feature-list.md) | 功能状态 |
| [product/roadmap](docs/product/roadmap.md) | 路线图 |
| [product/releases](docs/product/releases.md) | 发布规范 |
| [product/ai](docs/product/ai.md) | AI 能力（单仓/多仓鲸灵） |
| [统一鲸灵设计](docs/superpowers/specs/2026-07-21-unified-jingling-agent-design.md) | AgentHost、插件壳、会话分桶 |
| [api/project](docs/api/project.md) | ProjectService |
| [api/git](docs/api/git.md) | GitService |
| [api/settings](docs/api/settings.md) | SettingsService |
| [api/notification](docs/api/notification.md) | NotificationService |

---

## 26. 最终标准

JLGit 必须保持：**简洁、高性能、易维护、易扩展、面向开发者、专注 Git 工作流**。

任何功能若显著增加复杂度却无明确用户价值，应拒绝或推迟。
