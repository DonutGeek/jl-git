# AGENTS.md — JLGit 项目宪法

> 本文是 AI Agent 与人类贡献者的**硬性约束**。细节以下沉文档为唯一真相源；此处只保留不可违反的边界与索引。
>
> 语言：中文。架构立场：目标架构（非仅描述当前脚手架）。
>
> 前端工程化（目录、命名、组合式分层、antdv-next 局部导入、Axios HTTP）对齐 **work-center-web** 的约定；桌面 Git / FS / SQLite 仍走 Tauri Command，前端一律经 `src/api/` + `requestClient`。

---

## 1. 项目哲学

JLGit 是基于 **Tauri 2 + Vue 3 + TypeScript** 的现代 Git 桌面客户端。

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
| UI | Vue 3（`<script setup>`）+ TypeScript（strict） | 组合式 API；`defineOptions` 声明组件名 |
| 构建 | Vite + `@vitejs/plugin-vue` | 前端打包 |
| 样式 | Tailwind CSS 4 + CSS Variables | 禁止硬编码颜色；全局样式与组件库覆盖在 `src/design/` |
| 组件 | [antdv-next](https://www.antdv-next.com/) | **硬性**：能用 antdv-next 就尽量用；**禁止** `app.use()` 全局注册；必须在实际使用的 `.vue` 中局部导入，模板用 PascalCase。**禁止**引入 `ant-design-vue`。细则见 [ui-guidelines](docs/development/ui-guidelines.md) |
| 图标 | `@/components/Icon`（内部 `morphicons` + `lucide` 数据）+ `material-icon-theme` | UI 图标只能通过 `@/components/Icon`；页面/布局不得直接导入 Lucide / morphicons。工作区文件类型图标用 `material-icon-theme`，禁止用 Lucide 冒充文件类型 |
| 状态 | Pinia（+ 可选 persist 插件） | 唯一全局状态方案；目录名固定为单数 `src/store` |
| 路由 | Vue Router | 见 routing 文档 |
| 表单 | antdv-next Form + rules | 校验与提交 |
| 组合式 | `@vueuse/core`；通用工具优先 `lodash-es` | 禁止手写已有库函数的弱化版 |
| HTTP | Axios | 封装在 `src/utils/http/`（Vben2 `RequestClient`）；本地 Command 与外部 HTTP 都走 `requestClient`；接口函数放 `src/api/`；页面不得临时 `axios.create` |
| 持久化 | SQLite（业务）+ Tauri Store（轻量偏好） | 见 database 文档 |
| i18n | vue-i18n | 文案不写死在组件里（产品文案）；资源在 `src/locales/` |

选型理由与边界见 [docs/architecture/overview.md](docs/architecture/overview.md)。

---

## 3. 架构一句话

```
Vue → Router → View → Feature/Component
  ├─ api → Axios requestClient（小驼峰地址）→ Tauri Command → Rust
  └─ api → Axios requestClient（https URL）→ 外部 HTTP
```

- **UI 永不直接执行 Git**，永不直接拼 shell
- **本地 Command 与外部 HTTP 都只在 `src/api/` 用 `requestClient` 声明**；禁止再包一层 1:1 的 `services` / `invokeCommand`
- Command 是 Rust 唯一入口；页面不得直接 `invoke`，也不得临时创建 Axios 实例
- **SQLite 存应用数据**；Git 对象仍由 Git 管理
- 非接口的东西（写 `document`、开子窗、Agent 循环）放 `hooks/` / `utils/`，不要塞进 `api/` 冒充接口

分层职责：[docs/architecture/overview.md](docs/architecture/overview.md)

---

## 4. 开发原则

1. **Keep It Simple** — 优先简单可读方案
2. **Readability First** — 命名清晰，函数单一职责
3. **Modular Design** — 模块边界清晰，文件不宜膨胀（组件建议 ≤ 300 行）
4. **Strong Typing** — 禁止 `any`；`unknown` 仅在边界解析后立即收窄
5. **No Duplicate** — 重复超过两次必须抽象到 hooks / utils / services / api
6. **Composition over Inheritance** — Vue 用组合式 API
7. **Explicit over Implicit** — 副作用、权限、路径校验必须显式
8. **Convention over Configuration** — 目录与命名遵循本文与 structure 文档
9. **YAGNI** — 不为未排期功能预埋复杂抽象（不引入 work-center 的 VxeTable / 权限指令，除非产品明确需要）

---

## 5. 目录与命名（摘要）

目标前端结构对齐 work-center-web（细节与归属规则见 [project-structure](docs/development/project-structure.md)）：

```
src/
├── assets/
├── components/   # 可复用、非页面级；公开入口 index.ts，实现放 src/
├── design/       # Design Tokens / Tailwind 入口 / 组件库覆盖 / Monaco 桥接
├── hooks/        # 应用级组合式；按 setting / web / core / event / component 分层
├── layouts/      # default（header/footer/content/sider/setting/feature）+ page + iframe
├── locales/      # vue-i18n 初始化与 JSON 文案
├── api/          # 后端接口：本地 Command + 外部 HTTP，均走 requestClient
├── router/       # 实例、routes/modules、guard、helper、types
├── store/        # Pinia 实例、plugin/、modules/；目录名固定单数
├── types/
├── utils/
├── views/        # 路由级页面（camelCase 目录 + index.vue + 就近分层）
├── App.vue
└── main.ts
```

| 类别 | 约定 | 示例 |
|------|------|------|
| 路由页目录 | camelCase | `views/dashboard/` |
| 路由页文件 | `index.vue` | `views/repo/index.vue` |
| 组件名 | PascalCase + `defineOptions` | `defineOptions({ name: 'RepoPage' })` |
| 可复用组件目录 | PascalCase，`index.ts` + `src/` | `components/Git/` |
| 页面私有组件 | `views/<module>/components/Xxx.vue` | `views/tasks/components/TaskFormModal.vue` |
| 应用级 Hook | `hooks/<layer>/useXxx.ts` | `hooks/setting/useTheme.ts` |
| 页面私有 Hook | `views/<module>/hooks/useXxx.ts` | `views/repo/hooks/useGitStatus.ts` |
| Store 文件 | 域名词，禁止 `use` 前缀 | `store/modules/locale.ts` |
| Store 导出 | `useXxxStore`；setup 外用 `useXxxStoreWithOut()` | `useLocaleStore` |
| Service 文件 | domain 分段 | `git.status.ts` |
| API 文件 | 域名词 | `src/api/project.ts`、`src/api/deepseek.ts` |
| Utils | camelCase 动词短语 | `formatDate` |
| 类型 | PascalCase | `GitStatusResult` |
| 路由 name | lowerCamelCase | `repoStatus` |
| 路由 path | kebab-case | `/repo/:project-id/status` |
| 常量 | UPPER_SNAKE 或 `as const` 对象 | `MAX_RECENT_PROJECTS` |
| Rust 模块 | snake_case | `commands/git_status.rs` |

---

## 6. TypeScript 硬规则

- `strict: true`
- 禁止 `any`；禁止无必要的 `as` 断言
- 公共数据结构必须有 `interface` / `type`，放在 `src/types` 或就近 feature 类型文件
- 函数返回值在非显然处显式标注
- 错误类型在边界处规范化（见 Error Handling）
- `src` 内模块优先 `@/`；类型导入使用 `import type`

细则：[docs/development/coding-style.md](docs/development/coding-style.md)

---

## 7. Vue 硬规则

- 仅 `<script setup lang="ts">` + 组合式 API；禁止 Options API / Class 组件
- 每个 `.vue` 必须 `defineOptions({ name: 'Xxx' })`
- 避免无意义的 `computed` / `watch`（有实测瓶颈再加）
- 避免深层 Props 透传；跨树状态进 Pinia
- 列表大数据必须考虑虚拟滚动（见 performance）
- Props 必须用 `defineProps` + 类型（`interface` / type）
- 通用副作用优先 `@vueuse/core`；数组/对象/深拷贝优先 `lodash-es`
- **弹窗表单自己管开合**：`defineExpose({ open })`，父组件 `ref.open(payload)`；禁止外绑 `:open` / `mode`。二次确认走 `useModal().confirm()`。细则见 [ui-guidelines](docs/development/ui-guidelines.md)

---

## 8. Rust 硬规则

- Command 按域拆分模块，禁止巨型 `lib.rs`
- 所有路径入参必须校验（存在性、是否在允许根下、规范化）
- **禁止**把用户字符串当 shell 脚本执行；Git 使用参数数组调用
- 错误用可序列化结构返回前端（code + message），不泄漏内部路径细节到无害场景外
- 文件系统与 Git 操作只在 Rust 侧

详见：[docs/architecture/tauri.md](docs/architecture/tauri.md)、[docs/development/security.md](docs/development/security.md)

---

## 9. Git API

```
UI / Hook / Store → src/api/git.ts → requestClient（小驼峰）→ Tauri Command → git CLI
```

- 前端 Git **接口**只存在于 `src/api/`（与 project / DeepSeek 同一写法）
- Command 清单与契约：[docs/architecture/command.md](docs/architecture/command.md)
- 执行模型与解析策略：[docs/architecture/git.md](docs/architecture/git.md)
- 前端 API：[docs/api/git.md](docs/api/git.md)

`src/services/git/` 是迁入 `api/` 之前的过渡，禁止再新增 1:1 `invokeCommand` 封装。

---

## 10. 状态管理

优先级：

```
Local State → Pinia → SQLite
```

- 全局状态只放 `src/store`，只用 Pinia；不得再创建 `src/stores/`
- Pinia 实例在 `src/store/index.ts` 经 `setupStore(app)` 注册
- UI 瞬时状态用组件 `ref` / `reactive`
- 需要跨启动持久化的业务数据进 SQLite
- 轻量偏好（窗口、主题键、语言）可用 persist 插件或 Tauri Store

详见：[docs/development/state-management.md](docs/development/state-management.md)

---

## 11. Import 顺序

```
1. vue / vue-router / pinia
2. 第三方库（antdv-next、@vueuse/core…）
3. Components
4. Hooks
5. Store
6. Api / Utils
7. Types
8. Styles
```

组与组之间空一行。类型导入使用 `import type`。

---

## 12. Error Handling

- 所有 Promise / `invoke` / Axios 请求必须处理失败
- Service / api 层捕获并转换为领域错误；UI 用 antdv-next `message` / `notification` 或内联提示展示
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
- 禁止混用多个 **UI** 图标库、多个状态库、多个 UI 体系（文件类型图标仅允许 `material-icon-theme`）
- 禁止同时存在 React 与 Vue 运行时作为产品 UI；迁移期间不得双栈交付
- 锁文件（`pnpm-lock.yaml` / `Cargo.lock`）必须提交
- JavaScript/TypeScript **只允许 pnpm**；Node 推荐版本见 `.nvmrc`（`24.14.0`），最低 `>=22.22.1`
- 提交前必须通过质量工具链：ESLint、Prettier、`pnpm check`；细则见 [code-quality-tooling](docs/development/code-quality-tooling.md)

---

## 15. UI / Theme

- 风格关键词：Minimal、Professional、Developer-first、Fast、Clean
- 颜色 / 圆角 / 阴影只用 Design Tokens（CSS Variables）；antdv-next 主题经 ConfigProvider / Design Token 接到同一套语义色
- 必须支持 Light / Dark
- 图标：UI 仅经 `@/components/Icon`（内部 morphicons + lucide 数据）；工作区文件类型图标用 `material-icon-theme`
- **antdv-next（硬性，AI 与人类同等）**：
  1. **能用 antdv-next 就尽量用**：官方有等价组件（按钮、输入、选择、弹窗、抽屉、表格、标签、卡片、菜单、排版、开关、Tooltip、**Form / FormItem / Row / Col**）时，禁止业务层手搓或退回原生控件冒充。业务表单必须 `Form` + `FormItem`，栅格用 `Row` / `Col`，禁止 `<form>` + `<label>` 手搓布局
  2. **局部导入**：在使用它的 `.vue` 中 `import { Button, Modal } from 'antdv-next'`，模板写 `<Button>`；**禁止** `app.use(Antd)`
  3. **禁止引入** `ant-design-vue` 或第二套 Ant Design Vue 实现
  4. 使用前查阅官方文档或已安装版本的类型声明，确认 props / events / slots / Design Token；不得靠记忆臆测 API
  5. 领域控件（Diff、提交图、文件树）放 `components/` 或 `views/*/components/`，不要伪造 antdv 没有的「官方组件」
- **滚动区域（硬性）**：面板 / 列表 / 侧栏等**主滚动容器**必须使用项目统一滚动封装（优先 antdv-next 已有滚动能力，或 `components/ScrollArea`）；**禁止**以裸 `overflow-auto` / `overflow-x-auto` / `overflow-y-auto` 作为交付用的主滚动方案（调试对照除外）。大列表另须虚拟滚动，见 §16 与 [performance](docs/development/performance.md)

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
- 纯图标按钮悬停提供 Tooltip（见 [ui-guidelines](docs/development/ui-guidelines.md)「用户体验硬规则」）
- 焦点环可见；对比度满足常规阅读
- 对话框遵循焦点陷阱与 Esc 关闭
- 空状态、加载态、点击/悬停反馈为体验必选项，不是锦上添花

---

## 19. Internationalization

- 用户可见文案走 i18n 资源，不硬编码中文/英文在业务组件中（品牌名 `JLGit` 除外）
- 默认提供 `zh-CN`；`en` 作为第二语言预留
- 文案资源：`src/locales/lang/<lng>/<domain>.json`（禁止把全部文案堆进单一大 JSON）
- 页面、布局、菜单与路由 `meta.title` 不得硬编码展示文案
- 日期/相对时间用统一工具（dayjs + locale），与 `setLocale()` 同步

---

## 20. Git 工作流（本仓库）

- 主分支：`main`
- 功能分支：`feat/<topic>`、`fix/<topic>`、`docs/<topic>`
- PR 需通过类型检查与约定检查
- 不强制 push；不改他人 git config

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
6. 不引入不必要依赖（含 VxeTable、第二套 UI 库）；HTTP 只用已约定的 Axios 封装
7. 改动范围尽可能小
8. 新文件放入正确目录（`views/` 就近分层，可复用组件进 `components/`）
9. 注释使用中文，且仅解释非显然逻辑
10. 涉及 Git/FS/安全时先读 security 与 git 架构文档
11. **写完必须自检**（见 [quality](docs/development/quality.md)）：至少 `pnpm check` + 相关冒烟；不得把 S0/S1 留给用户发现
12. 向用户声称完成前，按 quality 文档的 Bug 级别自查；已知未修问题须标明级别
13. **antdv-next 硬性**：能用官方组件就局部导入使用；禁止 `app.use()`；禁止引入 `ant-design-vue`（见 §15 / Never Rules）

---

## 23. Definition of Done

一项改动在合并前应满足：

- [ ] **`pnpm check` 通过**（lint + format + typecheck）
- [ ] 无新增 `any` / 空 catch / 硬编码色值
- [ ] UI 走 `src/api/`，不直连 `invoke`
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
6. 在组件内直接 `invoke` 散落调用（应经 `src/api/`）
7. 硬编码颜色 / 绕过 Design Tokens
8. 使用 `any` 掩盖类型问题
9. 为未排期功能大规模预埋抽象
10. 在文档中留 TODO / 占位假内容冒充完成
11. 带着 **S0/S1**（崩溃、无限重渲染、核心路径不可用）声称完成或请用户验收
12. 只跑类型检查、不跑与改动相关的运行时冒烟就交付
13. 用裸 `overflow-*-auto` 替代统一滚动封装作为面板主滚动交付方案
14. **`app.use()` 全局注册 antdv-next**，或引入 `ant-design-vue` / 第二套 Ant Design Vue
15. 在页面或布局中直接 `import` Lucide / morphicons（必须经 `@/components/Icon`）
16. 把页面私有 `useXxx` / 工具函数堆在 `views/<module>/` 根目录（必须进 `hooks/` / `utils/`）
17. 在页面或组件里临时 `axios.create` / 直接 `axios.get`；HTTP 必须走 `src/api/` + `requestClient`

---

## 25. 文档索引

| 文档 | 职责 |
|------|------|
| [README.md](README.md) | 人类入口 |
| [architecture/overview](docs/architecture/overview.md) | 总架构 |
| [architecture/frontend](docs/architecture/frontend.md) | 前端分层 |
| [architecture/tauri](docs/architecture/tauri.md) | Tauri / Rust |
| [architecture/git](docs/architecture/git.md) | Git 执行模型 |
| [architecture/database](docs/architecture/database.md) | SQLite |
| [architecture/command](docs/architecture/command.md) | Command 清单 |
| [development/coding-style](docs/development/coding-style.md) | 编码风格 |
| [development/code-quality-tooling](docs/development/code-quality-tooling.md) | ESLint / Prettier / 提交前检查 |
| [development/state-management](docs/development/state-management.md) | 状态 |
| [development/routing](docs/development/routing.md) | 路由 |
| [development/theme](docs/development/theme.md) | 主题与 Tokens（实现目录：`src/design/`） |
| [development/ui-guidelines](docs/development/ui-guidelines.md) | UI 规范 |
| [development/app-icon](docs/development/app-icon.md) | App 图标规格、品牌色与出图 Prompt |
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
