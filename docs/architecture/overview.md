# 架构总览

> **相关文档：** [frontend](frontend.md) · [tauri](tauri.md) · [git](git.md) · [database](database.md) · [command](command.md) · [AGENTS.md](../../AGENTS.md)

本文描述 JLGit 的**目标架构**：分层、数据流、边界与关键决策。实现进度见 [feature-list](../product/feature-list.md)。

---

## 为什么这样分层

桌面 Git 客户端同时触及：

- 高频 UI 交互（Vue）
- 系统能力（对话框、通知、FS）
- 外部进程（`git`）
- 本地持久化（项目列表、设置、AI 历史）

若 UI 直接调 Git 或拼 shell，会出现：注入风险、无法统一错误模型、无法替换执行后端、AI 改码时边界模糊。

因此采用严格单向依赖：

```
Vue UI
  → Router / View
    → Feature / Component
      ├─ Service（TS）→ Tauri Command → Rust → Git CLI / FS / SQLite
      └─ api（TS）→ Axios requestClient → 外部 HTTP
```

```mermaid
flowchart LR
  subgraph frontend [Frontend]
    P[Views]
    C[Components]
    S[Services]
    A[api / Axios]
    Z[Pinia]
    P --> C
    C --> S
    C --> A
    C --> Z
    S --> Z
    A --> Z
  end
  subgraph bridge [Bridge]
    CMD[Tauri Commands]
  end
  subgraph backend [Rust]
    G[Git Runner]
    FS[Path Guard]
    DB[(SQLite)]
  end
  subgraph http [External HTTP]
    NET[AI / Hosting]
  end
  S --> CMD --> G
  CMD --> FS
  CMD --> DB
  G --> CLI[git]
  A --> NET
```

---

## 各层职责

| 层 | 职责 | 不负责 |
|----|------|--------|
| **View** | 路由级布局、组合 Feature、页面级数据加载入口 | 解析 `git status` 文本 |
| **Feature / Component** | 展示与交互；调用 hooks / store / service / api | 直接 `invoke`、直接 `axios`、直接读盘 |
| **Hook** | 封装订阅与副作用（刷新 status、监听焦点） | 隐藏业务规则到「魔法」副作用 |
| **Store (Pinia)** | 会话级全局状态（当前仓库、UI 面板） | 永久真相（应落库的数据） |
| **Service** | 本地 IO 出口（Tauri `invoke`）；类型化请求/响应；错误归一 | UI 样式、外部 HTTP |
| **api** | 外部 HTTP 出口；复用 `requestClient` | Tauri IPC、拼 shell |
| **Tauri Command** | 稳定 IPC 契约；参数校验；调用 Rust 域逻辑 | 复杂 UI 决策 |
| **Rust 域模块** | Git 执行、路径安全、SQL、系统 API | Vue 状态形状 |
| **Git CLI** | 版本控制真相源 | 应用配置、窗口状态 |

前端分层展开：[frontend.md](frontend.md)  
Rust / 插件：[tauri.md](tauri.md)  
Git 执行模型：[git.md](git.md)

---

## 关键决策（ADR 风格）

### ADR-1：Git 通过系统 CLI，而非纯 libgit2 绑定

| | |
|--|--|
| **选择** | Rust 侧用参数数组调用本机 `git` |
| **原因** | 行为与用户本机 Git 一致（hooks、credential helper、配置）；实现面更小；易对照文档排查 |
| **备选** | 纯 `git2` / `gix`：无外部依赖，但配置/凭据/LFS 行为易与 CLI 分叉 |
| **代价** | 依赖本机安装 Git；需处理版本差异 |
| **扩展** | 未来可对热点路径引入库解析，但对外仍保持 Command 契约不变 |

### ADR-2：SQLite 存应用数据，不存 Git 对象

| | |
|--|--|
| **选择** | 项目、设置、收藏、工作区、AI 历史进 SQLite |
| **原因** | Git 对象已由 `.git` 管理；重复存储易不一致 |
| **备选** | 仅 JSON / Store：简单，但查询与迁移弱 |
| **详见** | [database.md](database.md) |

### ADR-3：双门面 IO（Service + api）

| | |
|--|--|
| **选择** | 本地能力经 `src/services/*` → Tauri `invoke`；外部 HTTP 经 `src/api/*` → Axios `requestClient`（`src/utils/http/`） |
| **原因** | 统一错误、日志、类型；页面不散落 `invoke` / `axios.create`；对齐 work-center-web |
| **代价** | 多一层薄封装（可接受） |

### ADR-4：Pinia 唯一全局状态方案

| | |
|--|--|
| **选择** | 不用第二套全局状态库；目录名固定 `src/store` |
| **原因** | 与 Vue 3 官方生态一致，对齐 work-center-web；API 小、心智负担低 |
| **详见** | [state-management](../development/state-management.md) |

### ADR-5：目标架构文档先行

| | |
|--|--|
| **选择** | 文档描述目标形态；用 Feature List 跟踪 Done |
| **原因** | 脚手架阶段即可约束 AI 与贡献者，避免分叉实现 |

---

## 数据流示例：查看仓库 Status

```mermaid
sequenceDiagram
  participant U as UI
  participant S as GitService
  participant C as git_status
  participant R as Git Runner
  participant G as git
  U->>S: getStatus(repoPath)
  S->>C: invoke
  C->>C: validate path
  C->>R: status(repo)
  R->>G: git status --porcelain=v2 -b
  G-->>R: stdout
  R-->>C: typed DTO
  C-->>S: GitStatusResult
  S-->>U: 更新 Store / 渲染
```

错误在任一环失败时：Rust 返回 `{ code, message }` → Service 转为领域错误 → UI toast / 内联提示。  
错误码约定见 [command.md](command.md)。

---

## 前端状态 vs 持久化

```
Local State     组件内瞬时 UI（输入框、悬停）
     ↓
Pinia           当前仓库、选中文件、面板开关（会话）
     ↓
SQLite          项目列表、设置、收藏、AI 历史（跨启动）
```

Git 工作区内容**不以** SQLite 为真相源；每次以 Git 查询为准，Store 只做缓存。

---

## 安全与性能在架构中的位置

- **安全**：路径校验与 Git 参数化集中在 Rust；capabilities 最小开放。见 [security](../development/security.md)
- **性能**：大列表虚拟化在前端；重 Git 操作可后续迁入异步/队列，不改变 Service 契约。见 [performance](../development/performance.md)

---

## 未来扩展点（不改主干）

| 能力 | 挂载点 |
|------|--------|
| AI | `services/ai` + 可选 Rust 代理；见 [ai](../product/ai.md) |
| 插件 | Command 注册表 + 能力清单（v1 后） |
| GitHub/GitLab/Gitea/Gitee | `services/hosting/*`，UI 经同一仓库上下文 |
| 多窗口 | Tauri 多 Window + 按窗口 Store 切片 |
| Cloud Sync | 同步「应用数据」表，不同步 `.git` |

扩展原则：**加模块，不改调用方向**。

---

## 与代码目录的映射

| 架构层 | 目录 |
|--------|------|
| Views / Layouts | `src/views`、`src/layouts` |
| Components | `src/components/**` |
| Services | `src/services/**` |
| HTTP api | `src/api/**`、`src/utils/http/**` |
| Store | `src/store/**` |
| Commands | `src-tauri/src/commands/**` |
| Git Runner | `src-tauri/src/git/**` |
| DB | `src-tauri/src/db/**` + migrations |

目录细则：[project-structure](../development/project-structure.md)
